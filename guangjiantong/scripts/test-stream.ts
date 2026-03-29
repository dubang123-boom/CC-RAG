/**
 * 诊断脚本：测试 Gemini 流式 + JSON 模式是否正常工作
 *
 * Usage: npx tsx scripts/test-stream.ts
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env.local') });

import OpenAI from 'openai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY not found in .env.local');
  process.exit(1);
}

const MODEL = 'gemini-2.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

const client = new OpenAI({
  apiKey,
  baseURL: BASE_URL,
});

const TEST_PROMPT = `请分析以下广告内容，判断是否存在违反《广告法》的问题，以 JSON 格式输出。

广告内容："本产品是全国销量最好的减肥药，无任何副作用，7天瘦20斤，国家级认证。"

请输出如下 JSON 格式：
{
  "violations": [{"clause": "条款", "reason": "原因"}],
  "risk_level": "high/medium/low",
  "summary": "总结"
}`;

async function main() {
  console.log('=== Gemini 流式 + JSON 模式诊断 ===\n');
  console.log(`模型: ${MODEL}`);
  console.log(`baseURL: ${BASE_URL}`);
  console.log(`stream: true`);
  console.log(`response_format: { type: "json_object" }\n`);

  const start = Date.now();
  let chunkCount = 0;
  let content = '';
  let firstChunkTime: number | null = null;

  try {
    const stream = await client.chat.completions.create({
      model: MODEL,
      stream: true,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '你是一个广告法合规分析助手。请用 JSON 格式回答。' },
        { role: 'user', content: TEST_PROMPT },
      ],
    });

    for await (const chunk of stream) {
      chunkCount++;
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);

      if (firstChunkTime === null) {
        firstChunkTime = Date.now() - start;
      }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      // content (正式输出)
      if (delta.content) {
        const c = delta.content as string;
        content += c;
        process.stdout.write(`[${elapsed}s] [内容] ${c}\n`);
      }

      // finish_reason
      const finishReason = chunk.choices?.[0]?.finish_reason;
      if (finishReason) {
        console.log(`\n[${elapsed}s] finish_reason: ${finishReason}`);
      }
    }
  } catch (err: unknown) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.error(`\n❌ [${elapsed}s] 流式请求出错:`, err);
    process.exit(1);
  }

  const totalTime = ((Date.now() - start) / 1000).toFixed(2);

  console.log('\n=== 结果汇总 ===\n');
  console.log(`总耗时: ${totalTime}s`);
  console.log(`首 chunk 延迟: ${firstChunkTime !== null ? (firstChunkTime / 1000).toFixed(2) + 's' : 'N/A'}`);
  console.log(`chunk 总数: ${chunkCount}`);
  console.log(`content 长度: ${content.length} 字符`);

  // 验证 JSON 可解析
  console.log('\n--- 完整 content ---');
  console.log(content);

  if (content.trim()) {
    try {
      const parsed = JSON.parse(content);
      console.log('\n✅ JSON 解析成功:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log('\n❌ JSON 解析失败 — content 不是合法 JSON');
    }
  } else {
    console.log('\n⚠️  content 为空');
  }
}

main();
