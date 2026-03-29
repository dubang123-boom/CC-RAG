import OpenAI from 'openai';
import { supabaseServer } from './supabase';

const embeddingClient = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY!,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  timeout: 30000, // 30 秒超时，防止 embedding API 挂起导致整个分析卡死
});

const EMBEDDING_MODEL = 'text-embedding-v3';
const EMBEDDING_DIM = 1024;
const MAX_EMBED_CHARS = 6000;

export interface RetrievedChunk {
  id: string;
  source_file: string;
  source_category: string;
  article_number: string | null;
  chunk_index: number;
  content: string;
  similarity: number;
}

/**
 * Embed a single text using DashScope text-embedding-v3.
 * Truncates input to MAX_EMBED_CHARS.
 */
export async function embed(text: string): Promise<number[]> {
  const truncated = text.slice(0, MAX_EMBED_CHARS);
  const response = await embeddingClient.embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncated,
    dimensions: EMBEDDING_DIM,
  });
  return response.data[0].embedding;
}

/**
 * Embed texts in batches (25 per batch, 1s interval between batches).
 */
export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<number[][]> {
  const BATCH_SIZE = 10;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map(t => t.slice(0, MAX_EMBED_CHARS));
    const response = await embeddingClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIM,
    });

    for (const item of response.data) {
      results.push(item.embedding);
    }

    onProgress?.(Math.min(i + BATCH_SIZE, texts.length), texts.length);

    // Rate limit: wait 1s between batches (skip after last batch)
    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return results;
}

/**
 * Retrieve the most relevant knowledge chunks for a query text.
 */
export async function retrieveChunks(
  queryText: string,
  topK: number = 20,
  threshold: number = 0.35
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embed(queryText);

  const { data, error } = await supabaseServer.rpc('match_knowledge_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: topK,
  });

  if (error) {
    console.error('[rag] match_knowledge_chunks error:', error);
    throw new Error(`知识库检索失败: ${error.message}`);
  }

  return (data || []) as RetrievedChunk[];
}

/**
 * Extract all cited law/regulation names from text using 《》 markers.
 */
export function extractCitedLaws(text: string): string[] {
  const regex = /《([^》]+)》/g;
  const laws = new Set<string>();
  let match;
  while ((match = regex.exec(text)) !== null) {
    laws.add(match[1]);
  }
  return Array.from(laws);
}

/**
 * Retrieve chunks with supplementary queries for any cited laws
 * missing from the primary results.
 */
export async function retrieveWithCitedLaws(
  primaryQuery: string,
  fullText: string,
  topK: number = 20,
  threshold: number = 0.35
): Promise<RetrievedChunk[]> {
  const mainChunks = await retrieveChunks(primaryQuery, topK, threshold);

  const citedLaws = extractCitedLaws(fullText);
  // source_file format: "中华人民共和国食品安全法.pdf"
  const coveredLaws = new Set(mainChunks.map(c => c.source_file.replace('.pdf', '')));
  const missingLaws = citedLaws.filter(law => !coveredLaws.has(law));

  if (missingLaws.length === 0) return mainChunks;

  console.log(`[rag] Missing laws in primary results: ${missingLaws.join(', ')}`);

  const supplementary: RetrievedChunk[] = [];
  const results = await Promise.allSettled(
    missingLaws.map(law => retrieveChunks(law, 5, threshold))
  );
  for (const r of results) {
    if (r.status === 'fulfilled') supplementary.push(...r.value);
    else console.error('[rag] supplementary retrieval failed:', r.reason);
  }

  // Merge and deduplicate by id
  const seen = new Set(mainChunks.map(c => c.id));
  const merged = [...mainChunks];
  for (const c of supplementary) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      merged.push(c);
    }
  }
  return merged;
}

/**
 * Format retrieved chunks into a structured prompt string.
 * Groups by category and source file, deduplicates.
 */
export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '（未检索到相关法条）';

  // Deduplicate by content
  const seen = new Set<string>();
  const unique = chunks.filter(c => {
    if (seen.has(c.content)) return false;
    seen.add(c.content);
    return true;
  });

  // Group: category → source_file → chunks
  const categoryOrder = ['法律', '行政法规', '规章', 'root', '案例'];
  const grouped = new Map<string, Map<string, RetrievedChunk[]>>();

  for (const chunk of unique) {
    if (!grouped.has(chunk.source_category)) {
      grouped.set(chunk.source_category, new Map());
    }
    const fileMap = grouped.get(chunk.source_category)!;
    if (!fileMap.has(chunk.source_file)) {
      fileMap.set(chunk.source_file, []);
    }
    fileMap.get(chunk.source_file)!.push(chunk);
  }

  const lines: string[] = [];

  for (const cat of categoryOrder) {
    const fileMap = grouped.get(cat);
    if (!fileMap) continue;

    const categoryLabel = cat === 'root' ? '其他' : cat;
    lines.push(`## ${categoryLabel}`);

    for (const [fileName, fileChunks] of fileMap) {
      const displayName = fileName.replace('.pdf', '').replace('.md', '');
      lines.push(`### ${displayName}`);

      // Sort by chunk_index to maintain document order
      fileChunks.sort((a, b) => a.chunk_index - b.chunk_index);

      for (const chunk of fileChunks) {
        if (chunk.article_number) {
          lines.push(`【${chunk.article_number}】${chunk.content.replace(chunk.article_number, '').trim()}`);
        } else {
          lines.push(chunk.content);
        }
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}
