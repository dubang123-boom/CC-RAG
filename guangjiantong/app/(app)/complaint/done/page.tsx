'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { marked } from 'marked';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import CopyButton from '@/components/CopyButton';

type TabKey = 'response' | 'negotiation' | 'risk';

function ComplaintDoneContent() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get('caseId');
  const [activeTab, setActiveTab] = useState<TabKey>('response');

  // Raw markdown for copy
  const [responseLetterMd, setResponseLetterMd] = useState<string | null>(null);
  const [negotiationScriptMd, setNegotiationScriptMd] = useState<string | null>(null);
  const [riskWarningMd, setRiskWarningMd] = useState<string | null>(null);

  // Rendered HTML
  const [responseHtml, setResponseHtml] = useState<string | null>(null);
  const [negotiationHtml, setNegotiationHtml] = useState<string | null>(null);
  const [riskHtml, setRiskHtml] = useState<string | null>(null);

  const fetchCaseData = useCallback(async () => {
    if (!caseId) return;
    try {
      const caseRes = await fetch(`/api/cases/${caseId}`);
      if (caseRes.ok) {
        const json = await caseRes.json();
        if (json.document?.response_letter_md) {
          setResponseLetterMd(json.document.response_letter_md);
          const html = await marked(json.document.response_letter_md);
          setResponseHtml(html);
        }
        if (json.document?.negotiation_script_md) {
          setNegotiationScriptMd(json.document.negotiation_script_md);
          const html = await marked(json.document.negotiation_script_md);
          setNegotiationHtml(html);
        }
        if (json.document?.risk_warning_md) {
          setRiskWarningMd(json.document.risk_warning_md);
          const html = await marked(json.document.risk_warning_md);
          setRiskHtml(html);
        }
      }
    } catch {
      // Non-critical
    }
  }, [caseId]);

  useEffect(() => {
    if (!caseId) return;
    fetchCaseData();
  }, [caseId, fetchCaseData]);

  const tabs: { key: TabKey; label: string; hasContent: boolean }[] = [
    { key: 'response', label: '回复函', hasContent: !!responseHtml },
    { key: 'negotiation', label: '协商话术', hasContent: !!negotiationHtml },
    { key: 'risk', label: '整改与风险', hasContent: !!riskHtml },
  ];

  const currentMd = activeTab === 'response' ? responseLetterMd
    : activeTab === 'negotiation' ? negotiationScriptMd
      : riskWarningMd;

  const currentHtml = activeTab === 'response' ? responseHtml
    : activeTab === 'negotiation' ? negotiationHtml
      : riskHtml;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <style>{`
        .document-content {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .document-content table {
          table-layout: fixed;
          width: 100%;
        }
        .document-content td,
        .document-content th {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .document-content pre {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        @media print {
          nav, header, footer,
          .no-print,
          [data-slot="sidebar-wrapper"],
          [data-slot="sidebar"],
          [data-sidebar="rail"],
          button, a[download] {
            display: none !important;
          }
          [data-slot="sidebar-inset"] {
            margin: 0 !important;
            padding: 0 !important;
          }
          body {
            margin: 0;
            padding: 15mm 20mm;
          }
          .document-content {
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            font-family: "SimSun", "宋体", serif;
            font-size: 12pt;
            line-height: 1.5;
          }
        }
      `}</style>

      <div className="text-center space-y-2 no-print">
        <h1 className="text-3xl font-bold">回复方案已生成</h1>
        <p className="text-muted-foreground">
          您的投诉回复方案已生成，包含回复函、协商话术和整改建议
        </p>
      </div>

      <div className="space-y-3 text-center no-print">
        {caseId && (
          <a
            href={`/api/download/${caseId}`}
            download="投诉回复函.docx"
            className="inline-flex items-center justify-center w-full max-w-md rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            下载 投诉回复函 Word
          </a>
        )}

        {responseHtml && (
          <button
            onClick={() => window.print()}
            className="inline-flex items-center justify-center w-full max-w-md rounded-md border border-input bg-background px-6 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            打印 / 另存为 PDF
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      {(responseHtml || negotiationHtml || riskHtml) && (
        <div className="no-print">
          <div className="flex rounded-lg border bg-muted p-1">
            {tabs.filter(t => t.hasContent).map(tab => (
              <button
                key={tab.key}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content */}
      {currentHtml && (
        <div className="space-y-3">
          <div className="flex justify-end no-print">
            {currentMd && <CopyButton text={currentMd} label="复制内容" />}
          </div>
          <article
            className="document-content rounded-lg border bg-white p-8 prose prose-sm max-w-none break-words dark:bg-zinc-950 dark:prose-invert
              [&_h1]:text-center [&_h1]:text-xl [&_h1]:tracking-[0.5em] [&_h1]:mb-6
              [&_h2]:text-base [&_h2]:mt-6 [&_h2]:mb-3
              [&_p]:my-2 [&_p]:leading-relaxed
              [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_td]:p-2 [&_table]:border-collapse [&_th]:border [&_td]:border"
            dangerouslySetInnerHTML={{ __html: currentHtml }}
          />
        </div>
      )}

      <div className="space-y-2 text-left text-sm text-muted-foreground no-print">
        <p>接下来请：</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>下载并打印投诉回复函</li>
          <li>准备相关证据材料</li>
          <li>加盖企业公章</li>
          <li>在回复期限内提交给市监局</li>
          <li>参考协商话术与消费者沟通</li>
          <li>按整改清单落实整改措施</li>
        </ol>
      </div>

      <p className="text-xs text-muted-foreground text-center no-print">
        如有疑问，建议咨询专业律师进行最终审核。
      </p>

      <div className="text-center no-print">
        <Link
          href="/complaint"
          className="inline-block rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          处理新投诉
        </Link>
      </div>
    </div>
  );
}

export default function ComplaintDonePage() {
  return (
    <>
      <Header fixed>
        <div className="text-sm font-medium">回复方案</div>
      </Header>
      <Main>
        <Suspense fallback={<p className="text-muted-foreground text-center py-16">加载中...</p>}>
          <ComplaintDoneContent />
        </Suspense>
      </Main>
    </>
  );
}
