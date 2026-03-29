'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Question } from '@/types';

interface QuestionnaireProps {
  questions: Question[];
  onSubmit: (answers: Record<string, string>) => void;
  disabled?: boolean;
  submitLabel?: string;
}

export default function Questionnaire({ questions, onSubmit, disabled, submitLabel = '生成申辩书' }: QuestionnaireProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherKeys, setOtherKeys] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);

  const setAnswer = (key: string, value: string) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  const allRequiredAnswered = questions
    .filter(q => q.required)
    .every(q => answers[q.key]?.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    onSubmit(answers);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <p className="text-xs text-muted-foreground">
          共 {questions.length} 题
        </p>

        {questions.map((q) => (
          <div key={q.key} className="space-y-2">
            <label className="text-sm font-medium block">
              {q.text}
              {q.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <p className="text-xs text-muted-foreground">{q.why}</p>

            {q.type === 'boolean' && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={answers[q.key] === '是' ? 'default' : 'outline'}
                  onClick={() => setAnswer(q.key, '是')}
                  disabled={disabled}
                >
                  是
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={answers[q.key] === '否' ? 'default' : 'outline'}
                  onClick={() => setAnswer(q.key, '否')}
                  disabled={disabled}
                >
                  否
                </Button>
              </div>
            )}

            {q.type === 'text' && (
              <Textarea
                value={answers[q.key] || ''}
                onChange={(e) => setAnswer(q.key, e.target.value)}
                placeholder="请输入..."
                rows={3}
                disabled={disabled}
              />
            )}

            {q.type === 'date' && (
              <input
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={answers[q.key] || ''}
                onChange={(e) => setAnswer(q.key, e.target.value)}
                disabled={disabled}
              />
            )}

            {q.type === 'choice' && Array.isArray(q.options) && q.options.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt) => (
                    <Button
                      key={opt}
                      type="button"
                      size="sm"
                      variant={answers[q.key] === opt ? 'default' : 'outline'}
                      onClick={() => {
                        setAnswer(q.key, opt);
                        setOtherKeys(prev => { const next = new Set(prev); next.delete(q.key); return next; });
                      }}
                      disabled={disabled}
                    >
                      {opt}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant={otherKeys.has(q.key) ? 'default' : 'outline'}
                    onClick={() => {
                      setOtherKeys(prev => { const next = new Set(prev); next.add(q.key); return next; });
                      setAnswer(q.key, '');
                    }}
                    disabled={disabled}
                  >
                    其他
                  </Button>
                </div>
                {otherKeys.has(q.key) && (
                  <Textarea
                    value={answers[q.key]?.startsWith('其他：') ? answers[q.key].slice(3) : ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAnswer(q.key, v.trim() ? `其他：${v}` : '');
                    }}
                    placeholder="请输入其他内容..."
                    rows={3}
                    disabled={disabled}
                  />
                )}
              </div>
            ) : q.type !== 'boolean' && q.type !== 'text' && q.type !== 'date' && (
              // Fallback: render text input for unknown/misconfigured types
              <Textarea
                value={answers[q.key] || ''}
                onChange={(e) => setAnswer(q.key, e.target.value)}
                placeholder="请输入..."
                rows={2}
                disabled={disabled}
              />
            )}
          </div>
        ))}

        <div className="space-y-2 border-t pt-4">
          <label className="text-sm font-medium block">
            是否还有其他补充？<span className="ml-2">如没有可留空</span>
          </label>
          <Textarea
            value={answers['_extra_supplement'] || ''}
            onChange={(e) => setAnswer('_extra_supplement', e.target.value)}
            placeholder="如有特殊情况说明、已采取的整改措施等，请在此补充..."
            rows={4}
            disabled={disabled}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={disabled || !allRequiredAnswered}
        >
          {submitLabel}
        </Button>
      </form>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>免责声明</DialogTitle>
            <DialogDescription>
              本申辩书由 AI 辅助生成，仅供参考，不构成法律意见。建议提交前请律师审核。确认生成？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              取消
            </Button>
            <Button onClick={handleConfirm}>
              确认生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
