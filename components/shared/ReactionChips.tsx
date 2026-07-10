'use client';

import type { ReactionSummary } from '@/lib/social/reactions';

interface ReactionChipsProps {
  reactions: ReactionSummary[];
  onToggle: (emoji: string) => void;
  className?: string;
}

export function ReactionChips({ reactions, onToggle, className = '' }: ReactionChipsProps) {
  if (reactions.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(r.emoji);
          }}
          aria-pressed={r.reactedByMe}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
            r.reactedByMe
              ? 'border-site-accent bg-site-accent/15 text-site-accent'
              : 'border-site-border bg-site-surface/60 text-site-text-dim hover:border-site-text-dim'
          }`}
        >
          <span className="text-sm leading-none">{r.emoji}</span>
          <span className="font-mono">{r.count}</span>
        </button>
      ))}
    </div>
  );
}
