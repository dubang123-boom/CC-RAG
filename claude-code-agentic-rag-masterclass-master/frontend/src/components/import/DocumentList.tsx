import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Document } from '@/types'

interface DocumentListProps {
  documents: Document[]
  onDelete: (id: string) => void
  onReextract: (id: string) => Promise<void>
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function StatusBadge({ status }: { status: Document['status'] }) {
  const styles: Record<Document['status'], string> = {
    pending: 'bg-muted text-muted-foreground',
    processing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    complete: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  }
  const labels: Record<Document['status'], string> = {
    pending: 'pending',
    processing: 'processing',
    complete: 'ready',
    error: 'error',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status === 'processing' && <Loader2 className="h-3 w-3 animate-spin" />}
      {labels[status]}
    </span>
  )
}

export default function DocumentList({ documents, onDelete, onReextract }: DocumentListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [reextracting, setReextracting] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleReextract = async (id: string) => {
    setReextracting((prev) => new Set(prev).add(id))
    try {
      await onReextract(id)
    } finally {
      setReextracting((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  if (documents.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No documents yet. Upload a file to get started.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const isExpanded = expandedIds.has(doc.id)
        const isReextracting = reextracting.has(doc.id)

        return (
          <div key={doc.id} className="overflow-hidden rounded-lg border bg-card">
            {/* Header row */}
            <div className="flex items-center gap-2 px-3 py-3">
              <button
                onClick={() => toggleExpand(doc.id)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                {isExpanded
                  ? <ChevronDown className="h-4 w-4" />
                  : <ChevronRight className="h-4 w-4" />}
              </button>
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{doc.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(doc.file_size)}
                  {doc.status === 'complete' && ` · ${doc.chunk_count} chunks`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {doc.metadata && (
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
                    metadata
                  </span>
                )}
                <StatusBadge status={doc.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  disabled={doc.status === 'processing'}
                  onClick={() => onDelete(doc.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Expanded body */}
            {isExpanded && (
              <div className="space-y-4 border-t px-4 py-3">
                {/* Info grid */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Size: </span>
                    <span>{formatSize(doc.file_size)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type: </span>
                    <span>{doc.file_type}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Chunks: </span>
                    <span>{doc.chunk_count}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status: </span>
                    <span>{doc.status === 'complete' ? 'ready' : doc.status}</span>
                  </div>
                  {doc.content_hash && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Hash: </span>
                      <span className="font-mono text-xs">{doc.content_hash.slice(0, 16)}</span>
                    </div>
                  )}
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Uploaded: </span>
                    <span>{formatDate(doc.created_at)}</span>
                  </div>
                </div>

                {/* Error message */}
                {doc.status === 'error' && doc.error_msg && (
                  <p className="text-xs text-red-500">{doc.error_msg}</p>
                )}

                {/* Metadata section */}
                {doc.status === 'complete' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Metadata</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground"
                        disabled={isReextracting}
                        onClick={() => handleReextract(doc.id)}
                      >
                        <RefreshCw className={`h-3 w-3 ${isReextracting ? 'animate-spin' : ''}`} />
                        Re-extract
                      </Button>
                    </div>

                    {doc.metadata ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex gap-2">
                          <span className="w-20 shrink-0 text-muted-foreground">Tags</span>
                          <div className="flex flex-wrap gap-1">
                            {doc.metadata.topics.map((topic) => (
                              <span
                                key={topic}
                                className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-20 shrink-0 text-muted-foreground">Title</span>
                          <span>{doc.metadata.title}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-20 shrink-0 text-muted-foreground">Summary</span>
                          <span className="text-foreground/80">
                            {doc.metadata.summary.length > 120
                              ? doc.metadata.summary.slice(0, 120) + '...'
                              : doc.metadata.summary}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-20 shrink-0 text-muted-foreground">Category</span>
                          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs">
                            {doc.metadata.document_type}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-20 shrink-0 text-muted-foreground">Language</span>
                          <span>{doc.metadata.language}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No metadata extracted yet. Click Re-extract to generate.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
