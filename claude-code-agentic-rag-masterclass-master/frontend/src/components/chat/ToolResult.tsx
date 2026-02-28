import { ExternalLink, Database } from 'lucide-react'

interface WebResult {
  title: string
  url: string
  snippet: string
}

interface ToolResultData {
  tool: string
  results?: WebResult[]
  sql?: string
  reasoning?: string
  success?: boolean
  count?: number
}

export default function ToolResult({ data }: { data: ToolResultData }) {
  if (data.tool === 'search_web' && data.results) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ExternalLink className="h-3 w-3" />
          Web search results
        </div>
        {data.results.map((r, i) => (
          <a
            key={i}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-md border bg-background px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors"
          >
            <div className="font-medium text-foreground truncate">{r.title}</div>
            <div className="text-muted-foreground mt-0.5 line-clamp-2">{r.snippet}</div>
            <div className="text-blue-500 mt-0.5 truncate">{r.url}</div>
          </a>
        ))}
      </div>
    )
  }

  if (data.tool === 'query_documents_metadata') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Database className="h-3 w-3" />
          Document metadata query
        </div>
        {data.reasoning && (
          <div className="text-xs text-muted-foreground">{data.reasoning}</div>
        )}
        {data.sql && (
          <pre className="rounded-md bg-muted px-2 py-1 text-xs font-mono overflow-x-auto">
            {data.sql}
          </pre>
        )}
        <div className="text-xs text-muted-foreground">
          {data.success
            ? `${data.count} row(s) returned`
            : 'Query failed'}
        </div>
      </div>
    )
  }

  return null
}
