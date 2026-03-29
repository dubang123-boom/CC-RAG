'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import FileUpload from '@/components/FileUpload';
import ComplaintFileUpload from '@/components/ComplaintFileUpload';

const CODE_STORAGE_KEY = 'ybf_activation_code';

interface ActivationGateProps {
  uploadComponent?: 'penalty' | 'complaint';
}

export default function ActivationGate({ uploadComponent = 'penalty' }: ActivationGateProps) {
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [verifiedCode, setVerifiedCode] = useState('');
  const [remainingUses, setRemainingUses] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 恢复 sessionStorage 中已保存的激活码
  useEffect(() => {
    const saved = sessionStorage.getItem(CODE_STORAGE_KEY);
    if (saved) {
      validateCode(saved);
    }
  }, []);

  async function validateCode(codeToValidate: string) {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeToValidate }),
      });

      const data = await res.json();

      if (data.valid) {
        const normalized = codeToValidate.toUpperCase().trim();
        setVerified(true);
        setVerifiedCode(normalized);
        setRemainingUses(data.remainingUses ?? null);
        sessionStorage.setItem(CODE_STORAGE_KEY, normalized);
      } else {
        setVerified(false);
        setVerifiedCode('');
        setRemainingUses(null);
        sessionStorage.removeItem(CODE_STORAGE_KEY);
        setError(data.error || '激活码无效');
      }
    } catch {
      setError('验证失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    validateCode(code.trim());
  };

  const handleLogout = () => {
    setVerified(false);
    setVerifiedCode('');
    setRemainingUses(null);
    setCode('');
    sessionStorage.removeItem(CODE_STORAGE_KEY);
  };

  if (verified) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border bg-green-50 px-4 py-2 dark:bg-green-950/30">
          <div className="text-sm">
            <span className="font-medium text-green-700 dark:text-green-400">
              激活码：{verifiedCode}
            </span>
            {remainingUses !== null && (
              <span className="ml-2 text-muted-foreground">
                （剩余 {remainingUses} 次生成）
              </span>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            更换
          </button>
        </div>
        {uploadComponent === 'complaint'
          ? <ComplaintFileUpload activationCode={verifiedCode} />
          : <FileUpload activationCode={verifiedCode} />
        }
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="activation-code" className="block text-sm font-medium mb-1">
            请输入激活码
          </label>
          <input
            id="activation-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="YBF-XXXX"
            maxLength={8}
            className="w-full rounded-md border bg-background px-3 py-2 text-center text-lg font-mono tracking-widest placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={loading}
            autoFocus
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={loading || !code.trim()}
        >
          {loading ? '验证中...' : '验证激活码'}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-center text-muted-foreground">
        激活码可从卖家处获取，每个激活码可生成 3 次申辩书
      </p>
    </div>
  );
}
