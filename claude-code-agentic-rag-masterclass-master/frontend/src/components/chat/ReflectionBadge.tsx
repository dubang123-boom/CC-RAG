const STYLES: Record<string, string> = {
  high:   'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
  low:    'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
}

const LABELS: Record<string, string> = {
  high:   '✓ High confidence',
  medium: '~ Medium confidence',
  low:    '⚠ Low confidence',
}

export default function ReflectionBadge({
  confidence,
  note,
}: {
  confidence: 'high' | 'medium' | 'low'
  note: string
}) {
  return (
    <div className={`flex items-start gap-2 rounded-md border px-2 py-1 text-xs ${STYLES[confidence]}`}>
      <span className="font-medium shrink-0">{LABELS[confidence]}</span>
      <span className="opacity-80">{note}</span>
    </div>
  )
}
