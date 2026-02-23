export interface User {
  id: string
  email: string
}

export interface Conversation {
  id: string
  user_id: string
  title: string
  openai_response_id: string | null
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
