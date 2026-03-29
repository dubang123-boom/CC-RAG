# 广监通 AI Agent — 系统架构设计

**版本：** v2.0（精简版）
**日期：** 2026-03-08

---

## 1. 总体架构

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│              用户浏览器（手机 / PC）                      │
│         Next.js 16 + React 19（CSR）                     │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Vercel（前端 + API）                         │
│                                                         │
│  页面路由：/  /case/[id]  /done                          │
│                                                         │
│  API Routes：                                           │
│  POST /api/analyze   → Flow 1（流式响应）                │
│  POST /api/generate  → Flow 2（流式响应）                │
│  POST /api/cases     → 创建案件记录                      │
└──────────────┬────────────────┬───────────────────────--┘
               │                │
               ▼                ▼
┌──────────────────┐   ┌────────────────────────────────┐
│  Anthropic       │   │  Supabase                      │
│  Claude API      │   │  ├── PostgreSQL（案件数据）      │
│                  │   │  └── Storage（文书文件）         │
│  claude-opus-4-6 │   └────────────────────────────────┘
│  原生 PDF 支持    │
└──────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  Resend（邮件发送）                                       │
│  申辩书 PDF 附件 → 用户邮箱                               │
└─────────────────────────────────────────────────────────┘
```

### 架构说明

这是一个**三层架构**：Vercel（前端+API）→ Supabase（数据）+ Claude API（AI）→ Resend（邮件）。

没有独立后端服务，没有消息队列，没有 Agent 框架。

**为什么这样设计就够了：**
- 行政处罚通知书：1-4 页文字，Claude 原生 PDF 支持直接读取
- 核心任务：读文书 → 分析 → 生成文书，本质是两次 Claude API 调用
- Vercel Pro 支持 300 秒超时 + 流式响应，完全覆盖生成时长

---

## 2. 技术栈

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 前端框架 | Next.js | 16 | App Router，服务端渲染 |
| UI | React | 19 | 交互组件 |
| UI 组件库 | shadcn/ui | latest | 设计系统 |
| CSS | Tailwind CSS | 4 | 样式 |
| 数据库 | Supabase PostgreSQL | 15 | 案件数据存储 |
| 文件存储 | Supabase Storage | — | 处罚文书 + 生成 PDF |
| AI | Anthropic Claude API | claude-opus-4-6 | 文书分析 + 生成 |
| 邮件 | Resend | — | 发送申辩书 PDF |
| PDF 生成 | Puppeteer | latest | Markdown → PDF |
| 部署 | Vercel Pro | — | 300 秒超时 + 流式 |

---

## 3. AI 调用设计

### 两次顺序的 Claude API 调用

```
用户上传文书
    ↓
【Call 1：分析】
  输入：PDF/图片 + 广告法知识库 + 分析指导
  输出：结构化 JSON（违规类型、条款、金额、问卷）
  时长：约 20-40 秒
    ↓
用户回答问卷（5 分钟）
    ↓
【Call 2：生成】
  输入：分析结果 + 用户回答 + 文书格式规范 + 案例策略
  输出：申辩书 Markdown（流式）
  时长：约 30-60 秒
    ↓
PDF 转换 → 邮件发送
```

### Call 1：文书分析（`/api/analyze`）

```typescript
// 请求构建
const response = await anthropic.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 4096,
  system: buildSystemPrompt(skills),  // 注入知识库
  messages: [{
    role: 'user',
    content: [
      {
        type: 'document',             // Claude 原生 PDF 支持
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfBase64,
        },
      },
      {
        type: 'text',
        text: ANALYSIS_PROMPT,        // 分析任务指令
      },
    ],
  }],
});

// 要求 Claude 以 JSON 格式输出：
/*
{
  "case_number": "案号",
  "violation_type": "极限词|食品功效|虚假宣传|...",
  "cited_articles": ["§9③", "§55"],
  "penalty_amount": 200000,
  "defense_deadline_days": 15,
  "document_received_date": "2026-03-01",
  "defense_deadline_date": "2026-03-16",
  "hearing_eligible": true,
  "procedure_issues": ["未告知听证权利"],
  "defensibility": "中",
  "defensibility_reason": "存在首次违规情节...",
  "questions": [
    {
      "key": "ad_takedown",
      "text": "涉案广告是否已下架？",
      "type": "boolean",
      "why": "主动消除违法后果是法定从轻情节（《行政处罚法》第32条）"
    },
    ...
  ]
}
*/
```

### Call 2：申辩书生成（`/api/generate`，流式）

```typescript
// 流式调用，边生成边传输到前端
const stream = anthropic.messages.stream({
  model: 'claude-opus-4-6',
  max_tokens: 8192,
  system: buildSystemPrompt(skills),
  messages: [{
    role: 'user',
    content: buildGenerationPrompt(analysis, userAnswers),
  }],
});

// Next.js 流式响应
const readable = new ReadableStream({
  async start(controller) {
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        controller.enqueue(chunk.delta.text);
      }
    }
    controller.close();
  },
});

return new Response(readable, {
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});
```

### 知识库注入方式

Skills 文件在服务启动时从本地文件系统读取，作为 System Prompt 注入：

```typescript
// lib/skills.ts
import fs from 'fs';
import path from 'path';

export function loadSkills(): string {
  const skillsDir = path.join(process.cwd(), 'skills');
  const files = [
    'advertising-law.md',
    'administrative-law.md',
    'document-formats.md',
    'case-strategies.md',
  ];
  return files
    .map(f => fs.readFileSync(path.join(skillsDir, f), 'utf-8'))
    .join('\n\n---\n\n');
}
```

---

## 4. 数据库设计

### Schema

```sql
-- 4 张核心表，覆盖完整业务流程

CREATE SCHEMA guangjiantong;

-- 案件表（主表）
cases
├── id: UUID (PK)
├── email: TEXT                -- 用户邮箱（无需注册，唯一联系方式）
├── status: TEXT               -- uploaded|analyzing|awaiting-answers|
│                              -- generating|completed|failed
└── created_at: TIMESTAMPTZ

-- 上传文件表
files
├── id: UUID (PK)
├── case_id: UUID (FK → cases)
├── storage_path: TEXT         -- Supabase Storage 路径
├── mime_type: TEXT            -- application/pdf | image/jpeg | image/png
└── created_at: TIMESTAMPTZ

-- 分析结果表（Flow 1 输出）
analysis
├── id: UUID (PK)
├── case_id: UUID (FK → cases)
├── violation_type: TEXT       -- 违规类型标签
├── cited_articles: TEXT[]     -- 引用条款数组
├── penalty_amount: NUMERIC    -- 拟处罚金额
├── defense_deadline: DATE     -- 申辩截止日期
├── hearing_eligible: BOOLEAN  -- 是否可申请听证
├── defensibility: TEXT        -- '强'|'中'|'弱'
├── defensibility_reason: TEXT
├── questions: JSONB           -- 问卷题目
├── answers: JSONB             -- 用户回答（更新时写入）
└── created_at: TIMESTAMPTZ

-- 生成文书表（Flow 2 输出）
documents
├── id: UUID (PK)
├── case_id: UUID (FK → cases)
├── statement_md: TEXT         -- 申辩书 Markdown
├── statement_pdf_path: TEXT   -- PDF 在 Storage 的路径
├── evidence_checklist_md: TEXT
├── hearing_application_md: TEXT -- 听证申请书（如适用）
├── email_sent_at: TIMESTAMPTZ
└── created_at: TIMESTAMPTZ
```

### 无 RLS 策略（V1 简化）

V1 不做用户认证，通过 `case_id`（UUID，难以猜测）作为唯一访问凭证。后端使用 `service_role` key 直接操作。

---

## 5. 文件处理管道

### 上传处理

```
用户上传文件（PDF / JPG / PNG）
    ↓
前端：文件大小检查（≤ 20MB）+ 格式检查
    ↓
POST /api/cases → 创建 case 记录
    ↓
前端直传 Supabase Storage（使用临时上传 token）
路径：gjtong-uploads/{case_id}/document.{ext}
    ↓
POST /api/analyze → 触发 Flow 1
```

### PDF 处理方式

**Claude 原生 PDF 支持（首选）：**
```typescript
// 直接将 PDF 作为 document 类型发送给 Claude
// 无需任何图像转换，Claude 直接读取 PDF 文本和结构
{
  type: 'document',
  source: { type: 'base64', media_type: 'application/pdf', data: base64 }
}
```

**图片降级处理（用户拍照时）：**
```typescript
// 用户手机拍照 → 直接作为 image 类型发送
// Claude 视觉能力可识别手持拍照的文书（200万像素以上可接受）
{
  type: 'image',
  source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
}
```

**质量检测：**
- Claude 如果无法识别文书内容，会在输出中标注
- 前端检测到低置信度时，提示用户重新上传（更清晰的照片）

### PDF 生成（申辩书）

```typescript
// 使用 Puppeteer 生成专业法律文书 PDF
// 在 Vercel Serverless 环境使用 @sparticuz/chromium

import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

async function generatePDF(markdownContent: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  const page = await browser.newPage();
  await page.setContent(renderToHTML(markdownContent), {
    waitUntil: 'networkidle0',
  });

  const pdf = await page.pdf({
    format: 'A4',
    margin: { top: '2.5cm', bottom: '2.5cm', left: '3cm', right: '3cm' },
    printBackground: true,
  });

  await browser.close();
  return Buffer.from(pdf);
}

// HTML 模板（中文排版）
function renderToHTML(md: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap');
        body {
          font-family: 'Noto Serif SC', 'SimSun', serif;
          font-size: 12pt;
          line-height: 2;
          color: #000;
        }
        h1 { text-align: center; font-size: 16pt; letter-spacing: 2px; }
        h2 { font-size: 12pt; margin-top: 20px; }
      </style>
    </head>
    <body>${marked(md)}</body>
    </html>
  `;
}
```

---

## 6. API 设计

### 端点清单

```
POST /api/cases
  Body: { filename: string, mimeType: string }
  返回: { caseId: string, uploadUrl: string }
  说明: 创建案件 + 返回 Storage 直传 URL

POST /api/analyze
  Body: { caseId: string }
  返回: text/event-stream（流式 JSON 分析结果）
  说明: 触发 Flow 1，流式返回分析进度和最终结果

POST /api/generate
  Body: { caseId: string, answers: object, email: string }
  返回: text/event-stream（流式生成申辩书文本）
  说明: 触发 Flow 2，生成完成后自动发送邮件

GET /api/cases/[id]
  返回: { case, analysis, documents }
  说明: 获取案件完整信息（用于页面渲染）
```

### 流式响应格式（SSE）

```typescript
// 前端接收流式响应
const response = await fetch('/api/analyze', { method: 'POST', body: ... });
const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // 更新 UI 状态
  setStatus(parseStreamChunk(text));
}
```

```typescript
// 服务端发送流式事件
function sendEvent(controller: ReadableStreamController, data: object) {
  controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
}

// 事件类型
sendEvent(controller, { type: 'status', message: '正在识别文书内容...' });
sendEvent(controller, { type: 'status', message: '正在检索相关法律条款...' });
sendEvent(controller, { type: 'result', data: analysisResult });
```

---

## 7. 安全设计

### 访问控制

```
V1 无用户认证，通过以下方式保证安全：

1. Case ID 为 UUID v4（128 位随机，无法猜测）
2. 用户访问 /case/[id] 只需要知道 UUID
3. 服务端所有数据库操作使用 service_role key
4. Storage 文件为私有，只通过签名 URL 访问（有效期 1 小时）
```

### 数据隐私

```
用户数据处理：
- 仅收集：邮箱（用于发送文书）
- 处罚文书存储于 Supabase Storage（加密存储）
- 明确告知：数据不用于 AI 模型训练
- 数据保留：案件数据保留 90 天后自动删除
- API 调用：文书内容会发送至 Anthropic API（美国服务器）
  → 隐私政策中明确告知

注意：Anthropic API 的数据传输属于境外数据传输，
      需在隐私政策中向用户明示。
```

### API 成本保护

```typescript
// 每次 API 调用前检查成本预算
const DAILY_BUDGET_USD = 30;

// Vercel Edge Config 存储当日已用额度
// 超出预算返回 503，提示用户稍后重试
```

---

## 8. 部署架构

```
域名：guangjiantong.cn（ICP 备案）

Vercel Pro：
  - 区域：自动（全球 CDN，中国用户建议香港节点）
  - 超时：300 秒（Flow 2 生成需要）
  - 环境变量：
    ANTHROPIC_API_KEY
    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY
    SUPABASE_SERVICE_ROLE_KEY
    RESEND_API_KEY

Supabase：
  - 区域：ap-southeast-1（新加坡）或 ap-east-1（香港）
  - 方案：Free（初期够用）→ Pro（月活增长后升级）

部署流程：
  GitHub push → Vercel 自动构建 → 预览 URL → 确认后推生产
```

---

## 9. 知识库文件结构

```
skills/（项目根目录下，构建时打包进 Vercel）
│
├── advertising-law.md
│   内容：广告法第4/9/17/28/55/57条原文
│         违规类型识别规则（含极限词词典）
│         各类违规的典型案例描述
│
├── administrative-law.md
│   内容：行政处罚法第32/33条（从轻减轻情节，完整列举）
│         第44/45条（陈述申辩权利）
│         第63/64条（听证程序，含适用条件）
│         常见程序违法情形清单
│
├── document-formats.md
│   内容：陈述申辩意见书标准格式（含完整示例）
│         听证申请书格式
│         文书写作要求和注意事项
│
├── case-strategies.md
│   内容：极限词违规 → 第三方奖项区分策略（A-1案）
│         虚假宣传 → 被动信息滞后策略（A-2案）
│         通用 → 首违减罚论点模板
│         通用 → 主动整改论点模板
│         通用 → 配合调查论点模板
│
└── workflow-analysis.md
    内容：Flow 1 分析步骤指导
          问卷生成规则（按违规类型的追加问题）
          可申辩性评估标准
          JSON 输出格式规范
```

**知识库规模控制：**
- 总 token 数控制在 20,000 以内（作为 System Prompt 注入）
- 精选关键内容，不追求全面，追求精准
- 每季度检查法规变化，更新对应文件

---

*文档结束*

**相关文档：**
- [PRD_广监通AI.md](PRD_广监通AI.md) — 产品需求文档
- [MODULES_广监通AI.md](MODULES_广监通AI.md) — Vibe Coding 任务模组
