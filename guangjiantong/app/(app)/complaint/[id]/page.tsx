'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import EscalationRiskBadge from '@/components/EscalationRiskBadge';
import CostComparison from '@/components/CostComparison';
import Questionnaire from '@/components/Questionnaire';
import type { Case, ComplaintAnalysis, EscalationRisk, RecommendedStrategy } from '@/types';

interface CaseResponse {
  case: Case;
  analysis: ComplaintAnalysis | null;
}

const strategyLabels: Record<RecommendedStrategy, string> = {
  cooperative: '主动和解',
  negotiate: '协商谈判',
  defend: '依法抗辩',
};

const strategyColors: Record<RecommendedStrategy, string> = {
  cooperative: 'bg-green-100 text-green-800 hover:bg-green-100',
  negotiate: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  defend: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
};

export default function ComplaintCasePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<CaseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState('');
  const [generateProgress, setGenerateProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function fetchCase() {
      try {
        const res = await fetch(`/api/cases/${id}`);
        if (!res.ok) throw new Error('无法加载案件信息');
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    }
    fetchCase();
  }, [id]);

  if (loading) {
    return (
      <>
        <Header fixed>
          <div className="text-sm font-medium">投诉分析</div>
        </Header>
        <Main>
          <div className="flex items-center justify-center py-16">
            <p className="text-muted-foreground">加载中...</p>
          </div>
        </Main>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Header fixed>
          <div className="text-sm font-medium">投诉分析</div>
        </Header>
        <Main>
          <div className="mx-auto max-w-md py-8">
            <Alert variant="destructive">
              <AlertDescription>{error || '案件不存在'}</AlertDescription>
            </Alert>
          </div>
        </Main>
      </>
    );
  }

  const { case: caseData, analysis } = data;

  if (caseData.status === 'analyzing') {
    return (
      <>
        <Header fixed>
          <div className="text-sm font-medium">投诉分析</div>
        </Header>
        <Main>
          <div className="flex items-center justify-center py-16">
            <div className="text-center space-y-4">
              <div className="text-4xl animate-pulse">&#9881;</div>
              <p className="text-muted-foreground">正在分析投诉内容...</p>
            </div>
          </div>
        </Main>
      </>
    );
  }

  if (caseData.status === 'failed') {
    return (
      <>
        <Header fixed>
          <div className="text-sm font-medium">投诉分析</div>
        </Header>
        <Main>
          <div className="mx-auto max-w-md py-8">
            <Alert variant="destructive">
              <AlertDescription>
                分析失败：{caseData.error_message || '未知错误'}
              </AlertDescription>
            </Alert>
          </div>
        </Main>
      </>
    );
  }

  const clearProgressInterval = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const startSlowProgress = (from: number, ceiling: number) => {
    clearProgressInterval();
    progressIntervalRef.current = setInterval(() => {
      setGenerateProgress((prev) => {
        if (prev >= ceiling - 1) {
          clearProgressInterval();
          return prev;
        }
        return prev + 3;
      });
    }, 2000);
  };

  const statusProgressMap: Record<string, number> = {
    '正在提交...': 5,
    '正在起草回复函...': 20,
    '正在生成 Word 文档...': 85,
  };

  const handleQuestionnaireSubmit = async (answers: Record<string, string>) => {
    setIsGenerating(true);
    setGenerateStatus('正在提交...');
    setGenerateProgress(5);
    setGenerateError(null);

    try {
      const res = await fetch('/api/complaint/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: id, answers }),
      });

      if (!res.ok || !res.body) {
        const contentType = res.headers.get('content-type') || '';
        let errorMsg = `请求失败 (HTTP ${res.status})`;
        try {
          const text = await res.text();
          console.error('[generate] Error response:', { status: res.status, contentType, body: text.slice(0, 500) });
          try {
            const body = JSON.parse(text);
            errorMsg = body.error || body.detail || body.message || errorMsg;
          } catch {
            const trimmed = text.trim();
            if (trimmed && !trimmed.startsWith('<')) {
              errorMsg = trimmed.slice(0, 200);
            }
          }
        } catch (e) {
          console.error('[generate] Failed to read error response:', e);
        }
        throw new Error(errorMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'status') {
              setGenerateStatus(event.message);
              const target = statusProgressMap[event.message];
              if (target !== undefined) {
                clearProgressInterval();
                setGenerateProgress(target);
                if (event.message === '正在起草回复函...') {
                  startSlowProgress(target, 85);
                }
              }
            } else if (event.type === 'done') {
              clearProgressInterval();
              setGenerateProgress(100);
              setGenerateStatus('生成完成！');
              await new Promise((r) => setTimeout(r, 500));
              const params = new URLSearchParams({ caseId: id });
              if (event.docxUrl) params.set('docxUrl', event.docxUrl);
              router.push(`/complaint/done?${params.toString()}`);
              return;
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
      // Stream ended without 'done' event
      throw new Error('生成连接意外断开，请重试');
    } catch (err) {
      clearProgressInterval();
      setGenerateError(err instanceof Error ? err.message : '生成失败，请重试');
      setIsGenerating(false);
      setGenerateStatus('');
      setGenerateProgress(0);
    }
  };

  return (
    <>
      <Header fixed>
        <div className="text-sm font-medium">投诉分析结果</div>
      </Header>
      <Main>
        <div className="mx-auto w-full max-w-lg space-y-6">
          <div>
            <h1 className="text-2xl font-bold">投诉分析结果</h1>
            <p className="text-xs text-muted-foreground mt-1">
              案件 ID: {id}
            </p>
          </div>

          {generateError && (
            <Alert variant="destructive">
              <AlertDescription>{generateError}</AlertDescription>
            </Alert>
          )}

          {isGenerating && (
            <Card>
              <CardContent className="py-8 space-y-4">
                <Progress value={generateProgress} className="h-2">
                  <ProgressLabel>{generateStatus}</ProgressLabel>
                  <ProgressValue />
                </Progress>
              </CardContent>
            </Card>
          )}

          {analysis && (
            <>
              {/* Analysis Summary Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>投诉概要</span>
                    {analysis.escalation_risk && (
                      <EscalationRiskBadge value={analysis.escalation_risk as EscalationRisk} />
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">投诉类型</p>
                      <p className="font-medium">{analysis.complaint_type || '未识别'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">投诉来源</p>
                      <p className="font-medium">{analysis.complaint_source || '未识别'}</p>
                    </div>
                  </div>

                  {analysis.complaint_summary && (
                    <div className="text-sm">
                      <p className="text-muted-foreground">投诉摘要</p>
                      <p>{analysis.complaint_summary}</p>
                    </div>
                  )}

                  {analysis.response_deadline_days && (
                    <div className="text-sm">
                      <p className="text-muted-foreground">建议回复期限</p>
                      <p className="font-medium text-orange-600">
                        {analysis.response_deadline_days} 天内回复
                      </p>
                    </div>
                  )}

                  {analysis.recommended_strategy && (
                    <div className="text-sm">
                      <p className="text-muted-foreground">推荐策略</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={strategyColors[analysis.recommended_strategy as RecommendedStrategy]}>
                          {strategyLabels[analysis.recommended_strategy as RecommendedStrategy]}
                        </Badge>
                        {analysis.strategy_explanation && (
                          <span className="text-xs text-muted-foreground">{analysis.strategy_explanation}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {analysis.cited_articles && analysis.cited_articles.length > 0 && (
                    <div className="text-sm">
                      <p className="text-muted-foreground mb-1">涉及法条</p>
                      <div className="flex flex-wrap gap-1">
                        {analysis.cited_articles.map((art: string) => (
                          <Badge key={art} variant="secondary" className="text-xs">
                            {art}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Escalation Risk Reason */}
              {analysis.escalation_risk_reason && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">升级风险评估</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{analysis.escalation_risk_reason}</p>
                  </CardContent>
                </Card>
              )}

              {/* Consumer Claims */}
              {analysis.consumer_claims && analysis.consumer_claims.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">消费者诉求分析</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analysis.consumer_claims.map((claim: { description: string; legal_basis: string; validity: string; validity_reason: string }, i: number) => (
                      <div key={i} className="rounded-lg border p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{claim.description}</p>
                          <Badge
                            className={
                              claim.validity === 'valid'
                                ? 'bg-red-100 text-red-800 hover:bg-red-100'
                                : claim.validity === 'partial'
                                  ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                                  : 'bg-green-100 text-green-800 hover:bg-green-100'
                            }
                          >
                            {claim.validity === 'valid' ? '诉求成立' : claim.validity === 'partial' ? '部分成立' : '诉求不成立'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">法律依据：{claim.legal_basis}</p>
                        <p className="text-xs">{claim.validity_reason}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Cost Comparison */}
              {analysis.estimated_cost && (
                <CostComparison cost={analysis.estimated_cost} />
              )}

              {/* Questionnaire */}
              {analysis.questions && analysis.questions.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">补充信息</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      回答以下问题，帮助生成更精准的回复方案
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Questionnaire
                      questions={analysis.questions}
                      onSubmit={handleQuestionnaireSubmit}
                      disabled={isGenerating}
                      submitLabel="生成回复方案"
                    />
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </Main>
    </>
  );
}
