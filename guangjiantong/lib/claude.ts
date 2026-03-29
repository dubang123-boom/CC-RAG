import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import { loadSkills, buildAnalysisSystemPrompt, buildGenerationSystemPrompt, loadComplaintSkills, buildComplaintAnalysisSystemPrompt, buildComplaintResponseSystemPrompt } from './skills';
import { retrieveWithCitedLaws, formatChunksForPrompt } from './rag';
import type { Analysis, Question, ComplaintAnalysis } from '@/types';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY!,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  timeout: 240000, // 240 秒超时
});

const MODEL = 'qwen3-max';

const ANALYSIS_TIMEOUT = 300000; // 5 分钟

/**
 * 给 Promise 添加超时保护，防止 embedding/LLM 调用无限挂起
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}超时（${ms / 1000}秒），请重试`)), ms)
    ),
  ]);
}

export { ANALYSIS_TIMEOUT };

// ===== Flow 1：分析处罚文书 =====

export async function analyzePenaltyDocument(
  input: Buffer | string,
  mimeType?: 'application/pdf' | 'image/jpeg' | 'image/png',
  onProgress?: (message: string) => void,
): Promise<Omit<Analysis, 'id' | 'case_id'>> {
  const skills = loadSkills(['document-formats.md', 'case-strategies.md']);

  // Extract text from uploaded PDF or use provided text directly
  let documentText: string;
  if (typeof input === 'string') {
    documentText = input;
  } else if (mimeType === 'application/pdf') {
    const result = await pdfParse(input);
    documentText = result.text;
  } else {
    throw new Error('当前仅支持 PDF 文件上传，暂不支持图片格式');
  }

  // RAG: retrieve relevant knowledge chunks based on document content
  const queryText = documentText.slice(0, 1500);
  const chunks = await retrieveWithCitedLaws(queryText, documentText, 10);
  const retrievedKnowledge = formatChunksForPrompt(chunks);
  console.log(`[rag] Flow 1: retrieved ${chunks.length} chunks for analysis`);
  onProgress?.('正在检索法律依据...');

  const stream = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    stream: true,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: buildAnalysisSystemPrompt(skills, retrievedKnowledge),
      },
      {
        role: 'user',
        content: `以下是上传的行政处罚文书内容：

---
${documentText}
---

${ANALYSIS_USER_PROMPT}`,
      },
    ],
  });

  let accumulated = '';
  let sawReasoning = false;
  let sawContent = false;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    // 保留 reasoning_content 逻辑以兼容支持思维链的模型
    const reasoningContent = (delta as Record<string, unknown>)?.reasoning_content;
    if (reasoningContent && !sawReasoning) {
      sawReasoning = true;
      onProgress?.('AI 正在深度分析...');
    }
    if (delta?.content) {
      if (!sawContent) {
        sawContent = true;
        onProgress?.('正在生成分析报告...');
      }
      accumulated += delta.content;
    }
  }

  if (!accumulated) throw new Error('API 返回空响应');

  return parseAnalysisJSON(accumulated);
}

// ===== Flow 2：生成申辩书（流式） =====

export async function* generateDefenseDocument(
  analysis: Analysis,
  answers: Record<string, string>,
  documentText: string = '',
): AsyncGenerator<string> {
  const skills = loadSkills(); // 加载全部skills，含 document-formats.md 写作规范和模板

  // RAG: retrieve relevant knowledge chunks based on analysis results
  const ragQuery = [
    analysis.violation_type,
    ...analysis.cited_articles,
    ...analysis.procedure_issues,
    analysis.defensibility_reason,
    '行政处罚 不予处罚 从轻处罚 减轻处罚 过罚相当 首次违法',
  ].filter(Boolean).join(' ');
  const citedText = analysis.cited_articles.join(' ');
  const chunks = await retrieveWithCitedLaws(ragQuery, citedText, 30);
  const retrievedKnowledge = formatChunksForPrompt(chunks);
  const caseCount = chunks.filter(c => c.source_category === '案例').length;
  console.log(`[rag] Flow 2: retrieved ${chunks.length} chunks (${caseCount} case chunks) for generation`);

  const stream = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 16384,
    stream: true,
    messages: [
      {
        role: 'system',
        content: buildGenerationSystemPrompt(skills, retrievedKnowledge),
      },
      {
        role: 'user',
        content: buildGenerationUserPrompt(analysis, answers, documentText),
      },
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

// ===== 提示词 =====

const ANALYSIS_USER_PROMPT = `
请仔细阅读上传的行政处罚文书，按照系统提示中的要求进行分析。

必须以 JSON 格式输出，格式如下：
{
  "violation_type": "极限词|食品疾病功效|虚假宣传|医疗广告|其他",
  "cited_articles": ["《广告法》第九条第三项", "《广告法》第五十五条", "《行政处罚法》第三十二条"],
  "penalty_amount": 200000,
  "defense_deadline_days": 15,
  "document_received_date": "2026-03-01",
  "defense_deadline_date": "2026-03-16",
  "hearing_eligible": true,
  "procedure_issues": ["未明确告知听证权利"],
  "defensibility": "中",
  "defensibility_reason": "存在首次违规情节，广告已主动下架...",
  "questions": [
    {
      "key": "ad_takedown",
      "text": "涉案广告是否已主动下架或修改？",
      "type": "boolean",
      "why": "主动消除违法行为危害后果，是《行政处罚法》第32条规定的从轻情节",
      "required": true
    },
    {
      "key": "transfer_nature",
      "text": "转让行为的性质？",
      "type": "choice",
      "options": ["主动有偿转让", "被动无偿出借"],
      "why": "影响情节严重程度的认定",
      "required": true
    }
  ]
}

注意：
1. 所有法律条款引用必须来自知识库，不得自行创造
2. questions 数组最多 8 道题（基础必问题2道 + 量化数据题1-2道 + 每项违法事实各1道 choice 题，超限时合并最相似的）
3. type 为 "choice" 时，必须提供 options 数组（2-4 个选项）；是/否问题用 "boolean"
4. 如果文书内容无法识别，在 defensibility_reason 中说明原因
5. cited_articles 中每条必须包含完整法律名称和条款号（如"《广告法》第九条第三项"），不要用缩写
6. **每项违法事实必须拆成独立的 choice 类型问题**：如文书列出4个涉案表述/违法行为，必须生成4个独立问题，每题只问一个事实。不同类型的违法事实（绝对化用语、功效超范围、消费者证言等）问法和 options 完全不同，必须针对性设计
7. **量化数据问题必须引用文书中的具体数字**：如文书提到"浏览量超过50万次"，问题中必须引用该数字让用户确认或纠正，不要用泛泛的"请提供数据"
`;

function buildGenerationUserPrompt(
  analysis: Analysis,
  answers: Record<string, string>,
  documentText: string,
): string {
  // 根据罚款金额判断听证条件
  const hearingEligible = analysis.hearing_eligible || (analysis.penalty_amount != null && analysis.penalty_amount >= 100000);
  const penaltyDisplay = analysis.penalty_amount ? `${analysis.penalty_amount / 10000}万元（人民币${analysis.penalty_amount.toLocaleString()}元）` : '未知';

  return `
请根据以下案件信息，生成一份完整的、有实质内容的陈述申辩意见书。

【原始处罚文书内容】
${documentText}

【案件分析结果】
违规类型：${analysis.violation_type}
引用条款：${analysis.cited_articles.join('、')}
拟处罚金额：${penaltyDisplay}
申辩截止：${analysis.defense_deadline}
是否可申请听证：${hearingEligible ? '是（罚款金额≥10万元，必须在收到告知书后5个工作日内申请）' : '否'}
程序问题：${analysis.procedure_issues.join('；') || '无明显程序问题'}
可申辩性：${analysis.defensibility}
评估理由：${analysis.defensibility_reason}

【用户回答】
${Object.entries(answers)
  .filter(([key]) => key !== '_extra_supplement')
  .map(([key, value]) => {
    const q = analysis.questions?.find(q => q.key === key);
    return `${q?.text || key}：${value}`;
  })
  .join('\n')}${answers['_extra_supplement']?.trim() ? `\n\n【其他补充】\n${answers['_extra_supplement'].trim()}` : ''}

【第一步：证据盘点 + 事实素材清单（必须在心中完成，不输出）】

A. 证据盘点——对每项违法事实判断攻防策略：
- 列出处罚文书指控的每一项违法事实
- 检查用户回答中是否有反驳证据 → 有则"可辩"，无则"应认"
- "可辩"的展开论证，"应认"的一句话承认后转向法律适用

B. 事实素材清单——从用户回答中逐条提取可用事实：
- 逐条读用户回答，原样记录用户明确提供的信息
- 用户说了什么就只能用什么，不能添加用户没说的细节
- 例：用户答"已整改"→ 可用素材仅为"已整改"，不能扩展为"于X月X日完成整改并建立合规制度"

C. 写作红线——每写一句事实性陈述时自检：
- 这句话的时间/日期来自哪里？（处罚文书？用户回答？都没有→删掉时间细节）
- 这句话的具体行为来自哪里？（用户说了？没说→不写该行为）
- 这句话的状态/结果来自哪里？（用户提供了？没提供→改为概括性表述）

即使某项事实"应认"，仍可在法律适用和量罚部分论证：
- 该行为虽违法，但危害后果轻微
- 处罚金额与违法情节不相当（过罚相当原则）
- 符合从轻/减轻/不予处罚的法定条件

【第二步：核心要求】
1. 必须从原始处罚文书中提取真实的企业名称、统一社会信用代码、法定代表人、案号、处罚机关名称等信息填入文书
2. 正文必须包含实质性申辩论证，严禁只输出格式模板或占位符
3. "关于违法事实的陈述"部分：
   - 对每项指控逐一分析——有用户提供的证据支持反驳的，展开详细论证；用户没有提供证据的，一句话简短承认后立即转向下一项
   - **绝对禁止捏造用户未提供的证据**：如果用户没有说"有第三方奖项"，不得写"该词汇来源于第三方机构颁发的奖项"；如果用户没有提供测试数据，不得写"基于内部测试数据"
   - 对可辩的表述：引用具体法律条款和用户提供的证据进行法律定性挑战
4. "法律适用分析"部分：
   - 即使事实无法反驳，仍可从法律适用角度论证——处罚条款是否选错？处罚金额是否畸重？
   - **必须引用与案件类型匹配的规范性文件**（如极限词案件必须引用《广告绝对化用语执法指南》的具体条款编号）
   - **必须分析过罚相当原则**：用用户提供的具体数字（广告费、销售额等）计算罚款比例，论证处罚与违法行为不相当
   - 如果用户未提供数字，用举证责任转移论证替代（"处罚机关未提供涉案广告造成实质危害的证据"）
5. "请求从轻/减轻处罚的理由"部分：**必须使用知识库 case-strategies 中的策略组合指引**——根据案件类型查找推荐的策略组合（如"首次极限词违规（小商家）"对应"策略一+策略二+策略十"），每个匹配的策略都必须展开为一个独立的、有完整"论点→法律依据→事实证据"三段式结构的论证段落，事实证据必须来自用户回答
6. 所有法律条款引用只能来自上方【法律知识库】中的原文，严禁编造、改写或推测任何法律条文

【输出格式——三段式，缺一不可】

⚠️ 绝对禁止在正文中显示来源标注：文书是给执法机关看的正式法律文书，不能包含"（用户明确回答'否'）""（用户回答'...'）""（根据处罚文书记载）""（结合上下文应理解为...）"等任何形式的内部注释或来源说明。溯源是你的内心自检过程，不是输出内容。

⚠️ 输出完整性是硬性要求：你的输出必须包含以下三段内容。正文控制在2000-4000字，确保有空间输出第二段和第三段。如果只输出了正文而没有证据清单，这是严重错误。

你的完整输出结构必须如下：

=== 第一段：陈述申辩意见书正文（2000-4000字） ===
- 正文各部分按顺序编号（一、二、三...），如果没有程序性意见则省略该部分，后续编号顺延（即一、二、三、四，不要跳过编号写成一、二、三、五）
- 申辩请求部分：用"如贵局经审查认为..."条件从句递进衔接三级请求
- 末尾必须有落款（申请人名称+加盖公章、法定代表人签字栏、日期栏）
- 正文写完落款后，你必须独占一行输出三个短横线 --- 作为分隔符，然后继续输出第二段

=== 第二段：证据清单 + 附件准备指南 ===
- 先输出证据清单表格（Markdown 表格：编号 | 证据名称 | 证明目的）
- 紧接着输出附件准备指南（逐一说明每份附件的获取方式和注意事项）
${hearingEligible ? '- 写完附件准备指南后，你必须独占一行输出三个短横线 --- 作为分隔符，然后继续输出第三段' : '- 本案罚款金额未达听证标准（<10万元），第三段可省略'}

${hearingEligible ? `=== 第三段：听证申请书 ===
- 罚款金额≥10万元，必须输出完整的听证申请书
- 格式严格按照知识库中 document-formats 的听证申请书模板` : ''}

请严格按照上述顺序输出。在正文落款之后，必须写 --- 然后继续写证据清单。不要在正文结束后就停止输出。
`;
}

// ===== JSON 解析 =====

interface AnalysisRaw {
  violation_type: string;
  cited_articles: string[];
  penalty_amount: number;
  defense_deadline_days: number;
  document_received_date: string;
  defense_deadline_date: string;
  hearing_eligible: boolean;
  procedure_issues: string[];
  defensibility: '强' | '中' | '弱';
  defensibility_reason: string;
  questions: Question[];
}

function repairTruncatedJSON(jsonStr: string): string {
  // Try to repair JSON that was truncated mid-output
  let s = jsonStr;

  // Close any unterminated string (odd number of unescaped quotes)
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    s += '"';
  }

  // Count open/close brackets and braces
  let openBraces = 0, openBrackets = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (s[i] === '{') openBraces++;
    else if (s[i] === '}') openBraces--;
    else if (s[i] === '[') openBrackets++;
    else if (s[i] === ']') openBrackets--;
  }

  // Remove trailing comma before we close
  s = s.replace(/,\s*$/, '');

  // Close unclosed brackets and braces
  for (let i = 0; i < openBrackets; i++) s += ']';
  for (let i = 0; i < openBraces; i++) s += '}';

  return s;
}

function parseAnalysisJSON(text: string): Omit<Analysis, 'id' | 'case_id'> {
  // Extract JSON from potential markdown code block
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = (jsonMatch[1] || text).trim();

  let raw: AnalysisRaw;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    // Attempt to repair truncated JSON from AI
    console.warn('JSON parse failed, attempting repair...');
    raw = JSON.parse(repairTruncatedJSON(jsonStr));
  }

  // Validate defense_deadline is a real YYYY-MM-DD date, reject "N/A", "n/a", "无", "暂无", "未知", etc.
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const deadlineValid = raw.defense_deadline_date
    && dateRegex.test(raw.defense_deadline_date)
    && !isNaN(Date.parse(raw.defense_deadline_date));

  // Validate defensibility is one of the allowed values
  const validDefensibility = ['强', '中', '弱'] as const;
  const defensibility = validDefensibility.includes(raw.defensibility as '强' | '中' | '弱')
    ? raw.defensibility : '中';

  // Validate penalty_amount is a real number
  const penaltyAmount = typeof raw.penalty_amount === 'number' && !isNaN(raw.penalty_amount)
    ? raw.penalty_amount : null;

  return {
    violation_type: raw.violation_type,
    cited_articles: Array.isArray(raw.cited_articles) ? raw.cited_articles : [],
    penalty_amount: penaltyAmount,
    defense_deadline: deadlineValid ? raw.defense_deadline_date : null,
    hearing_eligible: raw.hearing_eligible ?? false,
    procedure_issues: Array.isArray(raw.procedure_issues) ? raw.procedure_issues : [],
    defensibility,
    defensibility_reason: raw.defensibility_reason,
    questions: (raw.questions || []).map(q => {
      // choice without options → fall back to text input
      if (q.type === 'choice' && (!Array.isArray(q.options) || q.options.length === 0)) {
        return { ...q, type: 'text' as const };
      }
      return q;
    }),
    answers: null,
  };
}

// ===== 投诉应对模块 =====

// Flow 3：分析投诉内容
export async function analyzeComplaint(
  input: Buffer | string,
  mimeType?: 'application/pdf' | 'image/jpeg' | 'image/png',
  onProgress?: (message: string) => void,
): Promise<Omit<ComplaintAnalysis, 'id' | 'case_id'>> {
  const skills = loadComplaintSkills(['complaint-templates.md', 'complaint-strategies.md']);

  let documentText: string;
  if (typeof input === 'string') {
    documentText = input;
  } else if (mimeType === 'application/pdf') {
    const result = await pdfParse(input);
    documentText = result.text;
  } else {
    throw new Error('当前仅支持 PDF 文件上传，暂不支持图片格式');
  }

  // RAG: retrieve relevant knowledge chunks
  const queryText = documentText.slice(0, 1500);
  const chunks = await retrieveWithCitedLaws(queryText, documentText, 10);
  const retrievedKnowledge = formatChunksForPrompt(chunks);
  console.log(`[rag] Complaint analysis: retrieved ${chunks.length} chunks`);
  onProgress?.('正在检索法律依据...');

  const stream = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    stream: true,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: buildComplaintAnalysisSystemPrompt(skills, retrievedKnowledge),
      },
      {
        role: 'user',
        content: `以下是消费者投诉内容：

---
${documentText}
---

${COMPLAINT_ANALYSIS_PROMPT}`,
      },
    ],
  });

  let accumulated = '';
  let sawReasoning = false;
  let sawContent = false;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    // 保留 reasoning_content 逻辑以兼容支持思维链的模型
    const reasoningContent = (delta as Record<string, unknown>)?.reasoning_content;
    if (reasoningContent && !sawReasoning) {
      sawReasoning = true;
      onProgress?.('AI 正在深度分析...');
    }
    if (delta?.content) {
      if (!sawContent) {
        sawContent = true;
        onProgress?.('正在生成分析报告...');
      }
      accumulated += delta.content;
    }
  }

  if (!accumulated) throw new Error('API 返回空响应');

  return parseComplaintAnalysisJSON(accumulated);
}

// Flow 4：生成投诉回复（流式）
export async function* generateComplaintResponse(
  analysis: ComplaintAnalysis,
  answers: Record<string, string>,
  documentText: string = '',
): AsyncGenerator<string> {
  const skills = loadComplaintSkills();

  // RAG: retrieve relevant knowledge
  const ragQuery = [
    analysis.complaint_type,
    analysis.complaint_summary,
    ...(analysis.cited_articles || []),
    analysis.recommended_strategy,
    '消费者投诉 赔偿 调解 退一赔三 和解',
  ].filter(Boolean).join(' ');
  const citedText = (analysis.cited_articles || []).join(' ');
  const chunks = await retrieveWithCitedLaws(ragQuery, citedText, 30);
  const retrievedKnowledge = formatChunksForPrompt(chunks);
  console.log(`[rag] Complaint generation: retrieved ${chunks.length} chunks`);

  const stream = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    stream: true,
    messages: [
      {
        role: 'system',
        content: buildComplaintResponseSystemPrompt(skills, retrievedKnowledge),
      },
      {
        role: 'user',
        content: buildComplaintGenerationUserPrompt(analysis, answers, documentText),
      },
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

const COMPLAINT_ANALYSIS_PROMPT = `
请仔细阅读投诉内容，进行全面分析。

必须以 JSON 格式输出，格式如下：
{
  "complaint_type": "虚假宣传|质量问题|价格欺诈|售后纠纷|食品安全|其他",
  "complaint_source": "12315|12345|黑猫投诉|电商平台|其他",
  "complaint_summary": "一句话概括投诉核心内容",
  "violation_type": "涉及的主要法律问题类型",
  "cited_articles": ["《消费者权益保护法》第五十五条", "..."],
  "escalation_risk": "high|medium|low",
  "escalation_risk_reason": "升级风险评估的具体理由",
  "recommended_strategy": "cooperative|negotiate|defend",
  "strategy_explanation": "推荐该策略的具体理由",
  "consumer_claims": [
    {
      "description": "消费者的具体诉求",
      "legal_basis": "诉求对应的法律依据",
      "validity": "valid|partial|invalid",
      "validity_reason": "诉求合理性分析"
    }
  ],
  "estimated_cost": {
    "cooperation_cost": "现在和解的预估成本",
    "escalation_cost": "升级为行政处罚的预估成本",
    "comparison_note": "成本对比说明"
  },
  "response_deadline_days": 7,
  "questions": [
    {
      "key": "prior_complaints",
      "text": "此前是否因同类问题被消费者投诉过？",
      "type": "boolean",
      "why": "首次被投诉可争取更宽容的调解态度",
      "required": true
    }
  ]
}

注意：
1. 所有法律条款引用必须来自知识库
2. questions 数组最多 8 道题
3. type 为 "choice" 时必须提供 options 数组
4. consumer_claims 需逐项分析消费者的每一个具体诉求
5. escalation_risk 是评估投诉升级为行政处罚的风险
6. estimated_cost 用于帮助商家做成本对比决策
`;

function buildComplaintGenerationUserPrompt(
  analysis: ComplaintAnalysis,
  answers: Record<string, string>,
  documentText: string,
): string {
  const strategyLabels: Record<string, string> = {
    cooperative: '主动和解',
    negotiate: '协商谈判',
    defend: '依法抗辩',
  };

  return `
请根据以下投诉信息，生成三份完整的材料。

【原始投诉内容】
${documentText}

【投诉分析结果】
投诉类型：${analysis.complaint_type}
投诉来源：${analysis.complaint_source}
投诉摘要：${analysis.complaint_summary}
涉及法条：${(analysis.cited_articles || []).join('、')}
升级风险：${analysis.escalation_risk}（${analysis.escalation_risk_reason}）
推荐策略：${analysis.recommended_strategy ? strategyLabels[analysis.recommended_strategy] || analysis.recommended_strategy : '未确定'}（${analysis.strategy_explanation}）
建议回复期限：${analysis.response_deadline_days || 7} 天

【消费者诉求分析】
${(analysis.consumer_claims || []).map((c, i) =>
    `${i + 1}. ${c.description}（法律依据：${c.legal_basis}，合理性：${c.validity}，分析：${c.validity_reason}）`
  ).join('\n')}

【成本对比】
现在和解成本：${analysis.estimated_cost?.cooperation_cost || '待评估'}
升级后成本：${analysis.estimated_cost?.escalation_cost || '待评估'}
对比说明：${analysis.estimated_cost?.comparison_note || ''}

【商家回答】
${Object.entries(answers)
    .filter(([key]) => key !== '_extra_supplement')
    .map(([key, value]) => {
      const q = analysis.questions?.find(q => q.key === key);
      return `${q?.text || key}：${value}`;
    })
    .join('\n')}${answers['_extra_supplement']?.trim() ? `\n\n【其他补充】\n${answers['_extra_supplement'].trim()}` : ''}

【输出格式——三段式，用 --- 分隔】

⚠️ 事实溯源：回复函中的每一句事实性陈述必须来自上方的投诉内容或商家回答，严禁捏造。

=== 第一段：投诉回复函 ===
- 正式书面回复，发给市监局
- 逐项回应消费者诉求
- 提出具体处理方案
- 末尾有落款（企业名称+公章、日期）
- 写完落款后输出 --- 分隔符

=== 第二段：协商话术脚本 ===
- 与消费者沟通的具体话术
- 包含开场白、回应话术、方案话术、底线话术
- 标注注意事项（哪些话不能说）
- 写完后输出 --- 分隔符

=== 第三段：整改清单与风险提示 ===
- 内部整改清单表格
- 后续风险提示和应对建议

请严格按照上述三段式结构输出，每段之间用 --- 分隔。
`;
}

interface ComplaintAnalysisRaw {
  complaint_type: string;
  complaint_source: string;
  complaint_summary: string;
  violation_type: string;
  cited_articles: string[];
  escalation_risk: string;
  escalation_risk_reason: string;
  recommended_strategy: string;
  strategy_explanation: string;
  consumer_claims: Array<{
    description: string;
    legal_basis: string;
    validity: string;
    validity_reason: string;
  }>;
  estimated_cost: {
    cooperation_cost: string;
    escalation_cost: string;
    comparison_note: string;
  };
  response_deadline_days: number;
  questions: Question[];
}

function parseComplaintAnalysisJSON(text: string): Omit<ComplaintAnalysis, 'id' | 'case_id'> {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = (jsonMatch[1] || text).trim();

  let raw: ComplaintAnalysisRaw;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    console.warn('Complaint JSON parse failed, attempting repair...');
    raw = JSON.parse(repairTruncatedJSON(jsonStr));
  }

  const validRisks = ['high', 'medium', 'low'] as const;
  const escalationRisk = validRisks.includes(raw.escalation_risk as 'high' | 'medium' | 'low')
    ? raw.escalation_risk as 'high' | 'medium' | 'low' : 'medium';

  const validStrategies = ['cooperative', 'negotiate', 'defend'] as const;
  const strategy = validStrategies.includes(raw.recommended_strategy as 'cooperative' | 'negotiate' | 'defend')
    ? raw.recommended_strategy as 'cooperative' | 'negotiate' | 'defend' : 'negotiate';

  return {
    complaint_type: raw.complaint_type as ComplaintAnalysis['complaint_type'] || '其他',
    complaint_source: raw.complaint_source as ComplaintAnalysis['complaint_source'] || '其他',
    complaint_summary: raw.complaint_summary || null,
    violation_type: raw.violation_type || null,
    cited_articles: Array.isArray(raw.cited_articles) ? raw.cited_articles : [],
    escalation_risk: escalationRisk,
    escalation_risk_reason: raw.escalation_risk_reason || null,
    recommended_strategy: strategy,
    strategy_explanation: raw.strategy_explanation || null,
    consumer_claims: Array.isArray(raw.consumer_claims) ? raw.consumer_claims.map(c => ({
      description: c.description || '',
      legal_basis: c.legal_basis || '',
      validity: (['valid', 'partial', 'invalid'] as const).includes(c.validity as 'valid' | 'partial' | 'invalid')
        ? c.validity as 'valid' | 'partial' | 'invalid' : 'partial',
      validity_reason: c.validity_reason || '',
    })) : null,
    estimated_cost: raw.estimated_cost ? {
      cooperation_cost: raw.estimated_cost.cooperation_cost || '',
      escalation_cost: raw.estimated_cost.escalation_cost || '',
      comparison_note: raw.estimated_cost.comparison_note || '',
    } : null,
    response_deadline_days: typeof raw.response_deadline_days === 'number' ? raw.response_deadline_days : 7,
    questions: (raw.questions || []).map(q => {
      if (q.type === 'choice' && (!Array.isArray(q.options) || q.options.length === 0)) {
        return { ...q, type: 'text' as const };
      }
      return q;
    }),
    answers: null,
  };
}
