export interface User {
  id: string
  email: string
}

export interface Conversation {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export type AgentStep =
  | { type: 'route'; route: string; reasoning: string }
  | { type: 'decompose'; sub_queries: string[]; reasoning: string }
  | { type: 'tool_call'; tool: string; query: string }
  | { type: 'tool_result'; content: string; data?: any }
  | { type: 'reflect'; confidence: 'high' | 'medium' | 'low'; note: string }

export interface EnrichedMessage extends Message {
  agentSteps?: AgentStep[]
}

export interface LLMSettings {
  llm_api_key: string
  llm_base_url: string
  llm_model: string
  llm_title_model: string
  llm_system_prompt: string
}

export interface DocumentMetadata {
  title: string
  summary: string
  language: string
  topics: string[]
  document_type: 'article' | 'manual' | 'report' | 'other'
}

export interface Document {
  id: string
  user_id: string
  filename: string
  file_type: string
  file_size: number
  status: 'pending' | 'processing' | 'complete' | 'error'
  error_msg: string | null
  chunk_count: number
  content_hash: string | null
  metadata: DocumentMetadata | null
  created_at: string
  updated_at: string
}
