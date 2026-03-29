# 广监通 AI Agent — 产品需求文档（PRD）

**版本：** v2.0（精简版）
**日期：** 2026-03-08
**核心原则：** 小而美，只服务一类人，服务到极致

---

## 目录

1. [我们要构建什么](#1-我们要构建什么)
2. [问题背景与市场机会](#2-问题背景与市场机会)
3. [目标用户](#3-目标用户)
4. [产品范围](#4-产品范围)
5. [技术栈](#5-技术栈)
6. [核心功能设计](#6-核心功能设计)
7. [约束条件](#7-约束条件)
8. [任务模组（Vibe Coding 实现步骤）](#8-任务模组)
9. [成功标准](#9-成功标准)

---

## 1. 我们要构建什么

**广监通** 是一个专门帮助收到**市场监督管理局广告类行政处罚事先告知书**的企业，在 15 天申辩窗口内，快速生成专业陈述申辩意见书的 AI 工具。

用户体验极简：上传文书拍照 → 回答几个问题 → 收到邮件附件（可直接打印提交的申辩书）。

**核心价值：**
> 让没有律师的小企业，也能用好自己本来就有的申辩权利，争取减轻处罚。

---

## 2. 问题背景与市场机会

### 行政处罚流程中的关键窗口

```
市监局发出【行政处罚事先告知书】
    ↓
企业有 15 天提交陈述申辩意见书     ← 广监通服务的窗口
企业有 3 天申请听证（罚款≥10万时） ← 同步提示
    ↓
市监局审查申辩意见
    ↓
下达【行政处罚决定书】
```

### 市场数据

- 2025 年全国处理违法广告案件：**44,521 件**，罚款总额 **2.52 亿元**
- 罚款主要集中在 **10-50 万元** 区间
- 绝大多数企业选择直接认罚——不是因为没有申辩空间，而是**不知道怎么申辩**

### 申辩真正的价值

申辩的目标通常不是"打赢"（撤销处罚），而是**减少罚款金额**。

《行政处罚法》第 32-33 条明确规定，以下情形应当从轻或减轻处罚：
- 首次违规
- 主动下架/整改
- 配合调查
- 危害后果轻微

这些条件大多数被处罚企业都满足，却因为不写申辩书而白白放弃了减罚机会。

---

## 3. 目标用户

**只服务一类人：** 收到广告类行政处罚事先告知书、需要提交陈述申辩意见书的企业主或负责人。

### 用户画像

- **行业：** 食品/保健品、医美、直播电商、普通零售（案例显示最高频）
- **罚款金额：** 10-80 万元（低于此不值得折腾，高于此会找律师）
- **法律背景：** 几乎为零，看不懂法律条文
- **状态：** 焦虑，时间紧，在手机上处理
- **核心疑问：** 我能申辩吗？申辩有没有用？该说什么？

### 用户旅程

```
收到处罚通知书（拍照）
    ↓
打开广监通，上传照片
    ↓
AI 分析：违规类型、引用条款、可申辩空间评估
    ↓
回答 5 道以内的关键问题（5 分钟）
    ↓
填写邮箱
    ↓
收到邮件：PDF 申辩书 + 证据清单 + 期限提醒
    ↓
打印、盖章、提交给市监局
```

### 不服务的用户

- 已收到处罚**决定书**的（申辩窗口已关闭）
- 刑事案件
- 大企业（有法务部）
- 希望平台直接代理诉讼的

---

## 4. 产品范围

### In Scope（本期做）

- **Flow 1：** 处罚文书分析
  - 上传处罚通知书（PDF 或拍照图片）
  - AI 提取：违规事实、引用条款、拟处罚金额、申辩截止日期
  - 评估可申辩空间（强/中/弱）
  - 生成 5 道以内个性化问卷

- **Flow 2：** 申辩文书生成
  - 基于分析结果 + 用户回答
  - 生成陈述申辩意见书（正式法律文书格式）
  - 附带：证据清单、期限提醒
  - 如拟罚款 ≥ 10 万元，同步生成听证申请书
  - 通过邮件发送 PDF

### Out of Scope（本期不做）

- 广告内容事前合规审查
- 行政复议申请书
- 行政诉讼材料
- 用户账号/登录系统
- 付费/订阅功能
- 多案件历史管理

---

## 5. 技术栈

### 整体架构

```
用户浏览器（手机/PC）
    ↓
Vercel（Next.js 16 + API Routes + Streaming）
    ↓
Supabase（PostgreSQL + Storage）
Anthropic Claude API（原生 PDF 支持）
Resend（邮件发送）
```

### 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | Next.js 16 + React 19 | App Router，支持流式响应 |
| UI | shadcn/ui + Tailwind CSS 4 | 统一组件库 |
| 数据库 | Supabase PostgreSQL | 4 张核心表 |
| 文件存储 | Supabase Storage | 上传文书 + 生成 PDF |
| AI | Anthropic Claude API | claude-opus-4-6，直接 API 调用 |
| PDF 处理 | Claude 原生 PDF 支持 | 无需 pdftoppm，直接发送 PDF |
| 邮件 | Resend | 发送申辩书 PDF 附件 |
| 部署 | Vercel Pro | 支持 300 秒超时 + 流式响应 |

### 为什么不用 Agent SDK / Cloud Run / Vercel Sandbox

行政处罚通知书是 1-4 页的文字文档，核心任务是：读文书 → 理解 → 生成文书。

这是**两次顺序的 Claude API 调用**，不需要：
- 多子 Agent 并发（CrossBeam 是为了处理 200 页建筑图纸）
- 独立文件系统（Vercel Sandbox 的设计初衷）
- 长期运行的后端进程（Cloud Run）

精简架构：更快开发，更低运维成本，更容易迭代。

---

## 6. 核心功能设计

### Flow 1：处罚文书分析

**触发：** 用户上传处罚文书（PDF 或 JPG/PNG）

**Claude API Call 1：**
```
输入：处罚文书（PDF/图片）+ 系统提示（包含广告法知识库）
任务：
  1. 提取结构化信息（案号、违规事实、引用条款、金额、截止日期）
  2. 判断违规类型（极限词/食品功效/虚假宣传/医疗广告等）
  3. 评估申辩空间（强/中/弱 + 理由）
  4. 检查程序合规性（是否告知申辩权、听证权）
  5. 生成 5 道以内个性化问卷
输出：结构化 JSON（存入数据库）
```

**前端展示：**
- 申辩截止日期倒计时（最显眼位置）
- 可申辩性评估（强/中/弱，附说明）
- 主要违规认定摘要
- 问卷表单

---

### Flow 2：申辩文书生成

**触发：** 用户完成问卷，填写邮箱，点击"生成申辩书"

**Claude API Call 2：**
```
输入：Flow 1 分析结果 + 用户问卷回答 + 文书格式规范 + 案例策略库
任务：
  1. 生成陈述申辩意见书（2000-4000 字，标准法律文书格式）
  2. 生成证据清单（建议收集的证据逐条说明）
  3. 生成期限提醒（申辩截止、听证申请截止）
  4. 如罚款 ≥ 10 万元，生成听证申请书
输出：Markdown 文书 → 转换 PDF → 发送至用户邮箱
```

**申辩书结构（严格遵循）：**
```
陈述申辩意见书
申请人基本信息
---
一、关于违法事实的陈述（逐条回应）
二、法律适用分析（条款是否准确、量罚是否合法）
三、从轻/减轻处罚的理由（首违、整改、配合等）
四、程序性意见（如有程序瑕疵）
五、申辩请求
```

---

### 问卷设计原则

- **最多 5 道题**（超过用户会放弃）
- 每道题注明"为什么问这个"（减少用户疑惑）
- 根据违规类型动态生成（极限词违规 ≠ 食品功效违规）
- 题型：单选、是/否、日期、简短文字

**通用必问（所有违规类型）：**
1. 涉案广告是否已下架？（何时？）→ 主动消除后果，从轻依据
2. 此前是否受过同类处罚？→ 首次违规认定
3. 广告是否由第三方代理商制作？→ 责任链分析

**按违规类型追加：**
- 极限词：该词是否有第三方机构颁发的奖项支撑？
- 食品功效：产品是否有相关资质证书？
- 虚假宣传：相关内容是否有真实数据支撑？

---

## 7. 约束条件

| 约束 | 处理方式 |
|------|---------|
| 不构成法律意见 | 生成文书前显示免责声明，用户确认后才发送 |
| 不进行法律代理 | 平台定位为"辅助工具"，明确标注 |
| 数据隐私 | 处罚文书含敏感信息，加密存储；明确告知数据不用于训练 |
| 个人信息保护法 | 只收集邮箱，隐私政策明确告知 |
| API 超时 | Vercel Pro（300 秒）+ 流式响应；超时则后台完成后邮件通知 |
| 中文 OCR | 低质量扫描件提示用户重新拍照（清晰度要求） |
| 法律条款引用 | 所有引用必须来自知识库原文，不允许幻觉引用 |

---

## 8. 任务模组

> 按照 Vibe Coding 方式分步实现，共 8 个模组，可独立完成和测试。

### 模组总览

| 模组 | 名称 | 交付物 |
|------|------|--------|
| M0 | 项目脚手架 | 空白项目可运行 |
| M1 | 数据库与存储 | Supabase 配置完成 |
| M2 | Claude API 集成 | PDF 读取 + 分析调用 |
| M3 | AI 知识库 | Skills 文件构建完成 |
| M4 | Flow 1 处罚文书分析 | 分析流程端到端 |
| M5 | Flow 2 申辩书生成 | 文书生成 + PDF 转换 |
| M6 | 前端界面 | 完整 UI/UX |
| M7 | 邮件交付 + 测试上线 | 生产环境就绪 |

---

### M0：项目脚手架（1 天）

**项目结构：**
```
guangjiantong/
├── app/
│   ├── page.tsx              # 落地页
│   ├── case/
│   │   └── [id]/page.tsx     # 案件详情页（分析结果 + 问卷）
│   └── api/
│       ├── cases/route.ts    # 创建案件
│       ├── analyze/route.ts  # 触发 Flow 1（流式）
│       └── generate/route.ts # 触发 Flow 2（流式）
├── components/
│   ├── ui/                   # shadcn/ui 基础组件
│   ├── FileUpload.tsx         # 文书上传组件
│   ├── Questionnaire.tsx      # 问卷表单
│   └── DeadlineCountdown.tsx  # 截止日期倒计时
├── lib/
│   ├── supabase.ts           # Supabase 客户端
│   ├── claude.ts             # Claude API 封装
│   └── pdf.ts                # PDF 生成工具
└── skills/                   # AI 知识库（本地文件）
    ├── advertising-law.md
    ├── administrative-law.md
    ├── document-formats.md
    ├── case-strategies.md
    └── workflow-analysis.md
```

**初始化：**
```bash
npx create-next-app@latest guangjiantong --typescript --tailwind --app
cd guangjiantong
npx shadcn-ui@latest init
npm install @supabase/supabase-js @anthropic-ai/sdk resend @react-pdf/renderer
```

**验证：** `npm run dev` 启动，显示空白落地页。

---

### M1：数据库与存储（1 天）

**数据库 Schema（4 张表）：**

```sql
CREATE SCHEMA IF NOT EXISTS guangjiantong;

-- 案件表
CREATE TABLE guangjiantong.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,                    -- 用户邮箱（唯一标识，无需注册）
  status TEXT DEFAULT 'uploaded' -- uploaded|analyzing|awaiting-answers|generating|completed|failed
  CHECK (status IN ('uploaded','analyzing','awaiting-answers','generating','completed','failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 文件表
CREATE TABLE guangjiantong.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES guangjiantong.cases(id),
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 分析结果表（Flow 1 输出）
CREATE TABLE guangjiantong.analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES guangjiantong.cases(id),
  -- 提取的结构化信息
  violation_type TEXT,           -- 极限词/食品功效/虚假宣传等
  cited_articles TEXT[],         -- 引用条款列表
  penalty_amount NUMERIC,        -- 拟处罚金额
  defense_deadline DATE,         -- 申辩截止日期
  hearing_eligible BOOLEAN,      -- 是否符合听证条件（≥10万）
  defensibility TEXT             -- '强'|'中'|'弱'
  CHECK (defensibility IN ('强','中','弱')),
  defensibility_reason TEXT,     -- 评估理由
  -- 问卷
  questions JSONB,               -- 动态生成的问卷
  answers JSONB,                 -- 用户回答
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 输出文书表（Flow 2 输出）
CREATE TABLE guangjiantong.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES guangjiantong.cases(id),
  statement_md TEXT,             -- 申辩书 markdown
  statement_pdf_path TEXT,       -- PDF 存储路径
  evidence_checklist_md TEXT,    -- 证据清单
  hearing_application_md TEXT,   -- 听证申请书（如适用）
  email_sent_at TIMESTAMPTZ,     -- 邮件发送时间
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Storage Bucket：**
```
gjtong-uploads  -- 用户上传的处罚文书
gjtong-outputs  -- 生成的 PDF 文书
```

**验证：** 表创建成功，能从 Next.js 插入和查询数据。

---

### M2：Claude API 集成（1-2 天）

**封装 Claude API 调用（`lib/claude.ts`）：**

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Flow 1：分析处罚文书
export async function analyzePenaltyDocument(
  fileBuffer: Buffer,
  mimeType: string,
  skillsContent: string
): Promise<AnalysisResult> {
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',  // Claude 原生 PDF 支持
          source: {
            type: 'base64',
            media_type: mimeType as 'application/pdf',
            data: fileBuffer.toString('base64'),
          },
        },
        {
          type: 'text',
          text: buildAnalysisPrompt(skillsContent),
        },
      ],
    }],
  });
  return parseAnalysisResponse(response);
}

// Flow 2：生成申辩书（流式输出）
export async function* generateDefenseDocument(
  analysis: AnalysisResult,
  answers: UserAnswers,
  skillsContent: string
): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: buildGenerationPrompt(analysis, answers, skillsContent),
    }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      yield chunk.delta.text;
    }
  }
}
```

**Skills 注入方式：**
- Skills 文件在构建时读入，作为系统提示的一部分注入 Claude
- 不需要文件系统或 Sandbox，直接作为文本传递

**验证：** 能用一份测试处罚文书调用 Claude API，返回正确的结构化分析结果。

---

### M3：AI 知识库构建（2-3 天）

**文件结构：**
```
skills/
├── advertising-law.md       # 《广告法》关键条款 + 违规类型分类
├── administrative-law.md    # 《行政处罚法》第32-33条（从轻减轻）+ 程序规定
├── document-formats.md      # 陈述申辩意见书标准格式 + 示例
├── case-strategies.md       # 基于真实案例提取的辩护策略
└── workflow-analysis.md     # Flow 1 分析指导（问卷生成规则）
```

**各文件核心内容：**

`advertising-law.md`：
- 广告法第4、9、17、28、55、57条原文
- 违规类型识别规则（极限词词典 300+ 条、食品功效禁用表达等）
- 各违规类型的处罚幅度

`administrative-law.md`：
- 第32条：应当从轻/减轻的情形（6种）
- 第33条：不予处罚的情形（首违+轻微+及时改正）
- 第44-45条：陈述申辩权利
- 第63条：听证权利（适用条件）

`case-strategies.md`（基于 69 个真实案例提取）：
- 极限词：第三方奖项区分策略（A-1 案）
- 虚假宣传：被动信息滞后策略（A-2 案）
- 通用：首违减罚论点模板
- 通用：主动整改论点模板

`document-formats.md`：
- 陈述申辩意见书完整格式（含示例段落）
- 听证申请书格式

**验证：** 将所有 skills 文件注入 Claude，验证输出的法律条款引用准确无误。

---

### M4：Flow 1 处罚文书分析（2-3 天）

**前端：文书上传页（落地页即上传页）**

```typescript
// 核心 UX 原则：不需要注册，进来就能上传
export default function HomePage() {
  return (
    <main>
      <h1>收到广告处罚通知书？</h1>
      <p>上传文书，AI 帮你分析申辩空间，15分钟生成申辩书</p>
      <FileUpload onUpload={handleUpload} />
      {/* 支持拖拽 / 点击 / 手机拍照 */}
    </main>
  );
}
```

**API Route：`/api/analyze`（流式）**

```typescript
export async function POST(req: Request) {
  // 1. 接收文件
  // 2. 上传到 Supabase Storage
  // 3. 创建 case 记录
  // 4. 调用 Claude API（流式）
  // 5. 边生成边写入数据库
  // 6. 返回 case_id，前端跳转到 /case/[id]

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

**案件详情页 `/case/[id]`：**

```
┌─────────────────────────────────┐
│  ⚠️ 距申辩截止还有 12 天         │  ← 最显眼位置
├─────────────────────────────────┤
│  违规认定：使用绝对化用语         │
│  引用条款：广告法第9条第3项        │
│  拟处罚金额：20万元               │
│  可申辩性：中 ─────────          │
│  理由：存在首违减罚空间...        │
├─────────────────────────────────┤
│  请回答以下问题（共4题）          │
│  1. 涉案广告是否已下架？[是/否]   │
│  2. 此前是否受过同类处罚？[是/否] │
│  3. ...                         │
│  [提交并生成申辩书]               │
└─────────────────────────────────┘
```

**验证：** 用真实处罚通知书测试，能正确提取案号、金额、截止日期、违规类型。

---

### M5：Flow 2 申辩书生成（2-3 天）

**API Route：`/api/generate`（流式）**

```typescript
export async function POST(req: Request) {
  const { caseId, answers, email } = await req.json();

  // 1. 读取 Flow 1 分析结果
  // 2. 流式调用 Claude 生成申辩书
  // 3. 生成完成后：转换 PDF
  // 4. 上传 PDF 到 Storage
  // 5. 发送邮件（含 PDF 附件）
  // 6. 更新 case 状态为 completed
}
```

**PDF 生成（`lib/pdf.ts`）：**

```typescript
import { jsPDF } from 'jspdf';
// 或使用 puppeteer（更好的中文排版支持）

export async function generatePDF(markdownContent: string): Promise<Buffer> {
  // 将 markdown 转换为格式化 PDF
  // 字体：宋体（中文标准）
  // 格式：A4，标准法律文书边距
}
```

**邮件发送（Resend）：**

```typescript
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'noreply@guangjiantong.cn',
  to: email,
  subject: `您的陈述申辩意见书已生成【截止日期：${deadline}】`,
  html: emailTemplate,
  attachments: [{ filename: '陈述申辩意见书.pdf', content: pdfBuffer }],
});
```

**验证：** 完整测试 Flow 1 → 用户填问卷 → Flow 2 → 收到邮件附件。

---

### M6：前端界面（2-3 天）

**页面清单（共 3 个页面）：**

```
/          落地页（= 文书上传入口）
/case/[id] 案件页（分析结果 + 问卷 + 生成状态）
/done      完成页（提示查收邮件 + 温馨提示）
```

**关键 UI 组件：**

`DeadlineCountdown.tsx` — 申辩截止倒计时（最重要的组件）
```typescript
// 根据剩余天数变色
// >15天: 灰色
// 8-15天: 黄色
// ≤7天: 红色 + 闪烁
```

`FileUpload.tsx` — 文书上传
```typescript
// 支持：拖拽 / 点击选择 / 手机直接拍照
// accept="application/pdf,image/*"
// 上传前：图片预览（确认文字清晰）
// 文件质量提示："请确保文字清晰可读，印章部分可见"
```

`Questionnaire.tsx` — 动态问卷
```typescript
// 动态渲染 Flow 1 生成的问卷
// 每道题显示："为什么问这个？"
// 支持：是/否、单选、日期、简短文字
// 进度条（第 X 题/共 X 题）
```

`StreamingStatus.tsx` — 生成状态
```typescript
// 显示 AI 生成进度（流式）
// "正在分析违规事实..."
// "正在检索相关案例..."
// "正在起草申辩理由..."
```

**移动端优先设计：** 所有页面需要在手机上完整可用（用户在焦虑状态下用手机操作）。

---

### M7：邮件交付 + 测试上线（2 天）

**邮件内容设计：**

```
主题：您的陈述申辩意见书已生成【请在 XX月XX日 前提交】

正文：
  广监通 AI 已为您生成陈述申辩意见书，请在截止日期前提交。

  ⚠️ 申辩截止：XXXX年XX月XX日（距今 X 天）
  [如适用] ⚠️ 听证申请截止：XXXX年XX月XX日（距今 X 天，仅剩 X 天！）

  附件包含：
  ✓ 陈述申辩意见书.pdf（可直接打印、盖章、提交）
  ✓ 建议收集的证据清单
  [如适用] ✓ 听证申请书.pdf

  重要提示：
  本文书由 AI 辅助生成，仅供参考。建议您在提交前核对个人信息，
  如涉及重大金额，建议咨询专业律师确认。

  [免责声明链接]
```

**测试用例：**

| 测试场景 | 违规类型 | 预期结果 |
|---------|---------|---------|
| Case 1 | 极限词（"最佳"） | 识别 §9③，评估可申辩性中，生成奖项策略相关问题 |
| Case 2 | 食品疾病功效 | 识别 §17，评估弱，生成产品资质相关问题 |
| Case 3 | 罚款 15 万元 | 自动生成听证申请书，提示 3 天申请期限 |
| Case 4 | 低质量扫描件 | 提示重新上传，不强行解析 |

**上线检查清单：**
- [ ] 法律免责声明（页面底部 + 邮件内）
- [ ] 隐私政策（只收集邮箱，说明数据用途）
- [ ] ICP 备案（提前申请，可先用香港服务器过渡）
- [ ] Vercel Pro 套餐（支持 300 秒超时）
- [ ] Claude API 成本告警（每日 $30 上限）
- [ ] Resend 邮件域名验证

---

## 9. 成功标准

### 产品质量

| 指标 | 目标 |
|------|------|
| 文书生成成功率 | ≥ 95%（不报错完成） |
| 法律条款引用准确率 | 100%（必须可在知识库中验证） |
| 违规类型识别准确率 | ≥ 90%（用10个测试案例验证） |
| Flow 1 完成时间 | < 60 秒 |
| Flow 2 完成时间（邮件到达） | < 3 分钟 |

### 用户体验

| 指标 | 目标 |
|------|------|
| 问卷完成率 | ≥ 75%（开始填写到提交） |
| 邮箱填写转化率 | ≥ 60%（看到分析结果后填邮箱） |
| 手机端可用性 | 全流程可在手机完成 |

### 上线后验证（前 30 天）

- [ ] 至少 10 位真实用户完成全流程
- [ ] 收集 3 位用户对申辩书质量的反馈
- [ ] 没有因法律条款引用错误导致的投诉
