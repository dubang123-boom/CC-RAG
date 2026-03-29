'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ACCEPTED_TYPES = ['application/pdf'];
const MIN_TEXT_LENGTH = 50;

type UploadStage = 'idle' | 'creating' | 'uploading' | 'analyzing' | 'done' | 'error';
type InputMode = 'file' | 'text';

const STAGE_LABELS: Record<UploadStage, string> = {
  idle: '',
  creating: '正在创建案件...',
  uploading: '正在上传文件...',
  analyzing: '正在分析处罚文书...',
  done: '分析完成，正在跳转...',
  error: '出错了',
};

interface FileUploadProps {
  activationCode: string;
}

export default function FileUpload({ activationCode }: FileUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [textContent, setTextContent] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (stage !== 'analyzing') {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [stage]);

  const handleAnalyzeSSE = useCallback(async (caseId: string) => {
    setStage('analyzing');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 360000); // 6 分钟超时
    try {
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId }),
        signal: controller.signal,
      });

      if (!analyzeRes.ok) {
        throw new Error('启动分析失败');
      }

      const reader = analyzeRes.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('无法读取分析响应');

      let buffer = '';
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }
        // Extract complete SSE events (delimited by \n\n)
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of raw.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'status') {
                setAnalyzeMessage(event.message || '');
                setProgress(70);
              } else if (event.type === 'result') {
                setProgress(100);
                setStage('done');
                setTimeout(() => router.push(`/case/${caseId}`), 500);
                return;
              } else if (event.type === 'error') {
                throw new Error(event.message || '分析失败');
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }
      // Stream ended without receiving a result event
      throw new Error('分析连接意外断开，请重试');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new Error('文书分析超时，请重试');
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }, [router]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('请上传 PDF 格式的文件');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('文件大小不能超过 20MB');
      return;
    }

    try {
      // Step 1: Create case
      setStage('creating');
      setProgress(10);

      const createRes = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, activationCode }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error || '创建案件失败');
      }

      const { caseId, uploadUrl, uploadToken } = await createRes.json();
      setProgress(25);

      // Step 2: Upload file to signed URL
      setStage('uploading');
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          'x-upsert': 'true',
        },
        body: file,
      });

      if (!uploadRes.ok) {
        // Try alternative upload with token
        const uploadRes2 = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type,
            Authorization: `Bearer ${uploadToken}`,
          },
          body: file,
        });
        if (!uploadRes2.ok) {
          throw new Error('文件上传失败');
        }
      }

      setProgress(50);

      // Step 3: Trigger analysis (SSE)
      await handleAnalyzeSSE(caseId);
    } catch (err) {
      setStage('error');
      setError(err instanceof Error ? err.message : '操作失败');
      setProgress(0);
    }
  }, [handleAnalyzeSSE]);

  const handleTextSubmit = useCallback(async () => {
    setError(null);

    if (textContent.trim().length < MIN_TEXT_LENGTH) {
      setError(`文字内容不能少于 ${MIN_TEXT_LENGTH} 字`);
      return;
    }

    try {
      // Step 1: Create case with text content
      setStage('creating');
      setProgress(10);

      const createRes = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textContent: textContent.trim(), activationCode }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error || '创建案件失败');
      }

      const { caseId } = await createRes.json();
      setProgress(50);

      // Step 2: Trigger analysis (SSE) — skip file upload
      await handleAnalyzeSSE(caseId);
    } catch (err) {
      setStage('error');
      setError(err instanceof Error ? err.message : '操作失败');
      setProgress(0);
    }
  }, [textContent, handleAnalyzeSSE]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const isProcessing = stage !== 'idle' && stage !== 'error';

  const resetState = () => {
    setStage('idle');
    setError(null);
    setProgress(0);
  };

  return (
    <div className="space-y-4">
      {/* Tab 切换 */}
      <div className="flex rounded-lg border bg-muted p-1">
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            inputMode === 'file'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => { setInputMode('file'); resetState(); }}
          disabled={isProcessing}
        >
          上传 PDF
        </button>
        <button
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            inputMode === 'text'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => { setInputMode('text'); resetState(); }}
          disabled={isProcessing}
        >
          粘贴文字
        </button>
      </div>

      {/* PDF 上传区域 */}
      {inputMode === 'file' && (
        <div
          className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleInputChange}
          />
          <div className="space-y-2">
            <div className="text-4xl">📄</div>
            <p className="text-sm font-medium">
              点击或拖拽上传处罚文书
            </p>
            <p className="text-xs text-muted-foreground">
              支持 PDF 格式，最大 20MB
            </p>
            <p className="text-xs text-muted-foreground">
              请确保文字清晰可读，以便 AI 准确识别
            </p>
          </div>
        </div>
      )}

      {/* 文字输入区域 */}
      {inputMode === 'text' && (
        <div className="space-y-3">
          <textarea
            className="w-full min-h-[200px] rounded-lg border bg-background p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            placeholder="请将行政处罚事先告知书的内容粘贴到此处..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            disabled={isProcessing}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              已输入 {textContent.length} 字（最少 {MIN_TEXT_LENGTH} 字）
            </p>
            <Button
              onClick={handleTextSubmit}
              disabled={isProcessing || textContent.trim().length < MIN_TEXT_LENGTH}
            >
              开始分析
            </Button>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-center text-muted-foreground">
            {stage === 'analyzing' && analyzeMessage
              ? `${analyzeMessage}${elapsedSeconds > 0 ? `（已等待 ${elapsedSeconds} 秒）` : ''}`
              : STAGE_LABELS[stage]}
          </p>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {stage === 'error' && (
        <Button
          variant="outline"
          className="w-full"
          onClick={resetState}
        >
          重试
        </Button>
      )}
    </div>
  );
}
