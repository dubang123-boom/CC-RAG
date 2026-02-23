import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import ChatMessage from './ChatMessage'
import type { Message } from '@/types'

interface MessageListProps {
  messages: Message[]
  streamingContent: string
}

export default function MessageList({ messages, streamingContent }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.length === 0 && !streamingContent && (
          <div className="flex h-full items-center justify-center pt-20">
            <p className="text-muted-foreground">Send a message to start the conversation</p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {streamingContent && (
          <ChatMessage
            message={{
              id: 'streaming',
              conversation_id: '',
              user_id: '',
              role: 'assistant',
              content: streamingContent,
              created_at: new Date().toISOString(),
            }}
          />
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
