'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Action = 'improve' | 'shorten' | 'expand' | 'fix' | 'casual' | 'formal';
const ACTIONS: { id: Action; label: string }[] = [
  { id: 'improve', label: 'Improve' },
  { id: 'fix', label: 'Fix grammar' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'expand', label: 'Expand' },
  { id: 'casual', label: 'Casual' },
  { id: 'formal', label: 'Formal' },
];

/** AI compose-assist chips that rewrite the current draft in place. */
export function ComposeAssist({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState<Action | null>(null);

  if (value.trim().length < 3) return null;

  const run = async (action: Action) => {
    setBusy(action);
    try {
      const res = await fetch('/api/ai/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: value, action }),
      });
      if (res.status === 503) {
        toast.error('AI assist is unavailable right now.');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.text) onChange(data.text);
      else toast.error(data.error || 'Could not rewrite');
    } catch {
      toast.error('Could not rewrite');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="AI writing assist">
      <span className="flex items-center gap-1 text-xs text-site-text-dim">
        <Sparkles className="h-3.5 w-3.5 text-site-accent" /> AI
      </span>
      {ACTIONS.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={busy !== null}
          onClick={() => run(a.id)}
          className="inline-flex items-center gap-1 rounded-full border border-site-border px-2.5 py-1 text-xs text-site-text-muted transition-colors hover:bg-site-surface hover:text-site-text disabled:opacity-50"
        >
          {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {a.label}
        </button>
      ))}
    </div>
  );
}
