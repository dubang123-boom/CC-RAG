'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ActivationCode } from '@/types';

const KEY_STORAGE = 'ybf_admin_key';

export default function AdminPage() {
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 生成区
  const [genCount, setGenCount] = useState(1);
  const [genMemo, setGenMemo] = useState('');
  const [generating, setGenerating] = useState(false);

  // 复制提示
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const headers = useCallback(
    (secret: string) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    }),
    []
  );

  const fetchCodes = useCallback(
    async (secret: string) => {
      const res = await fetch('/api/admin/codes', {
        headers: headers(secret),
      });
      if (!res.ok) throw new Error('Unauthorized');
      const data = await res.json();
      setCodes(data.codes ?? []);
    },
    [headers]
  );

  // 恢复 session
  useEffect(() => {
    const saved = sessionStorage.getItem(KEY_STORAGE);
    if (saved) {
      setLoading(true);
      fetchCodes(saved)
        .then(() => {
          setKey(saved);
          setAuthed(true);
        })
        .catch(() => sessionStorage.removeItem(KEY_STORAGE))
        .finally(() => setLoading(false));
    }
  }, [fetchCodes]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await fetchCodes(key.trim());
      sessionStorage.setItem(KEY_STORAGE, key.trim());
      setAuthed(true);
      window.dispatchEvent(new Event('admin-auth-change'));
    } catch {
      setError('密钥无效');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthed(false);
    setCodes([]);
    setKey('');
    sessionStorage.removeItem(KEY_STORAGE);
    window.dispatchEvent(new Event('admin-auth-change'));
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify({
          count: genCount,
          memo: genMemo.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '生成失败');
      }
      setGenMemo('');
      await fetchCodes(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  // ---------- 未登录 ----------
  if (!authed) {
    return (
      <>
        <Header fixed>
          <div className="text-sm font-medium">管理后台</div>
        </Header>
        <Main>
          <div className="mx-auto w-full max-w-sm space-y-6 text-center py-16">
            <h1 className="text-2xl font-bold tracking-tight">管理后台</h1>
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="请输入管理员密钥"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading}
                autoFocus
              />
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !key.trim()}
              >
                {loading ? '验证中...' : '登录'}
              </Button>
            </form>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </Main>
      </>
    );
  }

  // ---------- 已登录 ----------
  return (
    <>
      <Header fixed>
        <div className="text-sm font-medium">管理后台</div>
      </Header>
      <Main>
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {/* 顶部 */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">激活码管理</h1>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              退出
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 生成区 */}
          <Card>
            <CardHeader>
              <CardTitle>生成激活码</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleGenerate}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">数量</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={genCount}
                    onChange={(e) => setGenCount(Number(e.target.value))}
                    className="w-20 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={generating}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">备注</label>
                  <input
                    type="text"
                    value={genMemo}
                    onChange={(e) => setGenMemo(e.target.value)}
                    placeholder="可选"
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={generating}
                  />
                </div>
                <Button type="submit" disabled={generating}>
                  {generating ? '生成中...' : '生成'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* 激活码列表 */}
          <Card>
            <CardHeader>
              <CardTitle>
                激活码列表
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({codes.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {codes.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无激活码</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">激活码</th>
                        <th className="pb-2 pr-4 font-medium">已用/总量</th>
                        <th className="pb-2 pr-4 font-medium">备注</th>
                        <th className="pb-2 font-medium">创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map((c) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">
                            <button
                              onClick={() => handleCopy(c.code)}
                              className="font-mono text-xs tracking-wide hover:text-primary transition-colors cursor-pointer"
                              title="点击复制"
                            >
                              {c.code}
                              {copiedCode === c.code && (
                                <span className="ml-1.5 text-green-600 dark:text-green-400">
                                  已复制
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="py-2 pr-4">
                            {c.used_count}/{c.max_uses}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {c.memo || '-'}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {new Date(c.created_at).toLocaleDateString('zh-CN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  );
}
