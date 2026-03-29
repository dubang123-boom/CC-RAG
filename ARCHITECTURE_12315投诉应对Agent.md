# 12315 投诉应对 Agent — 系统架构设计

**版本：** v1.0
**日期：** 2026-03-26
**定位：** 广监通AI的前置模块，"老板别慌"系列第二个Agent

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
│  页面路由：                                              │
│  /                    → 统一入口（选择：处罚 or 投诉）     │
│  /complaint/[id]      → 投诉案件详情页                    │
│  /complaint/[id]/done → 完成页                           │
│                                                         │
│  API Routes：                                           │
│  POST /api/complaint/analyze   → Flow 1（投诉分析）      │
│  POST /api/complaint/generate  → Flow 2（回复生成）      │
│  POST /api/complaint/cases     → 创建投诉案件            │
│                                                         │
│  （原有处罚相关路由保持不变）                               │
└──────────────┬────────────────┬───────────────────────--┘
               │                │
               ▼                ▼
┌──────────────────┐   ┌────────────────────────────────┐
│  Anthropic       │   │  Supabase                      │
│  Claude API      │   │  ├── PostgreSQL（案件数据）      │
│                  │   │  └── Storage（上传文件）         │
│  claude-opus-4-6 │   └────────────────────────────────┘
│  原生 PDF 支持    │
└──────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  Resend（邮件发送）                                       │
│  回复函 + 整改清单 → 用户邮箱                              │
└─────────────────────────────────────────────────────────┘
```

### 与广监通的关系

```
广监通 AI（统一入口）
│
├── 🔴 行政处罚应对（已上线）
│   ├── /api/analyze        → 分析处罚通知书
│   ├── /api/generate       → 生成陈述申辩书
│   └── /case/[id]          → 处罚案件详情页
│
└── 🟡 12315投诉应对（本次新增）
    ├── /api/complaint/analyze   → 分析投诉内容
    ├── /api/complaint/generate  → 生成回复材料
    └── /complaint/[id]          → 投诉案件详情页

共享基础设施：
  ├── Supabase（同一个实例，同一个 schema）
  ├── Claude API（同一个 key）
  ├── Resend（同一个邮件服务）
  ├── lib/claude.ts（API 封装复用）
  ├── lib/skills.ts（知识库加载复用）
  ├── lib/pdf.ts（PDF 生成复用）
  ├── lib/email.ts（邮件发送复用）
  └── components/（UI 组件复用）
```

### 为什么做成广监通子模块而不是独立项目

| 维度 | 子模块 | 独立项目 |
|------|--------|---------|
| 开发量 | 新增 ~30% 代码 | 重复 ~70% 代码 |
| 部署 | 同一个 Vercel 项目 | 额外的 Vercel 项目 |
| 数据库 | 同一个 Supabase | 额外的 Supabase |
| 用户流转 | 投诉 → 处罚无缝衔接 | 需要跨产品跳转 |
| 品牌 | 短期受限，后期可拆 | 品牌独立 |

**结论：** MVP 阶段作为子模块，验证跑通后再考虑独立拆分。

---

## 2. 技术栈（100% 复用广监通）

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 前端框架 | Next.js | 16 | App Router，服务端渲染 |
| UI | React | 19 | 交互组件 |
| UI 组件库 | shadcn/ui | latest | 设计系统 |
| CSS | Tailwind CSS | 4 | 样式 |
| 数据库 | Supabase PostgreSQL | 15 | 投诉案件数据 |
| 文件存储 | Supabase Storage | — | 投诉截图 |
| AI | Anthropic Claude API | claude-opus-4-6 | 投诉分析 + 回复生成 |
| 邮件 | Resend | — | 发送回复函 |
| PDF 生成 | Puppeteer | latest | 回复函 → PDF |
| 部署 | Vercel Pro | — | 300 秒超时 + 流式 |

**无新增技术依赖。**

---

## 3. 业务流程详解

### 全流程

```
用户进入广监通首页
    ↓
选择："收到12315投诉/消费者投诉"
    ↓
上传投诉通知截图（支持多图）
    ↓
【Call 1：投诉分析】
  输入：投诉截图/文字 + 投诉应对知识库
  输出：结构化 JSON（投诉类型、风险评级、升级概率、问卷）
  时长：约 15-30 秒
    ↓
用户回答问卷（3 分钟）
    ↓
【Call 2：回复生成】
  输入：分析结果 + 用户回答 + 回复模板 + 协商策略
  输出：回复函 + 协商话术 + 整改清单（流式）
  时长：约 20-40 秒
    ↓
一键复制 / PDF 下载 / 邮件发送
```

### 与处罚流程的衔接

```
12315投诉
    ↓
投诉Agent分析 → 生成回复函 → 商家回复
    ↓
┌──────────────┐     ┌──────────────┐
│ 投诉解决 ✅   │     │ 投诉升级 ❌   │
│ 流程结束      │     │ 市监局立案    │
└──────────────┘     └──────┬───────┘
                            ↓
                  收到行政处罚告知书
                            ↓
                  广监通处罚应对流程
                  （已有功能无缝衔接）
```

---

## 4. AI 调用设计

### Call 1：投诉分析（`/api/complaint/analyze`）

```typescript
// 构建投诉分析系统提示
function buildComplaintAnalysisSystemPrompt(skills: string): string {
  return `你是专业的消费者投诉应对顾问，帮助商家分析和应对12315投诉。

你的任务：
1. 分析投诉内容，判断投诉类型和消费者诉求
2. 评估投诉的合理性和升级风险
3. 推荐应对策略（配合/反驳/协商）
4. 生成针对性问卷

# 知识库

${skills}

# 关键判断规则

## 升级风险评估
- 高风险：涉及广告法明确禁止的行为（极限词、虚假宣传）、食品安全问题
- 中风险：质量争议、售后不及时、价格争议
- 低风险：消费者误解、个人偏好不满

## 赔偿合理性判断
- 退一赔三（《消费者权益保护法》第55条）：需构成"欺诈"
- 退一赔十（《食品安全法》第148条）：不符合食品安全标准
- 普通退款：质量问题、描述不符

# 输出要求
- 必须以合法 JSON 格式输出
- 法律条款引用必须来自知识库
- 问卷最多 5 道题`;
}

// 请求构建
const response = await anthropic.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 4096,
  system: buildComplaintAnalysisSystemPrompt(skills),
  messages: [{
    role: 'user',
    content: [
      // 支持多图上传（投诉通知 + 商品详情 + 聊天记录）
      ...imageContents,
      {
        type: 'text',
        text: COMPLAINT_ANALYSIS_PROMPT,
      },
    ],
  }],
});
```

#### Call 1 输出 JSON 规范

```json
{
  "complaint_type": "虚假宣传|质量问题|价格欺诈|售后纠纷|食品安全|其他",
  "complaint_source": "12315|12345|黑猫投诉|电商平台|其他",
  "complaint_summary": "消费者投诉的核心诉求一句话概括",
  "response_deadline_days": 7,
  "response_deadline_date": "2026-04-02",

  "consumer_claims": [
    {
      "claim": "消费者的具体诉求",
      "validity": "valid|partially_valid|invalid",
      "reason": "判断依据",
      "legal_basis": "《消费者权益保护法》第XX条"
    }
  ],

  "escalation_risk": "high|medium|low",
  "escalation_risk_reason": "风险判断的具体理由",
  "escalation_consequence": "如升级为行政处罚，可能面临的处罚内容",

  "recommended_strategy": "cooperative|negotiate|defend",
  "strategy_explanation": "策略建议的详细说明",

  "estimated_cost": {
    "if_resolve_now": "现在解决的成本估算",
    "if_escalate": "升级后的成本估算"
  },

  "questionnaire": [
    {
      "key": "content_online",
      "text": "被投诉的内容是否仍在线上展示？",
      "type": "boolean",
      "why": "是否已主动整改直接影响升级风险",
      "required": true
    }
  ]
}
```

### Call 2：回复生成（`/api/complaint/generate`，流式）

```typescript
// 构建回复生成系统提示
function buildComplaintResponseSystemPrompt(skills: string): string {
  return `你是专业的消费者投诉回复文书起草助手。

你的任务是基于投诉分析结果和商家回答，起草三份材料：
1. 给市场监管局的正式回复函
2. 给消费者的协商话术
3. 风险预警与整改清单

# 知识库

${skills}

# 起草要求

## 回复函要求
- 格式规范，语气诚恳但不卑
- 事实陈述客观，不回避问题
- 整改措施具体、可执行
- 适当引用法律依据
- 控制在 800-1500 字

## 协商话术要求
- 语气亲和但专业
- 先表达歉意/理解
- 再陈述事实
- 最后提出解决方案
- 避免承认法律责任的措辞

## 整改清单要求
- 逐条列出需要做的事
- 标注优先级和时限
- 包含证据保留提醒

# 输出格式
用 --- 分隔三份材料：
第一部分：回复函
---
第二部分：协商话术
---
第三部分：风险预警与整改清单

直接输出内容，不要任何解释或前缀。`;
}

// 流式生成
export async function* generateComplaintResponse(
  analysis: ComplaintAnalysis,
  answers: Record<string, string>
): AsyncGenerator<string> {
  const skills = loadComplaintSkills();

  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    system: buildComplaintResponseSystemPrompt(skills),
    messages: [{
      role: 'user',
      content: buildComplaintResponseUserPrompt(analysis, answers),
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
```

#### Call 2 用户提示词模板

```typescript
function buildComplaintResponseUserPrompt(
  analysis: ComplaintAnalysis,
  answers: Record<string, string>
): string {
  return `
请根据以下投诉信息，生成应对材料。

【投诉分析结果】
投诉类型：${analysis.complaint_type}
投诉来源：${analysis.complaint_source}
投诉摘要：${analysis.complaint_summary}
回复截止：${analysis.response_deadline_date}
升级风险：${analysis.escalation_risk}（${analysis.escalation_risk_reason}）
建议策略：${analysis.recommended_strategy}（${analysis.strategy_explanation}）

【消费者诉求】
${analysis.consumer_claims
  .map(c => `- ${c.claim}（${c.validity === 'valid' ? '合理' : c.validity === 'partially_valid' ? '部分合理' : '不合理'}：${c.reason}）`)
  .join('\n')}

【成本对比】
现在解决：${analysis.estimated_cost.if_resolve_now}
升级后果：${analysis.estimated_cost.if_escalate}

【商家回答】
${Object.entries(answers)
  .map(([key, value]) => {
    const q = analysis.questionnaire?.find(q => q.key === key);
    return `${q?.text || key}：${value}`;
  })
  .join('\n')}

【输出要求】
1. 生成给市场监管局的回复函（800-1500字，正式公文格式）
2. --- 分隔后生成给消费者的协商话术（300-500字，亲和语气）
3. --- 分隔后生成风险预警与整改清单（含具体行动项）

注意：
- 所有法律条款引用必须准确
- 不得在回复函中承认违法事实（除非商家明确同意）
- 整改措施要具体可执行
- 协商话术要避免"我方违法"等措辞，用"给您带来不便"替代
`;
}
```

---

## 5. 知识库设计

### 知识库加载架构

```typescript
// lib/skills.ts 扩展

let cachedComplaintSkills: string | null = null;

export function loadComplaintSkills(): string {
  if (cachedComplaintSkills) return cachedComplaintSkills;

  const skillsDir = path.join(process.cwd(), 'skills');

  // 复用的文件
  const sharedFiles = [
    'advertising-law.md',        // 广告法（100%复用）
    'administrative-law.md',     // 行政处罚法（部分复用）
  ];

  // 新增的投诉专用文件
  const complaintFiles = [
    'complaint-handling.md',     // 投诉处理流程+法规
    'consumer-protection.md',    // 消费者权益保护法
    'complaint-templates.md',    // 回复函模板
    'complaint-strategies.md',   // 投诉应对策略
  ];

  const allFiles = [...sharedFiles, ...complaintFiles];

  cachedComplaintSkills = allFiles
    .filter(f => fs.existsSync(path.join(skillsDir, f)))
    .map(f => {
      const content = fs.readFileSync(path.join(skillsDir, f), 'utf-8');
      return `## ${f.replace('.md', '')}\n\n${content}`;
    })
    .join('\n\n---\n\n');

  return cachedComplaintSkills;
}
```

### 新增知识库文件清单

```
skills/（项目根目录下）
│
│  ── 已有（复用）──
├── advertising-law.md           # 广告法条款+违规识别（复用）
├── administrative-law.md        # 行政处罚法从轻减轻（复用）
├── document-formats.md          # 申辩书格式（处罚流程专用）
├── case-strategies.md           # 辩护策略（处罚流程专用）
├── workflow-analysis.md         # 分析指导（处罚流程专用）
│
│  ── 新增（投诉专用）──
├── complaint-handling.md
│   内容：
│   - 《市场监督管理投诉举报处理暂行办法》核心条款
│   - 12315投诉处理全流程（投诉→转办→回复→结案/升级）
│   - 各投诉渠道的处理时限（12315: 7个工作日；12345: 15个工作日）
│   - 投诉与举报的区别（投诉可调解，举报必须查处）
│   - 投诉升级为行政处罚的触发条件
│
├── consumer-protection.md
│   内容：
│   - 《消费者权益保护法》关键条款
│     - 第7-11条：消费者权利（知情权、选择权、公平交易权）
│     - 第24条：退货换货修理义务
│     - 第25条：七天无理由退货（网购）
│     - 第44条：网络交易平台责任
│     - 第55条：欺诈赔偿（退一赔三）
│   - 《食品安全法》第148条：食品安全赔偿（退一赔十）
│   - 《电子商务法》投诉相关条款
│   - 《产品质量法》质量责任相关条款
│   - 各类赔偿标准速查表
│
├── complaint-templates.md
│   内容：
│   - 回复函标准格式（致市场监管局）
│   - 回复函示例：虚假宣传投诉场景
│   - 回复函示例：质量问题投诉场景
│   - 回复函示例：售后纠纷投诉场景
│   - 消费者协商话术模板（致歉型/解释型/和解型）
│   - 整改清单模板
│
└── complaint-strategies.md
    内容：
    - 策略一：主动整改+积极协商策略（高风险投诉适用）
      适用条件：投诉内容确实违规（如广告极限词）
      核心思路：先改再谈，降低升级概率
      话术要点+证据准备清单

    - 策略二：事实澄清策略（投诉不合理时适用）
      适用条件：消费者误解或恶意投诉
      核心思路：用证据说话，但语气不对抗
      话术要点+证据准备清单

    - 策略三：成本对比引导策略（通用）
      核心思路：告诉商家"现在花几百和解 vs 以后罚几十万"
      计算模板：不同投诉类型的升级成本对比

    - 策略四：程序合规化策略（所有投诉通用）
      核心思路：确保回复过程本身合规，不给监管局口实
      回复时限、回复格式、证据保留的完整checklist
```

### 知识库 Token 预算

| 文件 | 预估 Token | 说明 |
|------|-----------|------|
| advertising-law.md（复用） | ~4,000 | 广告法条款+词典 |
| administrative-law.md（复用） | ~3,000 | 行政处罚法条款 |
| complaint-handling.md（新增） | ~3,000 | 投诉处理流程+法规 |
| consumer-protection.md（新增） | ~4,000 | 消保法+食品安全法+电商法 |
| complaint-templates.md（新增） | ~3,000 | 回复函模板+示例 |
| complaint-strategies.md（新增） | ~3,000 | 应对策略 |
| **总计** | **~20,000** | **在 System Prompt 注入上限内** |

---

## 6. 数据库设计

### 方案：扩展现有表结构

**不新建表**，在现有 `guangjiantong.cases` 和 `guangjiantong.analysis` 表中增加字段：

```sql
-- 扩展案件表：增加案件类型
ALTER TABLE guangjiantong.cases
  ADD COLUMN case_type TEXT DEFAULT 'penalty'
    CHECK (case_type IN ('penalty', 'complaint'));

-- 扩展分析结果表：增加投诉专用字段
ALTER TABLE guangjiantong.analysis
  ADD COLUMN complaint_type TEXT,               -- 投诉类型
  ADD COLUMN complaint_source TEXT,              -- 投诉来源
  ADD COLUMN complaint_summary TEXT,             -- 投诉摘要
  ADD COLUMN escalation_risk TEXT                -- 升级风险
    CHECK (escalation_risk IN ('high', 'medium', 'low')),
  ADD COLUMN escalation_risk_reason TEXT,        -- 风险理由
  ADD COLUMN recommended_strategy TEXT           -- 建议策略
    CHECK (recommended_strategy IN ('cooperative', 'negotiate', 'defend')),
  ADD COLUMN consumer_claims JSONB,              -- 消费者诉求列表
  ADD COLUMN estimated_cost JSONB;               -- 成本估算

-- 扩展文书表：增加投诉回复专用字段
ALTER TABLE guangjiantong.documents
  ADD COLUMN response_letter_md TEXT,            -- 给监管局的回复函
  ADD COLUMN negotiation_script_md TEXT,          -- 给消费者的协商话术
  ADD COLUMN risk_warning_md TEXT;                -- 风险预警+整改清单
```

### 字段用途映射

```
处罚流程（case_type = 'penalty'）       投诉流程（case_type = 'complaint'）
────────────────────────────────       ────────────────────────────────
analysis.violation_type                analysis.complaint_type
analysis.penalty_amount                analysis.estimated_cost
analysis.defensibility                 analysis.escalation_risk
analysis.defensibility_reason          analysis.escalation_risk_reason
analysis.hearing_eligible              analysis.recommended_strategy
                                       analysis.consumer_claims

documents.statement_md                 documents.response_letter_md
documents.evidence_checklist_md        documents.risk_warning_md
documents.hearing_application_md       documents.negotiation_script_md
```

---

## 7. 新增目录结构

```
guangjiantong/
├── app/
│   ├── page.tsx                    # 改造：统一入口（选择处罚/投诉）
│   │
│   ├── case/                       # 已有：处罚流程
│   │   └── [id]/page.tsx
│   │
│   ├── complaint/                  # 新增：投诉流程
│   │   └── [id]/
│   │       └── page.tsx            # 投诉案件详情页
│   │
│   └── api/
│       ├── cases/route.ts          # 改造：支持 case_type 参数
│       ├── analyze/route.ts        # 已有：处罚分析
│       ├── generate/route.ts       # 已有：申辩书生成
│       │
│       └── complaint/              # 新增：投诉 API
│           ├── analyze/route.ts    # 投诉分析（流式）
│           └── generate/route.ts   # 回复生成（流式）
│
├── components/
│   ├── FileUpload.tsx              # 复用
│   ├── Questionnaire.tsx           # 复用
│   ├── DeadlineCountdown.tsx       # 复用（改文案：回复截止）
│   ├── DefensibilityBadge.tsx      # 复用 → 改为 RiskBadge
│   │
│   ├── EscalationRiskBadge.tsx     # 新增：升级风险等级徽标
│   ├── CostComparison.tsx          # 新增：成本对比卡片
│   ├── CopyButton.tsx              # 新增：一键复制按钮
│   └── ComplaintTypeSelector.tsx   # 新增：投诉类型选择器
│
├── lib/
│   ├── supabase.ts                 # 复用
│   ├── claude.ts                   # 扩展：新增投诉分析/生成函数
│   ├── skills.ts                   # 扩展：新增 loadComplaintSkills()
│   ├── pdf.ts                      # 复用
│   └── email.ts                    # 扩展：新增投诉回复邮件模板
│
├── skills/
│   ├── advertising-law.md          # 复用
│   ├── administrative-law.md       # 复用
│   ├── document-formats.md         # 已有（处罚专用）
│   ├── case-strategies.md          # 已有（处罚专用）
│   ├── workflow-analysis.md        # 已有（处罚专用）
│   │
│   ├── complaint-handling.md       # 新增
│   ├── consumer-protection.md      # 新增
│   ├── complaint-templates.md      # 新增
│   └── complaint-strategies.md     # 新增
│
└── types/
    └── index.ts                    # 扩展：新增投诉相关类型
```

---

## 8. TypeScript 类型定义（新增）

```typescript
// types/index.ts 新增

// === 投诉相关类型 ===

export type CaseType = 'penalty' | 'complaint';

export type ComplaintType =
  | '虚假宣传'
  | '质量问题'
  | '价格欺诈'
  | '售后纠纷'
  | '食品安全'
  | '其他';

export type ComplaintSource =
  | '12315'
  | '12345'
  | '黑猫投诉'
  | '电商平台'
  | '其他';

export type EscalationRisk = 'high' | 'medium' | 'low';

export type RecommendedStrategy = 'cooperative' | 'negotiate' | 'defend';

export interface ConsumerClaim {
  claim: string;
  validity: 'valid' | 'partially_valid' | 'invalid';
  reason: string;
  legal_basis?: string;
}

export interface EstimatedCost {
  if_resolve_now: string;
  if_escalate: string;
}

export interface ComplaintAnalysis {
  id: string;
  case_id: string;
  complaint_type: ComplaintType;
  complaint_source: ComplaintSource;
  complaint_summary: string;
  response_deadline_date: string;
  consumer_claims: ConsumerClaim[];
  escalation_risk: EscalationRisk;
  escalation_risk_reason: string;
  recommended_strategy: RecommendedStrategy;
  strategy_explanation: string;
  estimated_cost: EstimatedCost;
  questionnaire: Question[];
  answers: Record<string, string> | null;
}

export interface ComplaintDocuments {
  id: string;
  case_id: string;
  response_letter_md: string | null;      // 回复函
  negotiation_script_md: string | null;    // 协商话术
  risk_warning_md: string | null;          // 风险预警+整改清单
  email_sent_at: string | null;
}

// === 扩展已有类型 ===

export interface Case {
  id: string;
  email: string | null;
  status: CaseStatus;
  case_type: CaseType;  // 新增
  created_at: string;
}
```

---

## 9. 页面设计

### 页面 1：统一入口（改造首页）

```
┌──────────────────────────────────────────────────┐
│                   广监通 AI                       │
│             老板别慌，AI帮你应对                    │
├──────────────────────────────────────────────────┤
│                                                  │
│  你遇到了什么问题？                               │
│                                                  │
│  ┌──────────────────────┐ ┌──────────────────────┐
│  │  📋 收到行政处罚      │ │  📱 收到消费者投诉    │
│  │  告知书/决定书        │ │  12315/12345/平台投诉 │
│  │                      │ │                      │
│  │  → 生成陈述申辩书     │ │  → 生成回复函+话术    │
│  └──────────────────────┘ └──────────────────────┘
│                                                  │
│  💡 不确定？先上传文件，AI帮你判断                  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 页面 2：投诉案件详情页 `/complaint/[id]`

```
┌──────────────────────────────────────────────────┐
│  ← 返回                              广监通 AI    │
├──────────────────────────────────────────────────┤
│  🟡 距回复截止还有 5 个工作日（4月2日）            │
├──────────────────────────────────────────────────┤
│  投诉分析                                         │
│  ──────────────────────────────────────────────  │
│  投诉类型：虚假宣传（广告极限词）                   │
│  投诉来源：12315转办                               │
│  消费者诉求：退一赔三                               │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ ⚠️ 升级风险：高                               │ │
│  │ 极限词属于广告法明确禁止的行为，                │ │
│  │ 如不妥善处理极易被立案调查。                    │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ 💰 成本对比                                   │ │
│  │ 现在解决：退款+补偿（几百~几千元）             │ │
│  │ 如果升级：行政处罚罚款 20万-100万              │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
├──────────────────────────────────────────────────┤
│  请回答以下问题                                    │
│  ─────────────────────────────────────────────   │
│  1/5 被投诉的内容是否还在线上？                    │
│      （直接影响升级风险评估）                       │
│      ● 是，还在  ○ 已下架  ○ 正在处理              │
│                                                  │
│  2/5 你是否愿意与消费者协商赔偿？                  │
│      ○ 愿意协商  ○ 只退款  ○ 不愿意                │
│                                                  │
│  3/5 ...                                         │
│                                                  │
│  邮箱：___________________________                │
│                                                  │
│  [生成回复材料]                                    │
└──────────────────────────────────────────────────┘
```

### 页面 3：结果页（Tab 切换）

```
┌──────────────────────────────────────────────────┐
│  ← 返回                              广监通 AI    │
├──────────────────────────────────────────────────┤
│                                                  │
│  [回复函]  [协商话术]  [整改清单]    ← Tab 切换    │
│  ─────────────────────────────────────────────   │
│                                                  │
│  关于XXX投诉事项的回复                             │
│                                                  │
│  XX市场监督管理局：                                │
│                                                  │
│  贵局转办的投诉（编号：XXXX）已收悉。              │
│  我单位高度重视，现就有关情况回复如下：             │
│  ...                                             │
│                                                  │
│  ┌───────────────────────────────────────┐       │
│  │  📋 复制全文   📄 下载PDF   ✉️ 发邮件  │       │
│  └───────────────────────────────────────┘       │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 10. 新增组件设计

### `EscalationRiskBadge.tsx`

```typescript
interface Props {
  risk: EscalationRisk;
  reason: string;
}

export function EscalationRiskBadge({ risk, reason }: Props) {
  const config = {
    high: {
      color: 'bg-red-100 text-red-800 border-red-200',
      icon: '🔴',
      label: '高风险',
      description: '极易升级为行政处罚',
    },
    medium: {
      color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      icon: '🟡',
      label: '中风险',
      description: '妥善处理可避免升级',
    },
    low: {
      color: 'bg-green-100 text-green-800 border-green-200',
      icon: '🟢',
      label: '低风险',
      description: '正常回复即可',
    },
  };

  const { color, icon, label, description } = config[risk];

  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <div className="font-bold text-lg">
        {icon} 升级风险：{label}
      </div>
      <p className="mt-1 text-sm">{reason}</p>
      <p className="mt-1 text-xs opacity-70">{description}</p>
    </div>
  );
}
```

### `CostComparison.tsx`

```typescript
interface Props {
  cost: EstimatedCost;
}

export function CostComparison({ cost }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
      <div className="text-center">
        <div className="text-sm text-gray-500">现在解决</div>
        <div className="text-lg font-bold text-green-600">
          {cost.if_resolve_now}
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm text-gray-500">如果升级</div>
        <div className="text-lg font-bold text-red-600">
          {cost.if_escalate}
        </div>
      </div>
    </div>
  );
}
```

### `CopyButton.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button onClick={handleCopy} variant={copied ? 'default' : 'outline'}>
      {copied ? '✓ 已复制' : '📋 复制全文'}
    </Button>
  );
}
```

---

## 11. 邮件模板（投诉专用）

```typescript
// lib/email.ts 新增

export async function sendComplaintResponseEmail({
  email,
  analysis,
  responseLetter,
  negotiationScript,
  riskWarning,
}: {
  email: string;
  analysis: ComplaintAnalysis;
  responseLetter: string;
  negotiationScript: string;
  riskWarning: string;
}) {
  const deadline = analysis.response_deadline_date
    ? format(new Date(analysis.response_deadline_date), 'yyyy年MM月dd日')
    : '请尽快回复';

  // 生成回复函 PDF
  const pdfBuffer = await generatePDF(responseLetter);

  await resend.emails.send({
    from: 'guangjiantong <noreply@guangjiantong.cn>',
    to: email,
    subject: `您的投诉回复材料已生成 | 回复截止：${deadline}`,
    html: `
      <h2>您的投诉回复材料已生成</h2>

      <p>⚠️ <strong>回复截止日期：${deadline}</strong></p>

      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; margin: 16px 0;">
        <tr>
          <td style="background:#f0fdf4; text-align:center;">
            <strong>现在解决</strong><br/>
            <span style="color:green; font-size:18px;">${analysis.estimated_cost.if_resolve_now}</span>
          </td>
          <td style="background:#fef2f2; text-align:center;">
            <strong>升级后果</strong><br/>
            <span style="color:red; font-size:18px;">${analysis.estimated_cost.if_escalate}</span>
          </td>
        </tr>
      </table>

      <p><strong>附件：</strong></p>
      <ul>
        <li>✓ 投诉回复函.pdf（可直接打印、盖章、提交给市监局）</li>
      </ul>

      <p><strong>邮件中还包含：</strong></p>
      <ul>
        <li>✓ 消费者协商话术（见下方）</li>
        <li>✓ 风险预警与整改清单（见下方）</li>
      </ul>

      <hr/>
      <h3>消费者协商话术</h3>
      <div style="background:#f9f9f9; padding:16px; border-radius:8px; white-space:pre-wrap;">
${negotiationScript}
      </div>

      <hr/>
      <h3>风险预警与整改清单</h3>
      <div style="background:#fff8f0; padding:16px; border-radius:8px; white-space:pre-wrap;">
${riskWarning}
      </div>

      <hr/>
      <p style="color:#666; font-size:12px;">
        免责声明：本材料由 AI 辅助生成，仅供参考，不构成法律意见。
        建议在提交前由专业人士审核。
      </p>
    `,
    attachments: [
      {
        filename: '投诉回复函.pdf',
        content: pdfBuffer,
      },
    ],
  });
}
```

---

## 12. 流式响应格式（SSE）

### 投诉分析事件

```typescript
// 事件序列
{ type: 'status', message: '正在识别投诉内容...' }
{ type: 'status', message: '正在评估升级风险...' }
{ type: 'status', message: '正在匹配法律依据...' }
{ type: 'result', analysis: { /* ComplaintAnalysis JSON */ } }
```

### 回复生成事件

```typescript
// 事件序列
{ type: 'status', message: '正在起草回复函...' }
{ type: 'chunk', text: '关于...' }        // 流式文本
{ type: 'chunk', text: 'XXX投诉...' }
{ type: 'section', name: 'response_letter' }  // 切换到回复函
{ type: 'section', name: 'negotiation' }      // 切换到协商话术
{ type: 'section', name: 'risk_warning' }     // 切换到整改清单
{ type: 'status', message: '正在生成 PDF...' }
{ type: 'status', message: '正在发送邮件...' }
{ type: 'done', message: '材料已发送到您的邮箱' }
```

---

## 13. 安全设计（沿用广监通）

| 维度 | 处理方式 |
|------|---------|
| 访问控制 | Case ID（UUID v4）作为唯一凭证，无需注册 |
| 数据隐私 | 仅收集邮箱；投诉文件加密存储 |
| 免责声明 | 所有页面+邮件中明确标注"AI生成，仅供参考" |
| API 成本 | 共用广监通的 $30/天预算上限 |
| 数据保留 | 90天后自动清除 |

---

## 14. 开发任务模组

| 模组 | 名称 | 预计工期 | 依赖 |
|------|------|---------|------|
| C0 | 数据库扩展 | 0.5 天 | 无 |
| C1 | 知识库构建 | 2-3 天 | 无 |
| C2 | 投诉分析 API | 1-2 天 | C0, C1 |
| C3 | 回复生成 API | 1-2 天 | C2 |
| C4 | 前端页面 | 2-3 天 | C2, C3 |
| C5 | 首页改造 | 0.5 天 | C4 |
| C6 | 测试与上线 | 1 天 | 全部 |

**总计：约 8-12 天**

### C0：数据库扩展

```sql
-- 执行 ALTER TABLE 语句（见第6节）
-- 验证：能插入 case_type='complaint' 的记录
```

### C1：知识库构建

- [ ] complaint-handling.md（投诉处理流程+法规）
- [ ] consumer-protection.md（消保法+食品安全法+电商法）
- [ ] complaint-templates.md（回复函模板+协商话术模板）
- [ ] complaint-strategies.md（应对策略库）
- [ ] 验证：Token 总量 ≤ 20,000

### C2：投诉分析 API

- [ ] `/api/complaint/analyze` 路由
- [ ] `buildComplaintAnalysisSystemPrompt()` 系统提示
- [ ] JSON 输出解析 + 错误处理
- [ ] 验证：用测试投诉截图调用，返回合法 JSON

### C3：回复生成 API

- [ ] `/api/complaint/generate` 路由
- [ ] `buildComplaintResponseSystemPrompt()` 系统提示
- [ ] 三段材料解析（回复函/话术/清单）
- [ ] PDF 生成 + 邮件发送
- [ ] 验证：完整 Flow 1 → 问卷 → Flow 2 → 邮件到达

### C4：前端页面

- [ ] `/complaint/[id]/page.tsx` 投诉详情页
- [ ] EscalationRiskBadge 组件
- [ ] CostComparison 组件
- [ ] CopyButton 组件（一键复制）
- [ ] Tab 切换展示三份材料
- [ ] 验证：手机端（375px）完整可用

### C5：首页改造

- [ ] 统一入口（选择处罚/投诉）
- [ ] 路由分流逻辑

### C6：测试

| 测试场景 | 输入 | 预期 |
|---------|------|------|
| 虚假宣传投诉 | 含极限词的投诉通知 | 升级风险高，建议配合整改 |
| 质量问题投诉 | 商品瑕疵投诉 | 升级风险中，建议协商退换 |
| 恶意投诉 | 明显不合理的投诉 | 升级风险低，建议事实澄清 |
| 模糊截图 | 低质量手机拍照 | 提示重新上传 |

---

## 15. MVP 范围定义

### 第一版做

- [x] 统一入口（选择处罚/投诉）
- [ ] 虚假宣传投诉场景（单一场景）
- [ ] 投诉分析 + 风险评估 + 成本对比
- [ ] 回复函 + 协商话术 + 整改清单
- [ ] 一键复制 + PDF 下载 + 邮件发送

### 第一版不做

- 质量/价格/食品安全等其他投诉类型
- 电商平台投诉（淘宝/京东/拼多多）
- 黑猫投诉等第三方平台
- 投诉进度追踪
- 付费功能

### 后续迭代路线

```
v1.0  虚假宣传投诉
v1.1  + 质量问题投诉 + 售后纠纷
v1.2  + 食品安全投诉 + 价格投诉
v2.0  品牌升级为"老板别慌"，处罚+投诉拆分为独立入口
v2.1  + 劳动仲裁应对（第三个Agent）
v2.2  + 税务稽查应对（第四个Agent）
```

---

*文档结束*

**相关文档：**
- [PRD_广监通AI.md](PRD_广监通AI.md) — 广监通产品需求文档
- [ARCHITECTURE_广监通AI.md](ARCHITECTURE_广监通AI.md) — 广监通系统架构设计
- [MODULES_广监通AI.md](MODULES_广监通AI.md) — 广监通任务模组指引
