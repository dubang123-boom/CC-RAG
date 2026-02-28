import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/types'

interface ConversationListProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button onClick={onCreate} variant="outline" className="w-full justify-start gap-2">
          <Plus className="h-4 w-4" />
          New Conversation
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 px-3">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onMouseEnter={() => setHoveredId(conv.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors',
                activeId === conv.id
                  ? 'bg-blue-500/10 text-blue-600 font-medium border-l-2 border-blue-500 dark:text-blue-400 dark:border-blue-400'
                  : hoveredId === conv.id
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-card shadow-sm'
              )}
              onClick={() => onSelect(conv.id)}
            >
              <MessageSquare className={cn(
                'h-4 w-4 shrink-0',
                activeId === conv.id ? 'text-blue-500' : 'text-muted-foreground'
              )} />
              <span className="flex-1 truncate">{conv.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(conv.id)
                }}
                style={{
                  opacity: hoveredId === conv.id ? 1 : 0,
                  pointerEvents: hoveredId === conv.id ? 'auto' : 'none',
                }}
                className="shrink-0 text-muted-foreground hover:text-destructive transition-opacity p-0.5 rounded"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
