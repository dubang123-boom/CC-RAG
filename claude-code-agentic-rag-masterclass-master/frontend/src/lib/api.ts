import { supabase } from './supabase'
import type { LLMSettings } from '@/types'

export async function uploadFile(path: string, formData: FormData): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {}
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  // Do NOT set Content-Type — browser sets multipart boundary automatically
  const res = await fetch(`/api${path}`, { method: 'POST', headers, body: formData })
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('上传过于频繁，请稍后再试（每分钟最多5次）')
    }
    const error = await res.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(error.detail || 'Upload failed')
  }
  return res
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...await getAuthHeaders(),
    ...options.headers,
  }
  const res = await fetch(`/api${path}`, { ...options, headers })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail || 'Request failed')
  }
  return res
}

export async function getLLMSettings(): Promise<LLMSettings> {
  const res = await apiFetch('/settings/llm')
  return res.json()
}

export async function saveLLMSettings(data: LLMSettings): Promise<void> {
  await apiFetch('/settings/llm', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function streamChat(
  conversationId: string,
  content: string,
  onDelta: (text: string) => void,
  onToolCall: (tool: string, query: string) => void,
  onToolResult: (preview: string, data?: any) => void,
  onDecompose: (subQueries: string[], reasoning: string) => void,
  onReflect: (confidence: 'high' | 'medium' | 'low', note: string) => void,
  onRoute: (route: string, reasoning: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
) {
  const headers = {
    'Content-Type': 'application/json',
    ...await getAuthHeaders(),
  }

  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
  })

  if (!res.ok) {
    if (res.status === 429) {
      onError('发送消息过于频繁，请稍后再试（每分钟最多10条）')
      return
    }
    const error = await res.json().catch(() => ({ detail: 'Request failed' }))
    onError(error.detail || 'Request failed')
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    onError('No response body')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'delta') {
            onDelta(data.content)
          } else if (data.type === 'tool_call') {
            onToolCall(data.tool, data.query)
          } else if (data.type === 'tool_result') {
            onToolResult(data.content, data.data)
          } else if (data.type === 'decompose') {
            onDecompose(data.sub_queries, data.reasoning)
          } else if (data.type === 'reflect') {
            onReflect(data.confidence, data.note)
          } else if (data.type === 'route') {
            onRoute(data.route, data.reasoning)
          } else if (data.type === 'done') {
            onDone()
          } else if (data.type === 'error') {
            onError(data.content)
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  }
}
