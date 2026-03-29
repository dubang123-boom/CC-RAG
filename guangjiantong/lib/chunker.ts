import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

export interface PDFEntry {
  filePath: string;
  fileName: string;
  category: string; // '法律' | '行政法规' | '规章' | '案例' | 'root'
  fileType: 'pdf' | 'md';
}

export interface Chunk {
  sourceFile: string;
  sourceCategory: string;
  articleNumber: string | null;
  chunkIndex: number;
  content: string;
}

const KNOWN_CATEGORIES = ['法律', '行政法规', '规章', '案例'];

/**
 * Recursively discover all PDFs under knowledge/ directory.
 * Returns entries with category derived from immediate subdirectory name.
 */
export function discoverPDFs(knowledgeDir: string): PDFEntry[] {
  const entries: PDFEntry[] = [];

  // Root-level PDFs
  for (const f of fs.readdirSync(knowledgeDir)) {
    const full = path.join(knowledgeDir, f);
    if (f.endsWith('.pdf') && fs.statSync(full).isFile()) {
      entries.push({ filePath: full, fileName: f, category: 'root', fileType: 'pdf' });
    }
  }

  // Subdirectory PDFs and Markdown files
  for (const cat of KNOWN_CATEGORIES) {
    const catDir = path.join(knowledgeDir, cat);
    if (!fs.existsSync(catDir) || !fs.statSync(catDir).isDirectory()) continue;
    for (const f of fs.readdirSync(catDir)) {
      const full = path.join(catDir, f);
      if (!fs.statSync(full).isFile()) continue;
      if (f.endsWith('.pdf')) {
        entries.push({ filePath: full, fileName: f, category: cat, fileType: 'pdf' });
      } else if (f.endsWith('.md')) {
        entries.push({ filePath: full, fileName: f, category: cat, fileType: 'md' });
      }
    }
  }

  return entries.sort((a, b) => a.fileName.localeCompare(b.fileName, 'zh'));
}

/**
 * Extract plain text from a PDF file.
 */
export async function extractPDFText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await pdfParse(buffer);
  return result.text;
}

/**
 * Read plain text from a Markdown file.
 */
export function extractMarkdownText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Chunk a court case .md file by ## sections.
 * Each section becomes a chunk with the case title prepended for context.
 * Long sections (>800 chars) are further split with fixed-size chunking.
 */
export function chunkCaseDocument(
  text: string,
  sourceFile: string,
  category: string
): Chunk[] {
  const chunks: Chunk[] = [];
  let idx = 0;

  // Extract case title (first # heading)
  const titleMatch = text.match(/^#\s+(.+)$/m);
  const caseTitle = titleMatch ? titleMatch[1].trim() : sourceFile.replace('.md', '');

  // Split by ## headings
  const sections = text.split(/(?=^## )/m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed.length < 10) continue;

    // Extract section heading
    const headingMatch = trimmed.match(/^##\s+(.+)$/m);
    const sectionName = headingMatch ? headingMatch[1].replace(/：$/, '') : null;

    // Skip 关联索引 section (just law references, already in our law knowledge base)
    if (sectionName === '关联索引') continue;

    // Use section name as articleNumber for structured retrieval
    const articleNumber = sectionName;

    // Prepend case title for context
    const contentWithContext = `【${caseTitle}】\n${trimmed}`;

    if (contentWithContext.length <= 1200) {
      chunks.push({
        sourceFile,
        sourceCategory: category,
        articleNumber,
        chunkIndex: idx++,
        content: contentWithContext,
      });
    } else {
      // Long section: split with fixed-size chunking, each sub-chunk gets title context
      const CHUNK_SIZE = 800;
      const OVERLAP = 100;
      let start = 0;
      while (start < contentWithContext.length) {
        const end = Math.min(start + CHUNK_SIZE, contentWithContext.length);
        const sub = contentWithContext.slice(start, end).trim();
        if (sub.length > 10) {
          chunks.push({
            sourceFile,
            sourceCategory: category,
            articleNumber,
            chunkIndex: idx++,
            content: sub,
          });
        }
        start += CHUNK_SIZE - OVERLAP;
      }
    }
  }

  return chunks;
}

// Match article headings like "第一条", "第九条", "第一百零三条" etc.
const ARTICLE_REGEX = /(?=\n(第[一二三四五六七八九十百千零]+条)\s)/;

// Match ordinal headings like "一、", "二、", "十二、" (used by 执法指南 style docs)
const ORDINAL_ARTICLE_REGEX = /(?=\n([一二三四五六七八九十]+)、)/;

const ORDINAL_MAP: Record<string, string> = {
  '一': '第一条', '二': '第二条', '三': '第三条', '四': '第四条',
  '五': '第五条', '六': '第六条', '七': '第七条', '八': '第八条',
  '九': '第九条', '十': '第十条', '十一': '第十一条', '十二': '第十二条',
  '十三': '第十三条', '十四': '第十四条', '十五': '第十五条',
};

/**
 * Convert ordinal heading (e.g. "一") to standard article format (e.g. "第一条").
 */
function ordinalToArticle(ordinal: string): string {
  return ORDINAL_MAP[ordinal] ?? `第${ordinal}条`;
}

/**
 * Try to split text by a given article regex pattern.
 * Returns articles array if >= 3 articles found, otherwise null.
 * mode: 'standard' for 第X条 format, 'ordinal' for 一、二、format.
 */
function tryArticleSplit(
  text: string,
  regex: RegExp,
  mode: 'standard' | 'ordinal'
): { articleNumber: string | null; content: string }[] | null {
  const headingPattern = mode === 'standard'
    ? /^第[一二三四五六七八九十百千零]+条$/
    : /^[一二三四五六七八九十]+$/;

  const parts = text.split(regex).filter(s => s.trim().length > 0);

  const articles: { articleNumber: string | null; content: string }[] = [];
  let i = 0;

  // Capture any preamble before the first article
  if (parts.length > 0 && !parts[0].match(headingPattern)) {
    articles.push({ articleNumber: null, content: parts[0].trim() });
    i = 1;
  }

  while (i < parts.length) {
    if (parts[i].match(headingPattern)) {
      const rawNum = parts[i];
      const articleNum = mode === 'ordinal' ? ordinalToArticle(rawNum) : rawNum;
      const body = i + 1 < parts.length ? parts[i + 1] : '';
      articles.push({
        articleNumber: articleNum,
        content: `${articleNum} ${body}`.trim(),
      });
      i += 2;
    } else {
      articles.push({ articleNumber: null, content: parts[i].trim() });
      i += 1;
    }
  }

  const articleCount = articles.filter(a => a.articleNumber !== null).length;
  return articleCount >= 3 ? articles : null;
}

/**
 * Split text into chunks:
 * - Level 1: split by 第X条 format
 * - Level 2: split by 一、二、ordinal format (converted to 第X条)
 * - Level 3: fixed-size 800 chars with 100 char overlap
 */
export function chunkText(
  text: string,
  sourceFile: string,
  category: string
): Chunk[] {
  // Level 1: try standard 第X条 splitting
  const standardArticles = tryArticleSplit(text, ARTICLE_REGEX, 'standard');
  if (standardArticles) {
    return standardArticles
      .filter(a => a.content.length > 10)
      .map((a, idx) => ({
        sourceFile,
        sourceCategory: category,
        articleNumber: a.articleNumber,
        chunkIndex: idx,
        content: a.content,
      }));
  }

  // Level 2: try ordinal 一、二、splitting
  const ordinalArticles = tryArticleSplit(text, ORDINAL_ARTICLE_REGEX, 'ordinal');
  if (ordinalArticles) {
    return ordinalArticles
      .filter(a => a.content.length > 10)
      .map((a, idx) => ({
        sourceFile,
        sourceCategory: category,
        articleNumber: a.articleNumber,
        chunkIndex: idx,
        content: a.content,
      }));
  }

  // Level 3: fixed-size chunking
  return fixedSizeChunk(text, sourceFile, category);
}

function fixedSizeChunk(
  text: string,
  sourceFile: string,
  category: string
): Chunk[] {
  const CHUNK_SIZE = 800;
  const OVERLAP = 100;
  const chunks: Chunk[] = [];
  let start = 0;
  let idx = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const content = text.slice(start, end).trim();
    if (content.length > 10) {
      chunks.push({
        sourceFile,
        sourceCategory: category,
        articleNumber: null,
        chunkIndex: idx,
        content,
      });
      idx++;
    }
    start += CHUNK_SIZE - OVERLAP;
  }

  return chunks;
}
