import { useEffect, useRef } from 'react'
import ChatMessage from './ChatMessage'
import type { AgentStep, EnrichedMessage } from '@/types'

interface MessageListProps {
  messages: EnrichedMessage[]
  streamingContent: string
  streamingSteps?: AgentStep[]
}

export default function MessageList({ messages, streamingContent, streamingSteps }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streamingContent])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.length === 0 && !streamingContent && (
          <div className="flex h-full items-center justify-center pt-20">
            <p className="text-muted-foreground">Send a message to start the conversation</p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} agentSteps={msg.agentSteps} />
        ))}
        {(streamingContent || (streamingSteps && streamingSteps.length > 0)) && (
          <ChatMessage
            message={{
              id: 'streaming',
              conversation_id: '',
              user_id: '',
              role: 'assistant',
              content: streamingContent,
              created_at: new Date().toISOString(),
            }}
            agentSteps={streamingSteps}
            isStreaming={true}
          />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
