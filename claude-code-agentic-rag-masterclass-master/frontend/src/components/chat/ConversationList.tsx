import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button onClick={onCreate} variant="outline" className="w-full justify-start gap-2">
          <Plus className="h-4 w-4" />
          New Conversation
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 px-3">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-accent',
                activeId === conv.id && 'bg-accent'
              )}
              onClick={() => onSelect(conv.id)}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{conv.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(conv.id)
                }}
                className="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
