'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { CaseListItem, CaseStatus, CaseType } from '@/types'

const CODE_STORAGE_KEY = 'ybf_activation_code'

const typeLabels: Record<CaseType, string> = {
  penalty: '处罚申辩',
  complaint: '投诉应对',
}

const statusLabels: Record<CaseStatus, string> = {
  uploaded: '已上传',
  analyzing: '分析中',
  'awaiting-answers': '待回答',
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
}

const statusColors: Record<CaseStatus, string> = {
  uploaded: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  analyzing: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  'awaiting-answers': 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  generating: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  completed: 'bg-green-100 text-green-800 hover:bg-green-100',
  failed: 'bg-red-100 text-red-800 hover:bg-red-100',
}

function getCaseRoute(c: CaseListItem): string {
  if (c.status === 'completed') {
    return c.case_type === 'complaint'
      ? `/complaint/done?caseId=${c.id}`
      : `/done?caseId=${c.id}`
  }
  // All other statuses route to the case detail page
  return c.case_type === 'complaint'
    ? `/complaint/${c.id}`
    : `/case/${c.id}`
}

function getSummary(c: CaseListItem): string | null {
  if (c.case_type === 'complaint') {
    const parts: string[] = []
    if (c.complaint_type) parts.push(c.complaint_type)
    if (c.complaint_summary) parts.push(c.complaint_summary)
    return parts.length > 0 ? parts.join(' · ') : null
  }
  const parts: string[] = []
  if (c.violation_type) parts.push(c.violation_type)
  if (c.penalty_amount != null) parts.push(`罚款 ¥${c.penalty_amount.toLocaleString()}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

export default function HistoryPage() {
  const router = useRouter()
  const [cases, setCases] = useState<CaseListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [noCode, setNoCode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = sessionStorage.getItem(CODE_STORAGE_KEY)

    if (!code) {
      setNoCode(true)
      setLoading(false)
      return
    }

    fetch(`/api/cases?activationCode=${encodeURIComponent(code)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`请求失败 (${res.status})`)
        return res.json()
      })
      .then((data) => setCases(data.cases || []))
      .catch((err) => {
        console.error('Failed to load cases:', err)
        setError(err instanceof Error ? err.message : '加载失败，请稍后重试')
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <Header fixed>
        <div className="text-sm font-medium">历史案件</div>
      </Header>
      <Main>
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">历史案件</h1>
            <p className="text-muted-foreground mt-1">
              查看已处理的案件记录
            </p>
          </div>

          {loading && (
            <div className="rounded-lg border bg-card p-8 text-center">
              <p className="text-muted-foreground">加载中…</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/30">
              <p className="text-red-700 dark:text-red-400">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 text-sm text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              >
                重新加载
              </button>
            </div>
          )}

          {!loading && !error && noCode && (
            <div className="rounded-lg border bg-card p-8 text-center">
              <p className="text-muted-foreground">请先输入激活码</p>
              <p className="text-sm text-muted-foreground mt-1">
                返回首页输入激活码后即可查看历史案件
              </p>
            </div>
          )}

          {!loading && !error && !noCode && cases.length === 0 && (
            <div className="rounded-lg border bg-card p-8 text-center">
              <p className="text-muted-foreground">暂无历史案件</p>
              <p className="text-sm text-muted-foreground mt-1">
                处理完成的案件将在此处显示
              </p>
            </div>
          )}

          {!loading && !error && !noCode && cases.length > 0 && (
            <div className="space-y-3">
              {cases.map((c) => {
                const summary = getSummary(c)
                return (
                  <Card
                    key={c.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => router.push(getCaseRoute(c))}
                  >
                    <CardContent className="flex items-start justify-between gap-4 py-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{typeLabels[c.case_type]}</Badge>
                          <Badge className={statusColors[c.status]}>
                            {statusLabels[c.status]}
                          </Badge>
                        </div>
                        {summary && (
                          <p className="text-sm font-medium truncate">{summary}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleString('zh-CN')}
                        </p>
                      </div>
                      <span className="text-muted-foreground text-sm mt-1">→</span>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </Main>
    </>
  )
}
