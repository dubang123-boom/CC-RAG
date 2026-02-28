# 進度

追蹤你在大師課中的進度。完成模組後更新此文件 - Claude Code 會讀取此文件以了解你在項目中的位置。

## 慣例
- `[ ]` = 未開始
- `[-]` = 進行中
- `[x]` = 已完成

## 模組

### 模組 1：應用外殼 + 可觀測性
- [x] 任務 1：後端骨架（Python + FastAPI）
- [x] 任務 2：前端骨架（React + Vite + Tailwind + shadcn/ui）
- [x] 任務 3：Supabase 設定（表 + RLS）
- [x] 任務 4：認證流程
- [x] 任務 5：聊天 UI
- [x] 任務 6：後端聊天 API + OpenAI Responses API
- [x] 任務 7：LangSmith 可觀測性
- [x] 任務 8：端對端整合和收尾

### 模組 2：自建檢索 + 記憶
- [x] 架構遷移：Responses API → Chat Completions + Provider 抽象層（llm_service.py）
- [x] 資料庫 Schema：documents + chunks 表（migration 002）
- [x] Import UI + 文件處理管線（DropZone、DocumentList、Realtime 狀態）
- [x] RAG 對話 + Retrieval Tool

### 模組 3：記錄管理器
- [x] 內容哈希（SHA-256）+ 去重（migration 003）
- [x] 重複文件拒絕（HTTP 409）
- [x] 同名不同內容 → 自動替換舊文件
- [x] 上傳錯誤訊息顯示（ImportPage）

### 模組 4：LLM 元數據提取
- [x] metadata JSONB 欄位 + match_chunks_filtered 函數（migration 004）
- [x] DocumentMetadata Pydantic 模型（title, summary, language, topics, document_type）
- [x] 元數據提取服務（metadata_service.py）
- [x] 導入管線整合（import_service.py）
- [x] 過濾檢索（retrieval_service.py + llm_service.py + chat.py）
- [x] DocumentList UI 重設計（可折疊卡片 + 元數據展示 + Re-extract 按鈕）

### 模組 5：多格式支援
- [x] 擴展文件類型（PDF, JPG, PNG, GIF, WEBP, TIFF, BMP）
- [x] OCR 服務（pypdf 處理 PDF，OpenAI vision 處理圖片）
- [x] 每種類型的文件大小限制（文字 10MB，圖片 10MB，PDF 50MB）
- [x] 修復 IVFFlat 索引問題（migration 005 - 改用順序掃描保證完整召回）
- [x] 檢索結果含文檔來源標記（圖片標記為 OCR-extracted text）

### 模組 6：Agentic Query Decomposition + Self-Reflection
- [x] 查詢分解服務（decompose_service.py - Pydantic 結構化輸出，1-3 子查詢）
- [x] 自我反思服務（reflection_service.py - high/medium/low 置信度）
- [x] 重寫 chat.py 為線性 Agentic 管線（分解 → 多子查詢檢索去重 → 合成 → 反思）
- [x] SSE 新增 decompose、reflect 事件類型
- [x] 前端 ReflectionBadge 組件（綠/黃/紅置信度徽章）
- [x] ChatPage 顯示子查詢 chips + 置信度徽章（8秒後消失）

### 模組 7：對話記憶 (Conversation Memory)
- [x] 資料庫遷移：memories 表 + conversations.summary 欄位（migration 006）
- [x] Pydantic 模型（MemoryExtraction, ConversationSummary, MemoryResponse, MemoryUpdate, MemoryCreate）
- [x] 記憶服務（memory_service.py — 提取、去重存儲、格式化注入）
- [x] 摘要壓縮服務（summary_service.py — token 估算、歷史壓縮、LLM 摘要）
- [x] 記憶 CRUD API（memories router — GET/POST/PUT/DELETE）
- [x] 聊天管線集成（歷史壓縮 + 記憶注入 + 記憶提取）
- [x] 前端 Memory 頁面（MemoryCard、MemoryList、MemoryPage）
- [x] 導航集成（Chat / Import / Memory 三頁面互相導航）

### 模組 8：附加工具 — 網頁搜索回退 + 文本轉 SQL
- [x] 配置 + 依賴（Tavily API key、SQL 設定、tavily-python）
- [x] 查詢路由服務（router_service.py — LLM 分類問題到 retrieval/web_search/sql_query/general）
- [x] Tavily 網頁搜索服務（tavily_service.py — 搜索 + 格式化）
- [x] 文本轉 SQL 服務（sql_service.py — SQL 生成 + 安全驗證 + 執行 + 格式化）
- [x] SQL 安全函數遷移（migration 007 — execute_user_sql）
- [x] 聊天管線集成（chat.py 路由分支重構 + llm_service.py SYSTEM_PROMPT 微調）
- [x] 前端 SSE 更新（api.ts — onRoute 回調 + tool_result data 傳遞）
- [x] 前端 ToolResult 組件（web 搜索結果列表 + SQL 查詢展示）
- [x] ChatPage 路由 state + ToolResult 渲染

### 品質改進（模組 1–8 完成後）
- [x] Phase 1：後端穩定性 — 結構化 logging、LLM timeout、輸入驗證、decompose 空查詢守衛、健康檢查驗證 DB
- [x] Phase 2：前端 UX — 訊息時間戳、複製按鈕、刪除確認、深色模式顏色修復、Toast 通知、aria-label
- [x] Phase 3：UI 打磨 — 手機響應式側邊欄、深色模式切換（class-based dark mode）
