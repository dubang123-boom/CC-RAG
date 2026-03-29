/**
 * Index all knowledge PDFs into Supabase pgvector for RAG retrieval.
 *
 * Usage: npm run index-knowledge
 *
 * Reads .env.local for DASHSCOPE_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * and SUPABASE_SERVICE_ROLE_KEY.
 */

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

// Load .env.local before any imports that use env vars
config({ path: path.join(process.cwd(), '.env.local') });

import { discoverPDFs, extractPDFText, extractMarkdownText, chunkText, chunkCaseDocument } from '../lib/chunker';

async function main() {
  // Dynamic imports to ensure env vars are loaded first
  const { createClient } = await import('@supabase/supabase-js');
  const { embedBatch } = await import('../lib/rag');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const knowledgeDir = path.join(process.cwd(), 'knowledge');

  if (!fs.existsSync(knowledgeDir)) {
    console.error('❌ knowledge/ directory not found');
    process.exit(1);
  }

  // 1. Discover all knowledge files (PDFs + Markdown)
  const files = discoverPDFs(knowledgeDir);
  const pdfCount = files.filter(f => f.fileType === 'pdf').length;
  const mdCount = files.filter(f => f.fileType === 'md').length;
  console.log(`📚 Found ${files.length} files (${pdfCount} PDFs, ${mdCount} Markdown)\n`);

  for (const cat of ['法律', '行政法规', '规章', '案例', 'root']) {
    const count = files.filter(p => p.category === cat).length;
    if (count > 0) console.log(`  ${cat}: ${count}`);
  }
  console.log();

  // 2. Extract text & chunk all files
  const allChunks: { sourceFile: string; sourceCategory: string; articleNumber: string | null; chunkIndex: number; content: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`[${i + 1}/${files.length}] Extracting: ${file.fileName}`);

    try {
      let text: string;
      let chunks;

      if (file.fileType === 'md') {
        text = extractMarkdownText(file.filePath);
        // Use case-specific chunking for 案例 category
        if (file.category === '案例') {
          chunks = chunkCaseDocument(text, file.fileName, file.category);
        } else {
          chunks = chunkText(text, file.fileName, file.category);
        }
      } else {
        text = await extractPDFText(file.filePath);
        chunks = chunkText(text, file.fileName, file.category);
      }

      allChunks.push(...chunks);
      console.log(`  → ${chunks.length} chunks (${text.length} chars)`);
    } catch (err) {
      console.error(`  ⚠ Failed to process ${file.fileName}:`, err);
    }
  }

  console.log(`\n📦 Total chunks: ${allChunks.length}\n`);

  if (allChunks.length === 0) {
    console.error('❌ No chunks generated. Exiting.');
    process.exit(1);
  }

  // 3. Batch embed all chunks
  console.log('🔄 Embedding chunks...');
  const texts = allChunks.map(c => c.content);
  const embeddings = await embedBatch(texts, (done, total) => {
    console.log(`  Embedded ${done}/${total}`);
  });

  console.log(`✅ Embedded ${embeddings.length} chunks\n`);

  // 4. Upsert into Supabase
  console.log('💾 Upserting to Supabase...');
  const UPSERT_BATCH = 100;
  let upserted = 0;

  for (let i = 0; i < allChunks.length; i += UPSERT_BATCH) {
    const batchChunks = allChunks.slice(i, i + UPSERT_BATCH);
    const batchEmbeddings = embeddings.slice(i, i + UPSERT_BATCH);

    const rows = batchChunks.map((chunk, j) => ({
      source_file: chunk.sourceFile,
      source_category: chunk.sourceCategory,
      article_number: chunk.articleNumber,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      content_length: chunk.content.length,
      embedding: JSON.stringify(batchEmbeddings[j]),
    }));

    const { error } = await supabase
      .from('gjt_knowledge_chunks')
      .upsert(rows, { onConflict: 'source_file,chunk_index' });

    if (error) {
      console.error(`  ⚠ Upsert error at batch ${i}:`, error.message);
    } else {
      upserted += batchChunks.length;
      console.log(`  Upserted ${upserted}/${allChunks.length}`);
    }
  }

  console.log(`\n🎉 Done! Indexed ${upserted} chunks from ${files.length} files.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
