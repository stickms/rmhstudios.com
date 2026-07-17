import { useState, useCallback } from 'react';
import { m as motion } from 'framer-motion';
import type { ReactionCount, Reaction } from '@/lib/doctrine/types';

const REACTIONS: Array<{ key: Reaction; emoji: string; label: string; color: string }> = [
  { key: 'fire', emoji: '🔥', label: 'Fire', color: 'var(--doctrine-reaction-fire, #F97316)' },
  { key: 'based', emoji: '💪', label: 'Based', color: 'var(--doctrine-reaction-based, #22C55E)' },
  { key: 'mid', emoji: '😐', label: 'Mid', color: 'var(--doctrine-reaction-mid, #6B7280)' },
  { key: 'cringe', emoji: '😬', label: 'Cringe', color: 'var(--doctrine-reaction-cringe, #A855F7)' },
  { key: 'trash', emoji: '🗑️', label: 'Trash', color: 'var(--doctrine-reaction-trash, #EF4444)' },
  { key: 'tung', emoji: '🪵', label: 'TUNG', color: 'var(--doctrine-reaction-tung, #A16207)' },
];

interface ReactionBarProps {
  reactions: ReactionCount;
  userReaction?: Reaction | null;
  targetType: 'safehouse' | 'disclosure' | 'incident';
  targetId: string;
  onReact?: (reaction: Reaction) => void;
}

export function ReactionBar({ reactions, userReaction, targetType, targetId, onReact }: ReactionBarProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleReact = useCallback(async (reaction: Reaction) => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const body: Record<string, string> = { reaction: reaction.toUpperCase() };
      if (targetType === 'safehouse') body.safehouseId = targetId;
      if (targetType === 'disclosure') body.disclosureId = targetId;
      if (targetType === 'incident') body.incidentId = targetId;

      await fetch('/api/doctrine/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      onReact?.(reaction);
    } catch {
      // Silent fail
    } finally {
      setSubmitting(false);
    }
  }, [submitting, targetType, targetId, onReact]);

  return (
    <div className="flex items-center gap-1 md:gap-1.5 flex-wrap">
      {REACTIONS.map(r => {
        const count = reactions[r.key];
        const isSelected = userReaction === r.key;

        return (
          <motion.button
            key={r.key}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleReact(r.key)}
            disabled={submitting}
            className={`inline-flex items-center gap-1 px-2.5 py-2 md:px-2 md:py-1 rounded-full text-xs transition-all min-h-[44px] md:min-h-0 ${
              isSelected
                ? 'ring-1 ring-white/30 bg-white/10'
                : 'bg-white/5 hover:bg-white/10'
            }`}
            title={r.label}
          >
            <span className="text-base md:text-sm">{r.emoji}</span>
            {count > 0 && (
              <span className="text-xs md:text-[11px] tabular-nums" style={{ color: r.color }}>
                {count}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
