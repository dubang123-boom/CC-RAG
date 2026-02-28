import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import type { AgentStep } from '@/types'

const CONFIDENCE_STYLES: Record<string, string> = {
  high:   'text-green-600 dark:text-green-400',
  medium: 'text-yellow-600 dark:text-yellow-400',
  low:    'text-red-600 dark:text-red-400',
}

const CONFIDENCE_LABELS: Record<string, string> = {
  high:   '✓ High confidence',
  medium: '~ Medium confidence',
  low:    '⚠ Low confidence',
}

interface AgentWorkPanelProps {
  steps: AgentStep[]
  isStreaming?: boolean
}

export default function AgentWorkPanel({ steps, isStreaming }: AgentWorkPanelProps) {
  const [expanded, setExpanded] = useState(true)

  // Determine summary route for collapsed header
  const routeStep = steps.find((s) => s.type === 'route') as
    | { type: 'route'; route: string; reasoning: string }
    | undefined
  const routeLabel = routeStep?.route ?? ''

  const headerSummary = [routeLabel, `${steps.length} step${steps.length !== 1 ? 's' : ''}`]
    .filter(Boolean)
    .join('  ·  ')

  return (
    <div className="mb-3 rounded-md border border-border/60 bg-muted/30 text-xs">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="font-medium">Thinking</span>
        {isStreaming && <Loader2 className="h-3 w-3 animate-spin" />}
        {!expanded && routeLabel && (
          <span className="ml-1 text-muted-foreground/70">·  {headerSummary}</span>
        )}
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-border/40 px-3 py-2 space-y-2">
          {renderSteps(steps)}
        </div>
      )}
    </div>
  )
}

function renderSteps(steps: AgentStep[]) {
  const elements: React.ReactNode[] = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const delay = `${elements.length * 120}ms`

    if (step.type === 'route') {
      elements.push(
        <div key={i} className="step-animate flex flex-col gap-0.5" style={{ animationDelay: delay }}>
          <span className="font-medium text-foreground/80">
            🔀 Routed to: <span className="font-semibold">{step.route}</span>
          </span>
          {step.reasoning && (
            <span className="pl-5 text-muted-foreground">{step.reasoning}</span>
          )}
        </div>
      )
    } else if (step.type === 'decompose') {
      elements.push(
        <div key={i} className="step-animate flex flex-col gap-0.5" style={{ animationDelay: delay }}>
          <span className="font-medium text-foreground/80">
            📋 Decomposed into {step.sub_queries.length} sub-quer{step.sub_queries.length === 1 ? 'y' : 'ies'}
          </span>
          <ol className="pl-5 space-y-0.5 text-muted-foreground list-decimal list-inside">
            {step.sub_queries.map((q, qi) => (
              <li key={qi}>{q}</li>
            ))}
          </ol>
          {step.reasoning && (
            <span className="pl-5 text-muted-foreground italic">{step.reasoning}</span>
          )}
        </div>
      )
    } else if (step.type === 'tool_call') {
      // Look ahead for the paired tool_result
      const nextStep = steps[i + 1]
      const result = nextStep?.type === 'tool_result' ? nextStep : null

      elements.push(
        <div key={i} className="step-animate flex flex-col gap-0.5" style={{ animationDelay: delay }}>
          <span className="font-medium text-foreground/80">
            🔍 {step.tool}
          </span>
          {step.query && (
            <span className="pl-5 text-muted-foreground">"{step.query}"</span>
          )}
          {result && (
            <span className="pl-5 text-muted-foreground">→ {result.content}</span>
          )}
        </div>
      )
      // Skip the result step since we rendered it inline
      if (result) i++
    } else if (step.type === 'tool_result') {
      // Only rendered if not already consumed by a preceding tool_call
      elements.push(
        <div key={i} className="step-animate pl-5 text-muted-foreground" style={{ animationDelay: delay }}>
          → {step.content}
        </div>
      )
    } else if (step.type === 'reflect') {
      elements.push(
        <div key={i} className="step-animate flex flex-col gap-0.5" style={{ animationDelay: delay }}>
          <span className={`font-medium ${CONFIDENCE_STYLES[step.confidence]}`}>
            {CONFIDENCE_LABELS[step.confidence]}
          </span>
          {step.note && (
            <span className="pl-5 text-muted-foreground">{step.note}</span>
          )}
        </div>
      )
    }
  }

  return elements
}
