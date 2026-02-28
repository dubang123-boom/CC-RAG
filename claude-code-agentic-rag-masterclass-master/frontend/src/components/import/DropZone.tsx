import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'

interface DropZoneProps {
  onDrop: (files: File[]) => void
  uploading: boolean
  accept: string
}

export default function DropZone({ onDrop, uploading, accept }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    onDrop(Array.from(files))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      onClick={() => !uploading && inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors
        ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'}
        ${uploading ? 'cursor-not-allowed opacity-60' : ''}
      `}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      {uploading ? (
        <p className="text-sm text-muted-foreground">Uploading...</p>
      ) : (
        <>
          <p className="text-sm font-medium">Drag & drop files here, or click to select</p>
          <p className="text-xs text-muted-foreground">Supported: {accept}</p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={uploading}
      />
    </div>
  )
}
