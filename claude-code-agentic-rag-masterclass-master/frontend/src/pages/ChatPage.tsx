import { useState, useEffect, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { apiFetch, streamChat } from '@/lib/api'
import AppLayout from '@/components/layout/AppLayout'
import ConversationList from '@/components/chat/ConversationList'
import MessageList from '@/components/chat/MessageList'
import ChatInput from '@/components/chat/ChatInput'
import type { AgentStep, Conversation, EnrichedMessage } from '@/types'

interface ChatPageProps {
  onNavigateToImport: () => void
}

export default function ChatPage({ onNavigateToImport }: ChatPageProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<EnrichedMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [currentSteps, setCurrentSteps] = useState<AgentStep[]>([])
  // Use a ref so the onDone closure always reads the latest steps
  const currentStepsRef = useRef<AgentStep[]>([])

  const fetchConversations = useCallback(async () => {
    try {
      const res = await apiFetch('/conversations')
      const data = await res.json()
      setConversations(data)
    } catch (err) {
      toast.error('Failed to fetch conversations')
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
      toast.success('Conversation deleted')
    } catch (err) {
      toast.error('Failed to delete conversation')
    }
  }, [activeId])

  const handleSendMessage = useCallback(async (content: string) => {
    if (!activeId || isStreaming) return

    const userMessage: EnrichedMessage = {
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
    setCurrentSteps([])
    currentStepsRef.current = []

    const addStep = (step: AgentStep) => {
      currentStepsRef.current = [...currentStepsRef.current, step]
      flushSync(() => {
        setCurrentSteps([...currentStepsRef.current])
      })
    }

    let accumulated = ''

    await streamChat(
      activeId,
      content,
      (delta) => {
        accumulated += delta
        setStreamingContent(accumulated)
      },
      (tool, query) => {
        addStep({ type: 'tool_call', tool, query })
      },
      (preview, data) => {
        addStep({ type: 'tool_result', content: preview, data })
      },
      (subQueries, reasoning) => {
        addStep({ type: 'decompose', sub_queries: subQueries, reasoning })
      },
      (confidence, note) => {
        addStep({ type: 'reflect', confidence, note })
      },
      (route, reasoning) => {
        addStep({ type: 'route', route, reasoning })
      },
      () => {
        const steps = currentStepsRef.current
        const assistantMessage: EnrichedMessage = {
          id: crypto.randomUUID(),
          conversation_id: activeId,
          user_id: '',
          role: 'assistant',
          content: accumulated,
          created_at: new Date().toISOString(),
          agentSteps: steps.length > 0 ? steps : undefined,
        }
        setMessages((prev) => [...prev, assistantMessage])
        setStreamingContent('')
        setIsStreaming(false)
        setCurrentSteps([])
        currentStepsRef.current = []
        fetchConversations()
      },
      (error) => {
        toast.error('Chat error: ' + error)
        setStreamingContent('')
        setIsStreaming(false)
        setCurrentSteps([])
        currentStepsRef.current = []
      },
    )
  }, [activeId, isStreaming, fetchConversations])

  return (
    <AppLayout
      activeView="chat"
      onNavigateToImport={onNavigateToImport}
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
          <MessageList
            messages={messages}
            streamingContent={streamingContent}
            streamingSteps={isStreaming ? currentSteps : undefined}
          />

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
