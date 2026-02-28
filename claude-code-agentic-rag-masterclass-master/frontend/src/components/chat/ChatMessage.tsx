import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentStep, Message } from '@/types'
import AgentWorkPanel from './AgentWorkPanel'

interface ChatMessageProps {
  message: Message
  agentSteps?: AgentStep[]
  isStreaming?: boolean
}

export default function ChatMessage({ message, agentSteps, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const timeStr = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className="group relative max-w-[80%]">
        {!isUser && agentSteps && agentSteps.length > 0 && (
          <AgentWorkPanel steps={agentSteps} isStreaming={isStreaming} />
        )}

        {message.content && (
          <div
            className={cn(
              'rounded-lg px-4 py-2',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Copy button for assistant messages */}
        {!isUser && message.content && (
          <button
            onClick={handleCopy}
            className="absolute -top-2 -right-2 hidden rounded-md border bg-background p-1 text-muted-foreground shadow-sm transition-colors hover:text-foreground group-hover:block"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}

        {/* Timestamp */}
        {message.content && (
          <p
            className={cn(
              'mt-1 text-[10px] text-muted-foreground',
              isUser ? 'text-right' : 'text-left'
            )}
          >
            {timeStr}
          </p>
        )}
      </div>
    </div>
  )
}
