import { useState, useEffect, useCallback } from 'react'
import { apiFetch, streamChat } from '@/lib/api'
import AppLayout from '@/components/layout/AppLayout'
import ConversationList from '@/components/chat/ConversationList'
import MessageList from '@/components/chat/MessageList'
import ChatInput from '@/components/chat/ChatInput'
import type { Conversation, Message } from '@/types'

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [loadingConversations, setLoadingConversations] = useState(true)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await apiFetch('/conversations')
      const data = await res.json()
      setConversations(data)
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoadingConversations(false)
    }
  }, [])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await apiFetch(`/conversations/${conversationId}`)
      const data = await res.json()
      setMessages(data.messages || [])
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }, [])

  const handleSelectConversation = useCallback((id: string) => {
    setActiveId(id)
    setMessages([])
    setStreamingContent('')
    loadMessages(id)
  }, [loadMessages])

  const handleCreateConversation = useCallback(async () => {
    try {
      const res = await apiFetch('/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Conversation' }),
      })
      const conv = await res.json()
      setConversations((prev) => [conv, ...prev])
      setActiveId(conv.id)
      setMessages([])
      setStreamingContent('')
    } catch (err) {
      console.error('Failed to create conversation:', err)
    }
  }, [])

  const handleDeleteConversation = useCallback(async (id: string) => {
    if (!confirm('Delete this conversation?')) return
    try {
      await apiFetch(`/conversations/${id}`, { method: 'DELETE' })
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) {
        setActiveId(null)
        setMessages([])
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
  }, [activeId])

  const handleSendMessage = useCallback(async (content: string) => {
    if (!activeId || isStreaming) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: activeId,
      user_id: '',
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setIsStreaming(true)
    setStreamingContent('')

    let accumulated = ''

    await streamChat(
      activeId,
      content,
      (delta) => {
        accumulated += delta
        setStreamingContent(accumulated)
      },
      () => {
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          conversation_id: activeId,
          user_id: '',
          role: 'assistant',
          content: accumulated,
          created_at: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, assistantMessage])
        setStreamingContent('')
        setIsStreaming(false)
        fetchConversations()
      },
      (error) => {
        console.error('Stream error:', error)
        setStreamingContent('')
        setIsStreaming(false)
      },
    )
  }, [activeId, isStreaming, fetchConversations])

  return (
    <AppLayout
      sidebar={
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelectConversation}
          onCreate={handleCreateConversation}
          onDelete={handleDeleteConversation}
        />
      }
    >
      {activeId ? (
        <>
          <MessageList messages={messages} streamingContent={streamingContent} />
          <ChatInput onSend={handleSendMessage} disabled={isStreaming} />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center text-muted-foreground">
            {loadingConversations ? (
              <p>Loading conversations...</p>
            ) : (
              <>
                <p className="text-lg">Welcome to RAG Chat</p>
                <p className="mt-1 text-sm">Create a new conversation to get started</p>
              </>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
