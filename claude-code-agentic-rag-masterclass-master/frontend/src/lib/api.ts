import { supabase } from './supabase'

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

export async function streamChat(
  conversationId: string,
  content: string,
  onDelta: (text: string) => void,
  onDone: (responseId: string) => void,
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
          } else if (data.type === 'done') {
            onDone(data.response_id)
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
