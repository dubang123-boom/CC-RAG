# 广监通 AI Agent — Vibe Coding 任务模组指引

**版本：** v2.0（精简版）
**日期：** 2026-03-08
**原则：** 8 个模组，每个模组独立可测试，按顺序执行

---

## 模组总览

| 模组 | 名称 | 预计工期 | 核心交付物 |
|------|------|---------|-----------|
| M0 | 项目脚手架 | 0.5 天 | 空白项目可运行 |
| M1 | 数据库与存储 | 1 天 | Supabase 配置完成 |
| M2 | Claude API 集成 | 1-2 天 | PDF 读取 + API 调用验证 |
| M3 | AI 知识库 | 2-3 天 | 5 个 Skills 文件 |
| M4 | Flow 1 处罚文书分析 | 2-3 天 | 分析端到端通路 |
| M5 | Flow 2 申辩书生成 | 2-3 天 | 文书生成 + PDF + 邮件 |
| M6 | 前端界面 | 2-3 天 | 完整 3 页 UI |
| M7 | 测试与上线 | 1-2 天 | 生产环境就绪 |

**总计：约 12-18 天**

---

## M0：项目脚手架

### 目标
建立可运行的空白项目，确认技术栈可行。

### 初始化步骤

```bash
# 1. 创建 Next.js 项目
npx create-next-app@latest guangjiantong \
  --typescript --tailwind --app --no-src-dir

cd guangjiantong

# 2. 安装 UI 组件库
npx shadcn-ui@latest init
# 选择：Default style, Zinc color, CSS variables

# 3. 安装核心依赖
npm install \
  @supabase/supabase-js \
  @anthropic-ai/sdk \
  resend \
  puppeteer-core \
  @sparticuz/chromium \
  marked \
  date-fns \
  lucide-react

# 4. 安装 shadcn 组件
npx shadcn-ui@latest add button card badge alert progress textarea
```

### 目录结构

```
guangjiantong/
├── app/
│   ├── page.tsx              # 落地页（= 上传入口）
│   ├── case/
│   │   └── [id]/
│   │       └── page.tsx      # 案件详情页
│   ├── done/
│   │   └── page.tsx          # 完成页
│   └── api/
│       ├── cases/
│       │   ├── route.ts      # POST 创建案件
│       │   └── [id]/
│       │       └── route.ts  # GET 获取案件
│       ├── analyze/
│       │   └── route.ts      # POST Flow 1（流式）
│       └── generate/
│           └── route.ts      # POST Flow 2（流式）
├── components/
│   ├── FileUpload.tsx
│   ├── DeadlineCountdown.tsx
│   ├── Questionnaire.tsx
│   ├── StreamingStatus.tsx
│   └── DefensibilityBadge.tsx
├── lib/
│   ├── supabase.ts           # Supabase 客户端（server + client）
│   ├── claude.ts             # Claude API 封装
│   ├── skills.ts             # 知识库加载
│   ├── pdf.ts                # PDF 生成
│   └── email.ts              # 邮件发送
├── skills/                   # AI 知识库文件
│   ├── advertising-law.md
│   ├── administrative-law.md
│   ├── document-formats.md
│   ├── case-strategies.md
│   └── workflow-analysis.md
└── types/
    └── index.ts              # TypeScript 类型定义
```

### 环境变量（`.env.local`）

```env
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Resend
RESEND_API_KEY=re_...

# 可选：每日 API 成本上限（USD）
DAILY_BUDGET_USD=30
```

### 验证标准
- [ ] `npm run dev` 启动，访问 `localhost:3000` 显示页面
- [ ] `npm run build` 构建无报错
- [ ] TypeScript 严格模式无类型错误

---

## M1：数据库与存储

### 目标
配置 Supabase，建立 4 张核心数据表和 2 个 Storage Bucket。

### 步骤 1：在 Supabase 创建项目

1. 登录 [supabase.com](https://supabase.com)
2. 新建项目，选择区域：`ap-southeast-1`（新加坡）
3. 记录：`Project URL`、`anon key`、`service_role key`

### 步骤 2：执行数据库 Migration

在 Supabase Dashboard → SQL Editor 执行：

```sql
-- 创建 Schema
CREATE SCHEMA IF NOT EXISTS guangjiantong;

-- 案件表
CREATE TABLE guangjiantong.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN (
      'uploaded', 'analyzing', 'awaiting-answers',
      'generating', 'completed', 'failed'
    )),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 文件表
CREATE TABLE guangjiantong.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES guangjiantong.cases(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  original_filename TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 分析结果表（Flow 1 输出）
CREATE TABLE guangjiantong.analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES guangjiantong.cases(id) ON DELETE CASCADE,
  -- 结构化提取结果
  violation_type TEXT,
  cited_articles TEXT[],
  penalty_amount NUMERIC(12,2),
  defense_deadline DATE,
  hearing_eligible BOOLEAN DEFAULT FALSE,
  procedure_issues TEXT[],
  -- 申辩评估
  defensibility TEXT CHECK (defensibility IN ('强', '中', '弱')),
  defensibility_reason TEXT,
  -- 问卷
  questions JSONB,     -- 题目列表
  answers JSONB,       -- 用户回答（后续更新）
  -- 原始 AI 输出（调试用）
  raw_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 生成文书表（Flow 2 输出）
CREATE TABLE guangjiantong.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES guangjiantong.cases(id) ON DELETE CASCADE,
  statement_md TEXT,
  statement_pdf_path TEXT,
  evidence_checklist_md TEXT,
  hearing_application_md TEXT,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION guangjiantong.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_updated_at
  BEFORE UPDATE ON guangjiantong.cases
  FOR EACH ROW EXECUTE FUNCTION guangjiantong.set_updated_at();
```

### 步骤 3：创建 Storage Buckets

在 Supabase Dashboard → Storage → New bucket：

```
Bucket 1: gjtong-uploads
  - Public: 否（私有）
  - File size limit: 20971520（20MB）

Bucket 2: gjtong-outputs
  - Public: 否（私有）
  - File size limit: 10485760（10MB）
```

Storage 策略（SQL Editor）：

```sql
-- 服务端（service_role）可读写所有文件，前端无法直接访问
-- V1 所有 Storage 操作通过服务端 API 完成，不需要 RLS 策略
-- 使用签名 URL 提供临时访问
```

### 步骤 4：Supabase 客户端配置

```typescript
// lib/supabase.ts

import { createClient } from '@supabase/supabase-js';

// 客户端（浏览器，有限权限）
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 服务端（API Routes，完整权限）
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

### 步骤 5：TypeScript 类型定义

```typescript
// types/index.ts

export type CaseStatus =
  | 'uploaded'
  | 'analyzing'
  | 'awaiting-answers'
  | 'generating'
  | 'completed'
  | 'failed';

export type Defensibility = '强' | '中' | '弱';

export interface Case {
  id: string;
  email: string | null;
  status: CaseStatus;
  created_at: string;
}

export interface Analysis {
  id: string;
  case_id: string;
  violation_type: string | null;
  cited_articles: string[];
  penalty_amount: number | null;
  defense_deadline: string | null;
  hearing_eligible: boolean;
  procedure_issues: string[];
  defensibility: Defensibility | null;
  defensibility_reason: string | null;
  questions: Question[] | null;
  answers: Record<string, string> | null;
}

export interface Question {
  key: string;
  text: string;
  type: 'boolean' | 'text' | 'date' | 'choice';
  options?: string[];   // type === 'choice' 时
  why: string;          // 为什么问这个
  required: boolean;
}

export interface Document {
  id: string;
  case_id: string;
  statement_md: string | null;
  statement_pdf_path: string | null;
  evidence_checklist_md: string | null;
  hearing_application_md: string | null;
  email_sent_at: string | null;
}
```

### 验证标准
- [ ] SQL Migration 执行成功，4 张表创建完成
- [ ] Storage Bucket 创建完成
- [ ] 从 Next.js API 能正常插入和查询 cases 表
- [ ] 文件上传到 gjtong-uploads 成功

---

## M2：Claude API 集成

### 目标
封装 Claude API 调用，验证 PDF 文书可被正确读取和分析。

### Claude API 封装（`lib/claude.ts`）

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { loadSkills } from './skills';
import type { Analysis, Question } from '@/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ===== Flow 1：分析处罚文书 =====
export async function analyzePenaltyDocument(
  fileBuffer: Buffer,
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png'
): Promise<Analysis> {
  const skills = loadSkills();

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: buildAnalysisSystemPrompt(skills),
    messages: [{
      role: 'user',
      content: [
        mimeType === 'application/pdf'
          ? {
              type: 'document' as const,
              source: {
                type: 'base64' as const,
                media_type: 'application/pdf' as const,
                data: fileBuffer.toString('base64'),
              },
            }
          : {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: mimeType,
                data: fileBuffer.toString('base64'),
              },
            },
        {
          type: 'text',
          text: ANALYSIS_USER_PROMPT,
        },
      ],
    }],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');

  return parseAnalysisJSON(content.text);
}

// ===== Flow 2：生成申辩书（流式） =====
export async function* generateDefenseDocument(
  analysis: Analysis,
  answers: Record<string, string>
): AsyncGenerator<string> {
  const skills = loadSkills();

  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    system: buildGenerationSystemPrompt(skills),
    messages: [{
      role: 'user',
      content: buildGenerationUserPrompt(analysis, answers),
    }],
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }
}

// ===== 提示词构建 =====
const ANALYSIS_USER_PROMPT = `
请仔细阅读上传的行政处罚文书，按照系统提示中的要求进行分析。

必须以 JSON 格式输出，格式如下：
{
  "violation_type": "极限词|食品疾病功效|虚假宣传|医疗广告|其他",
  "cited_articles": ["§9③", "§55"],
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
    }
  ]
}

注意：
1. 所有法律条款引用必须来自知识库，不得自行创造
2. questions 数组最多 5 道题
3. 如果文书内容无法识别，在 defensibility_reason 中说明原因
`;

function buildGenerationUserPrompt(
  analysis: Analysis,
  answers: Record<string, string>
): string {
  return `
请根据以下案件信息，生成陈述申辩意见书。

【案件分析结果】
违规类型：${analysis.violation_type}
引用条款：${analysis.cited_articles.join('、')}
拟处罚金额：${analysis.penalty_amount ? `${analysis.penalty_amount / 10000}万元` : '未知'}
申辩截止：${analysis.defense_deadline}
是否可申请听证：${analysis.hearing_eligible ? '是（需3日内申请）' : '否'}
程序问题：${analysis.procedure_issues.join('；') || '无明显程序问题'}
可申辩性：${analysis.defensibility}
评估理由：${analysis.defensibility_reason}

【用户回答】
${Object.entries(answers)
  .map(([key, value]) => {
    const q = analysis.questions?.find(q => q.key === key);
    return `${q?.text || key}：${value}`;
  })
  .join('\n')}

【输出要求】
1. 生成陈述申辩意见书正文（2000-4000字）
2. 分隔线后生成证据清单
3. 如符合听证条件，分隔线后生成听证申请书
4. 严格按照知识库中的文书格式
5. 所有法律条款引用必须准确
`;
}
```

### 知识库加载（`lib/skills.ts`）

```typescript
import fs from 'fs';
import path from 'path';

let cachedSkills: string | null = null;

export function loadSkills(): string {
  if (cachedSkills) return cachedSkills;

  const skillsDir = path.join(process.cwd(), 'skills');
  const files = [
    'advertising-law.md',
    'administrative-law.md',
    'document-formats.md',
    'case-strategies.md',
    'workflow-analysis.md',
  ];

  cachedSkills = files
    .filter(f => fs.existsSync(path.join(skillsDir, f)))
    .map(f => {
      const content = fs.readFileSync(path.join(skillsDir, f), 'utf-8');
      return `## ${f.replace('.md', '')}\n\n${content}`;
    })
    .join('\n\n---\n\n');

  return cachedSkills;
}

export function buildAnalysisSystemPrompt(skills: string): string {
  return `你是专业的行政处罚法律分析助手，专注于中国市场监督管理广告违规案件。

你的任务是分析行政处罚文书，提取关键信息，评估申辩空间，生成问卷。

# 知识库

${skills}

# 输出要求
- 必须以合法 JSON 格式输出，不包含任何其他文字
- 法律条款引用必须来自知识库，严禁自行编造
- 问卷最多 5 道题，聚焦最重要的从轻情节`;
}

export function buildGenerationSystemPrompt(skills: string): string {
  return `你是专业的行政法律文书起草助手，专注于行政处罚陈述申辩意见书。

你的任务是基于案件分析结果和当事人回答，起草专业的陈述申辩意见书。

# 知识库

${skills}

# 起草要求
- 严格按照知识库中的文书格式
- 所有法律条款引用必须准确，附条号
- 语言专业、措辞严谨，符合法律文书风格
- 申辩理由具体、有针对性，不写空话套话
- 直接输出文书内容，不要任何解释或前缀`;
}
```

### 验证标准
- [ ] 用一份真实处罚通知书（PDF）调用 `analyzePenaltyDocument`，返回合法 JSON
- [ ] JSON 中法律条款引用准确（手动核对）
- [ ] 流式生成测试：`generateDefenseDocument` 能流式输出文书文本
- [ ] 图片输入（手机拍照）也能正确识别

---

## M3：AI 知识库构建

### 目标
构建 5 个高质量的 Skills 文件，这是 AI 生成文书质量的核心基础。

### 文件 1：`skills/advertising-law.md`

```markdown
# 广告法核心条款与违规识别

## 关键条款原文（2021年修正版）

### 第4条（真实合法原则）
广告不得含有虚假或者引人误解的内容，不得欺骗、误导消费者。

### 第9条第3项（绝对化用语禁止）
广告中不得使用"国家级"、"最高级"、"最佳"等用语。

**违规识别：** 广告中使用表示最高级、排他性的词语，且非来自有时间限定的
第三方机构授奖。

**禁止词汇（常见）：**
最好、最优、最强、最高、最大、最多、最安全、最先进、最有效、
第一、唯一、顶级、极品、无敌、超越同类、行业领先（无数据支撑）、
国家级（非经国家机关授予）、世界级（无国际认证）

**例外情形：** 经有公信力的第三方机构颁发的奖项，且广告中有明确时间限定
（如"2024年度最佳品牌"并标明颁奖机构），可区别于绝对化用语。

### 第17条（食品保健品疾病功效禁止）
除医疗、药品、医疗器械广告外，禁止其他任何广告涉及疾病治疗功能，并不
得使用医疗用语或者易使推销的商品与药品、医疗器械相混淆的用语。

**违规识别：** 普通食品、保健品广告中含有"治疗"、"预防"、"缓解"某疾病
的表述，或暗示可替代药物治疗的内容。

**常见违规表述：**
降血糖、降血压、预防癌症、治疗糖尿病、改善心血管、抗肿瘤、
根治风湿、消炎杀菌（作为疾病治疗功效）

### 第28条（虚假广告）
广告有下列情形之一的，为虚假广告：
（一）商品或者服务不存在的；
（二）商品的性能、功能、产地、用途、质量、规格、成分、价格、生产者、
有效期限、销售状况、曾获荣誉等信息，或者服务的内容、提供者、形式、
质量、价格、销售状况、曾获荣誉等信息，以及与商品或者服务有关的允诺等
信息与实际情况不符，对购买行为有实质性影响的……

### 第55条、第57条（处罚依据）
发布违法广告：责令停止发布广告，责令广告主在相应范围内消除影响，处广告
费用三倍以上五倍以下的罚款，广告费用无法计算或者明显偏低的，处二十万元
以上一百万元以下的罚款……

## 各违规类型处罚标准速查

| 违规类型 | 主要条款 | 一般罚款幅度 |
|---------|---------|------------|
| 极限词 | §9③、§55 | 20-100万元 |
| 食品疾病功效 | §17、§55 | 20-100万元 |
| 虚假广告 | §28、§55 | 广告费3-5倍，或20-100万元 |
| 未审批医疗广告 | §46、§58 | 15-30万元，可吊证 |
| 使用国家机关名义 | §9①、§57 | 20-100万元 |
```

### 文件 2：`skills/administrative-law.md`

```markdown
# 行政处罚法关键条款（申辩与减轻）

## 第32条：应当从轻或者减轻行政处罚的情形

有下列情形之一的，应当依法从轻或者减轻行政处罚：
（一）主动消除或者减轻违法行为危害后果的；
（二）受他人胁迫或者诱骗实施违法行为的；
（三）主动供述行政机关尚未掌握的违法行为的；
（四）配合行政机关查处违法行为有立功表现的；
（五）法律、法规、规章规定其他应当从轻或者减轻行政处罚的。

**实务要点：** 第（一）项最常用，指收到调查通知后主动下架涉案广告。

## 第33条：不予行政处罚的情形

违法行为轻微并及时改正，没有造成危害后果的，不予行政处罚。
初次违法且危害后果轻微并及时改正的，可以不予行政处罚。

**实务要点：** "初次违法"指同类违规首次被处罚。需同时满足：
1. 初次违法
2. 危害后果轻微（传播范围小、无消费者实质投诉）
3. 及时改正（收到通知后立即下架/修改）

## 第44条：陈述申辩权利

行政机关在作出行政处罚决定之前，应当告知当事人拟作出的行政处罚内容
及事实、理由、依据，并告知当事人依法享有陈述、申辩的权利。

## 第45条：陈述申辩的采纳

当事人有权进行陈述和申辩。行政机关必须充分听取当事人的意见，对当事人
提出的事实、理由和证据，应当进行复核；当事人提出的事实、理由或者证据
成立的，行政机关应当采纳。
行政机关不得因当事人申辩而加重处罚。

**重要：** 申辩不会导致处罚加重，消除用户顾虑。

## 第63条：听证权利（重要！）

行政机关拟作出下列行政处罚决定，应当告知当事人有要求举行听证的权利：
（一）较大数额罚款；
（二）没收较大数额违法所得、没收较大价值非法财物；
（三）降低资质等级、吊销许可证件；
（四）责令停产停业、责令关闭、限制从业；
（五）其他较重的行政处罚。

**"较大数额罚款"认定：** 各地标准不一，一般省级为10万元以上，
部分地市为5万元以上。如拟处罚款≥10万元，通常有权申请听证。

**听证申请期限：** 收到告知书后 **3日内** 提出申请（注意：非15日！）

## 常见程序违法情形（可作为辩护依据）

| 情形 | 法律依据 | 法律后果 |
|------|---------|---------|
| 未告知陈述申辩权利 | §44 | 处罚决定违法，可申请复议 |
| 未告知听证权利（符合条件时）| §63 | 同上 |
| 超过法定调查期限 | 各地规定 | 程序瑕疵 |
| 文书未依法送达 | §61 | 申辩期限重新计算 |
```

### 文件 3：`skills/document-formats.md`

```markdown
# 陈述申辩意见书标准格式

## 格式规范

**标题：** 居中，加粗，"陈 述 申 辩 意 见 书"（字间距适当）

**申请人信息：**
申请人：[企业全称]
统一社会信用代码：[代码]
法定代表人：[姓名]，[职务]
联系地址：[注册地址]
联系电话：[电话]

**收件方：** [XX市/区市场监督管理局]

**事由：** 就贵局[案号]行政处罚事先告知书提出陈述申辩意见

---

## 正文结构（必须按此顺序）

### 一、关于违法事实的陈述
针对告知书认定的违规事实，逐条陈述己方立场。
- 对事实本身无异议的，直接承认，不可回避
- 对事实有异议的，提出具体反驳和证据
- 对法律定性有异议的，说明理由

### 二、法律适用分析
- 引用条款是否准确适用于本案情况
- 处罚幅度是否在法定范围内
- 如有定性争议，引用相关判例或规范性文件

### 三、请求从轻/减轻处罚的理由
逐条列明从轻情节，每条对应《行政处罚法》具体条款：
1. [情节一]——依据《行政处罚法》第32条第X项
2. [情节二]——依据……

### 四、程序性意见（如有）
如发现告知程序存在问题，此处提出，但不作为主要辩护方向。

### 五、申辩请求
综上所述，申请人请求贵局：
1. 认定本案符合从轻/减轻处罚情形；
2. 将罚款金额减至合理幅度（建议金额）。

---

**落款：**
申请人：[企业名称]（加盖公章）
法定代表人签字：___________
日期：____年____月____日

---

## 听证申请书格式

**标题：** 听证申请书

**正文：**
申请人：[企业全称]
被申请机关：[市监局名称]
申请事项：依据《行政处罚法》第63条，就[案号]拟处罚款[金额]元，
申请举行听证。

申请理由：[简要说明，通常1-2句即可]

申请人：（签章）
日期：

**注意：** 听证申请书必须在收到告知书后3日内提交，务必保留提交凭证。
```

### 文件 4：`skills/case-strategies.md`

```markdown
# 真实案例辩护策略库

## 策略一：第三方奖项区分策略（对应极限词违规）

**来源案例：** A-1 上海某云计算公司诉市场监管局（2019年，最终撤销处罚）

**适用条件：**
- 广告中使用的"最佳"等词汇来自第三方机构颁发的奖项
- 奖项有明确的时间限定（如"2023年度"）
- 颁奖机构是有公信力的行业组织

**辩护论点模板：**
"涉案广告中'[词汇]'一词，系[颁奖机构]于[年份]颁发的[奖项名称]荣誉称号，
属于对第三方机构评价结果的如实转述，而非广告主对自身的无限定优越声明。
该奖项有明确时间限定，不构成广告法第9条第3项规制的绝对化用语。"

**需要收集的证据：**
- 颁奖证书原件（含颁发机构公章）
- 颁奖机构的注册信息证明
- 颁奖活动的公开报道（证明活动真实存在）

---

## 策略二：被动信息滞后策略（对应虚假广告违规）

**来源案例：** A-2 某订房平台诉北京朝阳区市监局（2021年，最终撤销处罚）

**适用条件：**
- 违规内容由第三方平台或系统自动同步，非主动发布
- 信息更新存在客观技术延迟
- 发现后已及时申请更正

**辩护论点模板：**
"涉案广告内容系由[平台名称]系统自动同步的历史信息，申请人对该信息的
实时更新存在技术局限，主观上无发布虚假广告的故意。这与当事人主动捏造
虚假信息并发布的行为有本质区别，不宜认定为虚假广告。收到通知后，
申请人已于[日期]立即申请平台删除，并提供了平台受理记录。"

**需要收集的证据：**
- 平台与企业的数据同步协议或服务条款
- 申请平台修改的记录（时间戳）
- 平台修改记录截图

---

## 策略三：首次违规减轻策略（通用）

**适用条件：** 此前无同类型广告违规记录

**辩护论点模板：**
"申请人自成立以来，严格遵守广告法律法规，本次系首次因广告内容被调查处理，
符合《行政处罚法》第33条关于'初次违法'的认定条件。申请人在收到贵局告知
后，立即于[日期]全面排查并下架了涉案广告内容，违法行为已及时改正，
且未造成实质性危害后果，请求适用不予处罚或减轻处罚。"

**需要收集的证据：**
- 企业营业执照（证明成立时间）
- 无同类行政处罚记录的证明（可向当地市监局申请）

---

## 策略四：主动整改减轻策略（通用）

**适用条件：** 已主动下架涉案广告或修改内容

**辩护论点模板：**
"申请人收到贵局调查通知/告知书后，立即组织内部合规自查，于[日期]
全面下架涉案广告内容，并对相关营销材料进行了系统性整改，主动消除了
违法行为的危害后果，符合《行政处罚法》第32条第（一）项规定的
从轻处罚情形。"

**需要收集的证据：**
- 广告下架操作记录截图（含时间戳）
- 各发布平台的下架确认截图
- 整改后的广告内容（如已修改重新发布）
```

### 文件 5：`skills/workflow-analysis.md`

```markdown
# Flow 1 分析工作流指导

## 分析步骤

### 步骤1：识别文书类型
确认上传文书是：
- 行政处罚事先告知书（可提陈述申辩，这是目标文书类型）
- 行政处罚决定书（申辩窗口已关闭，提示用户考虑复议）
- 立案通知书（还在调查阶段，暂无申辩需求）

如是决定书或立案通知书，在 defensibility_reason 中说明情况。

### 步骤2：提取结构化信息
必须提取：案号、被处罚主体、违规事实、引用条款、拟处罚金额、
申辩期限天数、文书日期

### 步骤3：判断违规类型
按以下优先级判断（一个文书可能涉及多种违规，选主要类型）：
1. 极限词（第9条第3项）
2. 食品/保健品疾病功效（第17条）
3. 虚假广告（第28条）
4. 未审批医疗广告（第46条）
5. 使用国家机关名义（第9条第1项）
6. 其他

### 步骤4：评估申辩空间
强（有较大减罚空间）：
- 存在明显程序违法（未告知权利等）
- 法律定性有明显争议（如极限词来自第三方奖项）
- 符合不予处罚条件（首违+轻微+已改正）

中（有一定减罚空间）：
- 首次违规，且已主动整改
- 有可参考的成功辩护案例
- 处罚幅度偏高，有量罚争议空间

弱（申辩空间有限）：
- 违规事实清楚，无争议
- 非首次同类违规
- 处罚幅度在合理范围内

### 步骤5：生成问卷（最多5道题）

必问（所有违规类型）：
1. 涉案广告是否已下架/修改？→ 从轻依据
2. 此前是否受过同类广告违规处罚？→ 首违认定

按违规类型追加：

极限词违规追加：
3. 该词汇是否来自第三方机构颁发的奖项？（如有，奖项名称和颁发机构）

食品/保健品违规追加：
3. 涉案产品是否有保健食品批准文号或相关资质证书？

虚假广告追加：
3. 涉案内容是否由第三方平台自动同步（非手动发布）？

大额罚款（≥10万）追加（作为最后一题）：
最后一题：您是否知道可以申请听证？听证需在3日内提出申请。
（这不是问题，是提醒，type 设为 'info'）
```

### 验证标准
- [ ] 5 个 Skills 文件都已创建
- [ ] 法律条文原文准确（对照 PDF 原文核实）
- [ ] `loadSkills()` 能正确加载所有文件
- [ ] Token 总量估算 ≤ 20,000（用 Anthropic Tokenizer 检查）
- [ ] 将 Skills 注入 Claude，验证能正确回答法律问题

---

## M4：Flow 1 处罚文书分析

### 目标
实现文书上传 → Claude 分析 → 显示结果 + 问卷的完整路径。

### API Route：`/api/cases`（创建案件）

```typescript
// app/api/cases/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { filename, mimeType } = await req.json();

  // 创建 case 记录
  const { data: case_, error } = await supabaseServer
    .schema('guangjiantong')
    .from('cases')
    .insert({ status: 'uploaded' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 生成上传 URL（前端直传 Storage）
  const storagePath = `${case_.id}/document${getExtension(mimeType)}`;
  const { data: uploadData } = await supabaseServer.storage
    .from('gjtong-uploads')
    .createSignedUploadUrl(storagePath);

  // 记录文件信息
  await supabaseServer
    .schema('guangjiantong')
    .from('files')
    .insert({ case_id: case_.id, storage_path: storagePath, mime_type: mimeType });

  return NextResponse.json({
    caseId: case_.id,
    uploadUrl: uploadData!.signedUrl,
  });
}
```

### API Route：`/api/analyze`（流式分析）

```typescript
// app/api/analyze/route.ts
export async function POST(req: NextRequest) {
  const { caseId } = await req.json();

  // 更新状态
  await supabaseServer.schema('guangjiantong')
    .from('cases').update({ status: 'analyzing' }).eq('id', caseId);

  // 下载文件
  const file = await getFile(caseId);
  const { data: fileData } = await supabaseServer.storage
    .from('gjtong-uploads').download(file.storage_path);
  const buffer = Buffer.from(await fileData!.arrayBuffer());

  // 流式响应
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: object) => {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ type, ...data })}\n\n`)
        );
      };

      try {
        sendEvent('status', { message: '正在识别文书内容...' });

        const result = await analyzePenaltyDocument(buffer, file.mime_type);

        // 写入数据库
        await supabaseServer.schema('guangjiantong')
          .from('analysis').insert({ case_id: caseId, ...result });

        await supabaseServer.schema('guangjiantong')
          .from('cases').update({ status: 'awaiting-answers' }).eq('id', caseId);

        sendEvent('result', { analysis: result });
      } catch (err) {
        await supabaseServer.schema('guangjiantong')
          .from('cases').update({
            status: 'failed',
            error_message: String(err)
          }).eq('id', caseId);

        sendEvent('error', { message: '分析失败，请重新上传清晰的文书图片' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
```

### 验证标准
- [ ] 上传 PDF 处罚通知书，能正确提取违规类型、金额、截止日期
- [ ] 上传手机拍照图片，也能识别（图片需≥800×600像素）
- [ ] 问卷生成合理（问题与违规类型相关）
- [ ] 流式事件能被前端正确接收

---

## M5：Flow 2 申辩书生成

### 目标
实现问卷提交 → 生成申辩书 → PDF 转换 → 邮件发送的完整路径。

### API Route：`/api/generate`（流式生成）

```typescript
// app/api/generate/route.ts
export async function POST(req: NextRequest) {
  const { caseId, answers, email } = await req.json();

  // 保存邮箱和回答
  await supabaseServer.schema('guangjiantong')
    .from('cases').update({ email, status: 'generating' }).eq('id', caseId);

  await supabaseServer.schema('guangjiantong')
    .from('analysis').update({ answers }).eq('case_id', caseId);

  // 读取分析结果
  const { data: analysis } = await supabaseServer.schema('guangjiantong')
    .from('analysis').select().eq('case_id', caseId).single();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: object) =>
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ type, ...data })}\n\n`)
        );

      try {
        send('status', { message: '正在起草申辩理由...' });

        let fullText = '';
        for await (const chunk of generateDefenseDocument(analysis, answers)) {
          fullText += chunk;
          send('chunk', { text: chunk });
        }

        send('status', { message: '正在生成 PDF...' });

        // 解析输出（申辩书 + 证据清单 + 听证申请书）
        const { statement, evidenceChecklist, hearingApplication } =
          parseDocumentOutput(fullText);

        // 生成 PDF
        const pdfBuffer = await generatePDF(statement);

        // 上传 PDF
        const pdfPath = `${caseId}/statement.pdf`;
        await supabaseServer.storage
          .from('gjtong-outputs').upload(pdfPath, pdfBuffer);

        // 写入数据库
        await supabaseServer.schema('guangjiantong')
          .from('documents').insert({
            case_id: caseId,
            statement_md: statement,
            statement_pdf_path: pdfPath,
            evidence_checklist_md: evidenceChecklist,
            hearing_application_md: hearingApplication || null,
          });

        send('status', { message: '正在发送邮件...' });

        // 发送邮件
        await sendDocumentEmail({
          email,
          pdfBuffer,
          analysis,
          hearingApplication,
        });

        // 更新数据库
        await supabaseServer.schema('guangjiantong').from('documents')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('case_id', caseId);

        await supabaseServer.schema('guangjiantong').from('cases')
          .update({ status: 'completed' }).eq('id', caseId);

        send('done', { message: '申辩书已发送到您的邮箱' });

      } catch (err) {
        await supabaseServer.schema('guangjiantong').from('cases')
          .update({ status: 'failed', error_message: String(err) })
          .eq('id', caseId);
        send('error', { message: '生成失败，请联系客服' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
```

### 邮件发送（`lib/email.ts`）

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendDocumentEmail({
  email,
  pdfBuffer,
  analysis,
  hearingApplication,
}: {
  email: string;
  pdfBuffer: Buffer;
  analysis: Analysis;
  hearingApplication?: string | null;
}) {
  const deadline = analysis.defense_deadline
    ? format(new Date(analysis.defense_deadline), 'yyyy年MM月dd日')
    : '请尽快确认';

  const attachments = [
    {
      filename: '陈述申辩意见书.pdf',
      content: pdfBuffer,
    },
  ];

  if (hearingApplication) {
    const hearingPdf = await generatePDF(hearingApplication);
    attachments.push({
      filename: '听证申请书.pdf',
      content: hearingPdf,
    });
  }

  await resend.emails.send({
    from: 'guangjiantong <noreply@guangjiantong.cn>',
    to: email,
    subject: `您的陈述申辩意见书已生成 | 截止日期：${deadline}`,
    html: `
      <h2>您的陈述申辩意见书已生成</h2>

      <p>⚠️ <strong>申辩截止日期：${deadline}</strong>，请务必在此日期前向市监局提交。</p>

      ${hearingApplication ? `
      <p>🔔 <strong>听证申请截止：收到告知书后3日内</strong>，如需申请请立即行动！</p>
      ` : ''}

      <p>附件包含：</p>
      <ul>
        <li>✓ 陈述申辩意见书.pdf（可直接打印、盖章、提交）</li>
        ${hearingApplication ? '<li>✓ 听证申请书.pdf</li>' : ''}
      </ul>

      <p><strong>提交建议：</strong></p>
      <ul>
        <li>打印后加盖企业公章</li>
        <li>以书面形式提交至处罚机关，保留送达回执</li>
        <li>如有条件，建议提交前请律师审核</li>
      </ul>

      <hr />
      <p style="color: #666; font-size: 12px;">
        免责声明：本文书由 AI 辅助生成，仅供参考，不构成法律意见。
        最终效果取决于具体案情和执法机关裁量。
      </p>
    `,
    attachments,
  });
}
```

### 验证标准
- [ ] 完整测试：Flow 1 → 填问卷 → Flow 2 → 邮件到达
- [ ] PDF 中文字体正常显示（无乱码）
- [ ] 法律条款引用准确（人工核对 3 个测试案例）
- [ ] 罚款 ≥ 10 万时自动附上听证申请书

---

## M6：前端界面

### 目标
构建简洁、移动端优先的 3 页 UI。

### 页面 1：落地页 `/`（= 上传入口）

```
┌──────────────────────────────────────────────────┐
│                   广监通                           │
│     收到广告处罚通知书，15 分钟生成专业申辩书        │
├──────────────────────────────────────────────────┤
│                                                  │
│         ┌─────────────────────────┐              │
│         │   📄 上传处罚文书        │              │
│         │                         │              │
│         │  拖拽文件到此处          │              │
│         │  或点击选择 / 拍照       │              │
│         │                         │              │
│         │  支持 PDF、JPG、PNG      │              │
│         └─────────────────────────┘              │
│                                                  │
│  ✓ 15分钟内生成                                   │
│  ✓ 申辩书发送至您的邮箱                            │
│  ✓ 所有内容基于《广告法》《行政处罚法》             │
├──────────────────────────────────────────────────┤
│  ⚠️ 本工具仅供参考，不构成法律意见                 │
└──────────────────────────────────────────────────┘
```

### 页面 2：案件详情页 `/case/[id]`

```
┌──────────────────────────────────────────────────┐
│  ← 返回                              广监通       │
├──────────────────────────────────────────────────┤
│  🔴 距申辩截止还有 12 天（3月28日）               │ ← 最醒目
├──────────────────────────────────────────────────┤
│  分析结果                                         │
│  违规类型：使用绝对化用语（广告法§9③）            │
│  拟处罚金额：20万元                               │
│  可申辩性：【中】 首次违规，有减罚空间             │
│  ⚠️ 符合听证条件，需在3日内申请（可选）           │
├──────────────────────────────────────────────────┤
│  请回答以下问题                                    │
│  ─────────────────────────────────────────────   │
│  1/4 涉案广告是否已下架或修改？                   │
│  （主动消除违法后果，是法定从轻情节）              │
│  ● 是，已下架  ○ 否  ○ 正在处理                   │
│                                                  │
│  2/4 此前是否受过广告违规处罚？                   │
│  ○ 是  ● 否，首次                               │
│                                                  │
│  3/4 ...                                         │
│                                                  │
│  您的邮箱：___________________________            │
│  （申辩书将发送至此邮箱）                          │
│                                                  │
│  [生成陈述申辩意见书]                             │
└──────────────────────────────────────────────────┘
```

### 页面 3：完成页 `/done`

```
┌──────────────────────────────────────────────────┐
│                   ✓ 已发送                        │
│         申辩书已发送至您的邮箱                      │
├──────────────────────────────────────────────────┤
│  接下来请：                                        │
│                                                  │
│  1. 查收邮件（可能在垃圾邮件文件夹）               │
│  2. 打印陈述申辩意见书                            │
│  3. 加盖企业公章                                  │
│  4. 在截止日期前提交给市监局                       │
│     └── ⚠️ 截止：3月28日（还有12天）             │
│                                                  │
│  如有疑问，建议咨询专业律师进行最终审核。          │
├──────────────────────────────────────────────────┤
│  [重新分析另一份文书]                              │
└──────────────────────────────────────────────────┘
```

### 关键组件实现

**`DeadlineCountdown.tsx`**
```typescript
export function DeadlineCountdown({ deadline }: { deadline: string }) {
  const days = differenceInDays(new Date(deadline), new Date());
  const variant = days <= 7 ? 'destructive' : days <= 15 ? 'warning' : 'default';

  return (
    <Alert variant={variant} className="text-lg font-bold">
      {days > 0
        ? `⏰ 距申辩截止还有 ${days} 天（${format(new Date(deadline), 'M月d日')}）`
        : '⚠️ 申辩窗口已关闭，建议考虑行政复议'
      }
    </Alert>
  );
}
```

### 验证标准
- [ ] 手机端（375px 宽度）三个页面完整可用
- [ ] 文件上传支持手机摄像头直接拍照
- [ ] 截止日期倒计时颜色正确（7天内红色）
- [ ] 问卷每道题显示"为什么问这个"
- [ ] 生成过程有明确的状态反馈

---

## M7：测试与上线

### 测试用例（4 个必测场景）

**场景 1：极限词违规**
- 输入：含"最优质产品"的处罚通知书，罚款 20 万元
- 预期：识别 §9③，可申辩性中，问题含第三方奖项询问

**场景 2：食品疾病功效**
- 输入：保健品"预防癌症"广告处罚通知书，罚款 30 万元
- 预期：识别 §17，可申辩性弱，问题含产品资质询问

**场景 3：大额罚款（≥10万）**
- 输入：任意违规，罚款 15 万元
- 预期：输出包含听证申请书，邮件有听证截止日期提醒

**场景 4：低质量扫描件**
- 输入：模糊不清的手机照片
- 预期：Claude 输出低置信度提示，前端提示重新上传

### 质量验收

在上线前由具备行政法知识的人员（律师/法务）审核：
- 法律条款引用是否准确
- 申辩理由是否符合逻辑
- 文书格式是否规范
- 是否存在明显错误

### 上线检查清单

**法律合规：**
- [ ] 所有页面底部显示免责声明
- [ ] 邮件中包含免责声明
- [ ] 发送文书前弹窗确认（用户知晓 AI 生成，建议律师复核）

**技术：**
- [ ] Vercel Pro 订阅（300 秒超时）
- [ ] 环境变量全部配置
- [ ] 域名 + SSL 配置
- [ ] ICP 备案（可先用香港 Vercel 节点过渡）

**监控：**
- [ ] Claude API 每日成本告警（$30 上限）
- [ ] Vercel 函数错误通知
- [ ] 邮件发送成功率监控（Resend Dashboard）

---

*文档结束*

**相关文档：**
- [PRD_广监通AI.md](PRD_广监通AI.md) — 产品需求文档
- [ARCHITECTURE_广监通AI.md](ARCHITECTURE_广监通AI.md) — 系统架构设计
