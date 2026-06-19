'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

/**
 * Request shapes accepted by POST /api/rmharks/ai-generate.
 * `draft` carries whatever the user has already typed so the model builds on it.
 */
export type AIGenerateRequest =
  | { mode: 'post'; draft?: string }
  | { mode: 'reply'; rmharkId: string; parentId?: string; draft?: string };

interface AIGenerateButtonProps {
  request: AIGenerateRequest;
  /** Receives the generated draft so the caller can drop it into its textarea. */
  onGenerated: (text: string) => void;
  size?: 'sm' | 'md';
  title?: string;
  className?: string;
}

/**
 * A sparkle button that asks DeepSeek to draft a post or reply and hands the
 * result back to the parent composer. Purely a drafting aid — the user still
 * reviews and submits the text themselves.
 */
export function AIGenerateButton({
  request,
  onGenerated,
  size = 'md',
  title = 'Generate with AI',
  className = '',
}: AIGenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rmharks/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to generate');
        return;
      }
      if (typeof data?.content === 'string' && data.content.trim()) {
        onGenerated(data.content);
      }
    } catch {
      setError('Failed to generate');
    } finally {
      setLoading(false);
    }
  };

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5';
  const pad = size === 'sm' ? 'p-1' : 'p-1.5';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title={error || title}
      aria-label={title}
      className={`${pad} rounded-full transition-colors disabled:opacity-60 ${
        error
          ? 'text-site-danger hover:bg-site-danger/10'
          : 'text-site-text-dim hover:text-site-accent hover:bg-site-accent/10'
      } ${className}`}
    >
      {loading ? (
        <Loader2 className={`${iconSize} animate-spin`} />
      ) : (
        <Sparkles className={iconSize} />
      )}
    </button>
  );
}
