import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getLLMSettings, saveLLMSettings } from '@/lib/api'
import type { LLMSettings } from '@/types'

const DEFAULT_SYSTEM_PROMPT_PLACEHOLDER =
  "You are a helpful assistant. Relevant information (from the user's documents, web searches, or database queries) is automatically retrieved by the system and injected into the conversation before you respond. When document excerpts are provided in the context, answer based on those excerpts and cite the source document names. If the retrieved content says 'No relevant documents found', acknowledge that and answer from general knowledge if possible, or ask the user to clarify. When web search results are provided, cite the source URLs in your answer. When document metadata query results are provided, present them clearly. Never say you are 'about to search' or 'will look up' documents — retrieval is already done."

interface SettingsPageProps {
  onBack: () => void
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const [form, setForm] = useState<LLMSettings>({
    llm_api_key: '',
    llm_base_url: '',
    llm_model: '',
    llm_title_model: '',
    llm_system_prompt: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getLLMSettings()
      .then((data) => setForm(data))
      .catch(() => toast.error('Failed to load settings'))
  }, [])

  const handleChange = (field: keyof LLMSettings, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveLLMSettings(form)
      toast.success('LLM settings saved')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 h-14 shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="border-b px-4 flex gap-1 shrink-0">
        <button className="py-2 px-3 text-sm font-medium border-b-2 border-primary text-primary">
          LLM
        </button>
        <button className="py-2 px-3 text-sm font-medium text-muted-foreground cursor-not-allowed" disabled>
          Embedding
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="llm_api_key">API Key</Label>
            <Input
              id="llm_api_key"
              type="password"
              placeholder="sk-..."
              value={form.llm_api_key}
              onChange={(e) => handleChange('llm_api_key', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="llm_base_url">Base URL <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="llm_base_url"
              type="text"
              placeholder="https://openrouter.ai/api/v1"
              value={form.llm_base_url}
              onChange={(e) => handleChange('llm_base_url', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="llm_model">Model</Label>
              <Input
                id="llm_model"
                type="text"
                placeholder="gpt-4o-mini"
                value={form.llm_model}
                onChange={(e) => handleChange('llm_model', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="llm_title_model">Title Model</Label>
              <Input
                id="llm_title_model"
                type="text"
                placeholder="gpt-4o-mini"
                value={form.llm_title_model}
                onChange={(e) => handleChange('llm_title_model', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="llm_system_prompt">System Prompt</Label>
            <Textarea
              id="llm_system_prompt"
              rows={6}
              placeholder={DEFAULT_SYSTEM_PROMPT_PLACEHOLDER}
              value={form.llm_system_prompt}
              onChange={(e) => handleChange('llm_system_prompt', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the built-in default system prompt.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save LLM Settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
