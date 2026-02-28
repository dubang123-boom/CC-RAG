import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { apiFetch, uploadFile } from '@/lib/api'
import AppLayout from '@/components/layout/AppLayout'
import DropZone from '@/components/import/DropZone'
import DocumentList from '@/components/import/DocumentList'
import type { Document } from '@/types'

interface ImportPageProps {
  onNavigateToChat: () => void
}

export default function ImportPage({ onNavigateToChat }: ImportPageProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await apiFetch('/documents')
      const data = await res.json()
      setDocuments(data)
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    }
  }, [])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Subscribe to Realtime updates for document status changes
  useEffect(() => {
    const channel = supabase
      .channel('documents-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'documents' },
        (payload) => {
          setDocuments((prev) =>
            prev.map((doc) =>
              doc.id === payload.new.id ? { ...doc, ...(payload.new as Document) } : doc
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleDrop = async (files: File[]) => {
    setUploading(true)
    setUploadError(null)
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await uploadFile('/documents', formData)
        const doc: Document = await res.json()
        setDocuments((prev) => [doc, ...prev])
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      }
    }
    setUploading(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document and all its chunks?')) return
    try {
      await apiFetch(`/documents/${id}`, { method: 'DELETE' })
      setDocuments((prev) => prev.filter((d) => d.id !== id))
      toast.success('Document deleted')
    } catch (err) {
      toast.error('Failed to delete document')
    }
  }

  const handleReextract = async (id: string) => {
    try {
      const res = await apiFetch(`/documents/${id}/metadata`, { method: 'POST' })
      const updated = await res.json()
      setDocuments((prev) => prev.map((d) => d.id === id ? updated : d))
    } catch (err) {
      console.error('Re-extract failed:', err)
    }
  }

  return (
    <AppLayout activeView="import" onNavigateToChat={onNavigateToChat}>
      <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Import Documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload documents to build your knowledge base. Supports text, PDF, and images.
          </p>
        </div>
        <DropZone onDrop={handleDrop} uploading={uploading} accept=".txt,.md,.pdf,.jpg,.jpeg,.png,.gif,.webp,.tiff,.bmp" />
        {uploadError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {uploadError}
          </div>
        )}
        <DocumentList documents={documents} onDelete={handleDelete} onReextract={handleReextract} />
      </div>
      </div>
    </AppLayout>
  )
}
