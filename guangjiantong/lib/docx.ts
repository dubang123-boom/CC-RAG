import { marked } from 'marked';
import HTMLtoDOCX from '@turbodocx/html-to-docx';
import JSZip from 'jszip';

// Configure marked to treat single newlines as <br>, so even if
// preprocessLegalMarkdown misses a case, text won't be merged.
marked.setOptions({ breaks: true });

/**
 * Pre-process LLM-generated legal markdown so that semantically distinct
 * lines are separated by blank lines (`\n\n`), which `marked` will render
 * as separate `<p>` tags instead of merging them into one paragraph.
 */
function preprocessLegalMarkdown(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const prev = i > 0 ? lines[i - 1].trim() : '';

    // --- Ensure blank line BEFORE certain patterns ---

    // Section headings: 一、 二、 三、 etc.
    if (/^[一二三四五六七八九十]+、/.test(trimmed) && prev !== '') {
      result.push('');
    }

    // Numbered items: 1. 2. 3. or （1） （2） or (1) (2)
    if (/^(\d+[.、]|[（(]\d+[)）])/.test(trimmed) && prev !== '') {
      result.push('');
    }

    // Signature / closing block keywords
    if (/^(此致|敬礼|申请人|投诉人|被申请人|答辩人|申辩人|举报人|联系电话|联系地址|附[：:])/.test(trimmed) && prev !== '') {
      result.push('');
    }

    // Date lines: YYYY年M月D日 or 年 月 日
    if (/^\d{4}年\d{1,2}月\d{1,2}日/.test(trimmed) && prev !== '') {
      result.push('');
    }
    if (/^年\s*月\s*日/.test(trimmed) && prev !== '') {
      result.push('');
    }

    // Seal line
    if (/^（.*(?:公章|盖章).*）$/.test(trimmed) && prev !== '') {
      result.push('');
    }

    // Recipient line: XX局：/ XX监督管理局：
    if (/^[\u4e00-\u9fff]+(?:局|委员会|办公室|中心|部门)[：:]/.test(trimmed) && prev !== '') {
      result.push('');
    }

    result.push(line);

    // --- Ensure blank line AFTER certain patterns ---

    // After a colon-ending introductory sentence (e.g. 回复如下：)
    if (/[：:]$/.test(trimmed) && trimmed.length > 2) {
      result.push('');
    }

    // After recipient line
    if (/^[\u4e00-\u9fff]+(?:局|委员会|办公室|中心|部门)[：:]/.test(trimmed)) {
      result.push('');
    }
  }

  let text = result.join('\n');

  // If the first non-empty line is not a markdown heading, promote it to h1
  text = text.replace(/^(\s*\n)*([^\n#].+)/, (_match, leading, title) => {
    const t = title.trim();
    // Only promote if it looks like a document title (short, no punctuation at end except 》）)
    if (t.length <= 50 && !/[。，、；]$/.test(t)) {
      return `${leading || ''}# ${t}`;
    }
    return `${leading || ''}${title}`;
  });

  // Collapse 3+ consecutive blank lines into 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text;
}

export async function generateDOCX(markdown: string): Promise<Buffer> {
  const preprocessed = preprocessLegalMarkdown(markdown);
  const htmlBody = await marked(preprocessed);

  // Wrap in full HTML with Chinese legal document styling.
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'SimSun', '宋体', serif;
      font-size: 12pt;
      line-height: 28pt;
      color: #000;
    }

    h1 {
      text-align: center;
      font-size: 22pt;
      font-weight: bold;
      letter-spacing: 4pt;
      margin: 20px 0 30px;
    }

    h2 {
      font-size: 15pt;
      font-weight: bold;
      margin: 20px 0 10px;
    }

    h3 {
      font-size: 14pt;
      font-weight: bold;
      margin: 18px 0 8px;
    }

    p {
      text-indent: 2em;
      margin: 4px 0;
      line-height: 28pt;
    }

    hr {
      border: none;
      border-top: 1px solid #ccc;
      margin: 30px 0;
    }

    ul, ol {
      padding-left: 2em;
    }

    li {
      margin: 4px 0;
    }
  </style>
</head>
<body>
  ${htmlBody}
</body>
</html>`;

  // Apply first-line indent via full-width spaces for normal paragraphs.
  // Skip: headings (already excluded), signatures, dates, seals, centered content.
  let htmlWithIndent = html;

  // First, add full-width space indent to normal <p> tags
  htmlWithIndent = htmlWithIndent.replace(
    /<p>(?!\u3000)/g,
    '<p>\u3000\u3000'
  );

  // Remove indent from signature/closing lines and apply right-alignment
  const signaturePatterns = [
    /(<p>)\u3000\u3000(此致)/g,
    /(<p>)\u3000\u3000(敬礼[！!]?)/g,
    /(<p>)\u3000\u3000(申请人[：:].*)(?=<)/g,
    /(<p>)\u3000\u3000(投诉人[：:].*)(?=<)/g,
    /(<p>)\u3000\u3000(被申请人[：:].*)(?=<)/g,
    /(<p>)\u3000\u3000(答辩人[：:].*)(?=<)/g,
    /(<p>)\u3000\u3000(申辩人[：:].*)(?=<)/g,
    /(<p>)\u3000\u3000(举报人[：:].*)(?=<)/g,
    /(<p>)\u3000\u3000(联系电话[：:].*)(?=<)/g,
    /(<p>)\u3000\u3000(联系地址[：:].*)(?=<)/g,
    /(<p>)\u3000\u3000(\d{4}年\d{1,2}月\d{1,2}日)/g,
    /(<p>)\u3000\u3000(年\s*月\s*日)/g,
    /(<p>)\u3000\u3000(（.*(?:公章|盖章).*）)/g,
    /(<p>)\u3000\u3000(附[：:].*)(?=<)/g,
  ];

  for (const pattern of signaturePatterns) {
    htmlWithIndent = htmlWithIndent.replace(
      pattern,
      '<p style="text-align:right;text-indent:0;">$2'
    );
  }

  const docxResult = await HTMLtoDOCX(htmlWithIndent, null, {
    table: { row: { cantSplit: true } },
    font: 'SimSun',
    fontSize: 24, // half-points: 24 = 12pt
    // A4 page size in twips (1 twip = 1/1440 inch)
    pageSize: {
      width: 11906,
      height: 16838,
    },
    margins: {
      top: 1134,    // 20mm ≈ 1134 twips
      bottom: 1134,
      left: 1418,   // 25mm ≈ 1418 twips
      right: 1418,
    },
  });

  // HTMLtoDOCX may return Buffer, ArrayBuffer, or Blob
  let docxBuffer: Buffer;
  if (Buffer.isBuffer(docxResult)) {
    docxBuffer = docxResult;
  } else if (docxResult instanceof ArrayBuffer) {
    docxBuffer = Buffer.from(new Uint8Array(docxResult));
  } else {
    const arrayBuffer = await (docxResult as Blob).arrayBuffer();
    docxBuffer = Buffer.from(new Uint8Array(arrayBuffer));
  }

  // Post-process DOCX XML: fix line spacing and add paragraph spacing
  const zip = await JSZip.loadAsync(docxBuffer);
  const docXml = await zip.file('word/document.xml')!.async('string');
  const fixedXml = docXml
    // Normalize line-rule to "exact"
    .replace(/w:lineRule="auto"/g, 'w:lineRule="exact"')
    .replace(/w:lineRule="atLeast"/g, 'w:lineRule="exact"')
    // Set line spacing to 28pt (560 twips)
    .replace(/w:line="\d+"(.*?)w:lineRule="exact"/g, 'w:line="560"$1w:lineRule="exact"')
    // Add paragraph spacing (before=200 twips ≈ 3.5pt, after=200 twips) for visible gaps
    // Handle self-closing <w:spacing ... /> form
    .replace(/<w:spacing(?![^>]*w:before)([^/]*?)\/>/g, '<w:spacing w:before="200" w:after="200"$1/>')
    // Handle open+close <w:spacing ...></w:spacing> form
    .replace(/<w:spacing(?![^>]*w:before)([^>]*?)><\/w:spacing>/g, '<w:spacing w:before="200" w:after="200"$1></w:spacing>');

  zip.file('word/document.xml', fixedXml);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}
