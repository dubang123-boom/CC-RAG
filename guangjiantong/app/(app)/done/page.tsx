'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { marked } from 'marked';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import DeadlineCountdown from '@/components/DeadlineCountdown';

function DoneContent() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get('caseId');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [documentHtml, setDocumentHtml] = useState<string | null>(null);
  const [evidenceHtml, setEvidenceHtml] = useState<string | null>(null);
  const [hearingHtml, setHearingHtml] = useState<string | null>(null);
  const hasHearing = !!hearingHtml;

  const fetchCaseData = useCallback(async () => {
    if (!caseId) return;
    try {
      const caseRes = await fetch(`/api/cases/${caseId}`);
      if (caseRes.ok) {
        const json = await caseRes.json();
        if (json.analysis?.defense_deadline) {
          setDeadline(json.analysis.defense_deadline);
        }
        // Render document markdown inline
        if (json.document?.statement_md) {
          const html = await marked(json.document.statement_md);
          setDocumentHtml(html);
        }
        if (json.document?.evidence_checklist_md) {
          const html = await marked(json.document.evidence_checklist_md);
          setEvidenceHtml(html);
        }
        if (json.document?.hearing_application_md) {
          const html = await marked(json.document.hearing_application_md);
          setHearingHtml(html);
        }
      }
    } catch {
      // Case data fetch is non-critical
    }
  }, [caseId]);

  useEffect(() => {
    if (!caseId) return;
    fetchCaseData();
  }, [caseId, fetchCaseData]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* Print-only styles */}
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
        @page {
          size: A4;
          margin: 0;
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
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
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
          .document-content p {
            text-indent: 2em;
            margin: 0.5em 0;
          }
          .document-content h1 {
            font-size: 16pt;
            text-align: center;
            letter-spacing: 0.5em;
            margin-bottom: 1em;
          }
          .document-content h2 {
            font-size: 12pt;
            font-weight: bold;
            margin: 1em 0 0.5em;
          }
          .print-page-break {
            break-before: page;
          }
        }
      `}</style>

      <div className="text-center space-y-2 no-print">
        <h1 className="text-3xl font-bold">文书已生成</h1>
        <p className="text-muted-foreground">
          您的陈述申辩意见书已生成{documentHtml ? '，内容如下' : '，请点击下方按钮下载'}
        </p>
      </div>

      <div className="space-y-3 text-center no-print">
        {caseId && (
          <a
            href={`/api/download/${caseId}`}
            download="陈述申辩意见书.docx"
            className="inline-flex items-center justify-center w-full max-w-md rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            下载 陈述申辩意见书 Word
          </a>
        )}
        {caseId && hasHearing && (
          <a
            href={`/api/download/${caseId}?type=hearing`}
            download="听证申请书.docx"
            className="inline-flex items-center justify-center w-full max-w-md rounded-md border border-input bg-background px-6 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            下载 听证申请书 Word
          </a>
        )}

        {documentHtml && (
          <button
            onClick={() => window.print()}
            className="inline-flex items-center justify-center w-full max-w-md rounded-md border border-input bg-background px-6 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            打印 / 另存为 PDF
          </button>
        )}
      </div>

      {/* Inline document content */}
      {documentHtml && (
        <article
          className="document-content rounded-lg border bg-white p-8 prose prose-sm max-w-none break-words dark:bg-zinc-950 dark:prose-invert
            [&_h1]:text-center [&_h1]:text-xl [&_h1]:tracking-[0.5em] [&_h1]:mb-6
            [&_h2]:text-base [&_h2]:mt-6 [&_h2]:mb-3
            [&_p]:indent-8 [&_p]:my-2 [&_p]:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: documentHtml }}
        />
      )}

      {/* Evidence checklist */}
      {evidenceHtml && (
        <div className="space-y-3 print-page-break">
          <h2 className="text-lg font-semibold no-print">证据清单与附件准备指南</h2>
          <article
            className="document-content rounded-lg border bg-white p-8 prose prose-sm max-w-none break-words dark:bg-zinc-950 dark:prose-invert
              [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_td]:p-2 [&_table]:border-collapse [&_th]:border [&_td]:border"
            dangerouslySetInnerHTML={{ __html: evidenceHtml }}
          />
        </div>
      )}

      {/* Hearing application */}
      {hearingHtml && (
        <div className="space-y-3 print-page-break">
          <h2 className="text-lg font-semibold no-print">听证申请书</h2>
          <article
            className="document-content rounded-lg border bg-white p-8 prose prose-sm max-w-none break-words dark:bg-zinc-950 dark:prose-invert
              [&_h1]:text-center [&_h1]:text-xl [&_h1]:tracking-[0.5em] [&_h1]:mb-6
              [&_h2]:text-base [&_h2]:mt-6 [&_h2]:mb-3
              [&_p]:indent-8 [&_p]:my-2 [&_p]:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: hearingHtml }}
          />
        </div>
      )}

      {deadline && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-left dark:border-yellow-900 dark:bg-yellow-950 no-print">
          <p className="text-sm font-medium mb-1">申辩截止日期</p>
          <DeadlineCountdown deadline={deadline} />
        </div>
      )}

      <div className="space-y-2 text-left text-sm text-muted-foreground no-print">
        <p>接下来请：</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>下载并打印陈述申辩意见书</li>
          <li>按照证据清单准备附件材料</li>
          <li>加盖企业公章</li>
          <li>在截止日期前提交给市监局</li>
        </ol>
      </div>
      <p className="text-xs text-muted-foreground text-center no-print">
        如有疑问，建议咨询专业律师进行最终审核。
      </p>
      <div className="text-center no-print">
        <Link
          href="/tool"
          className="inline-block rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          分析新案件
        </Link>
      </div>
    </div>
  );
}

export default function DonePage() {
  return (
    <>
      <Header fixed>
        <div className="text-sm font-medium">文书生成</div>
      </Header>
      <Main>
        <Suspense fallback={<p className="text-muted-foreground text-center py-16">加载中...</p>}>
          <DoneContent />
        </Suspense>
      </Main>
    </>
  );
}
