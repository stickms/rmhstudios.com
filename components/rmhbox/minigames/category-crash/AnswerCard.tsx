/**
 * AnswerCard — Color-coded answer tile for Category Crash results.
 *
 * Renders a single answer with visual distinction for:
 *   - unique   → green highlight + ★ badge
 *   - shared   → neutral (some points, but not unique bonus)
 *   - crashed  → red strike-through + 💥 badge
 *   - invalid  → amber strike-through (wrong letter, etc.)
 *   - empty    → dim italic placeholder
 *
 * Props:
 *   answer: string | null
 *   category: string
 *   points: number
 *   status: 'unique' | 'shared' | 'crashed' | 'invalid' | 'empty'
 */
'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { Star, Flame, AlertTriangle } from 'lucide-react';

type AnswerStatus = 'unique' | 'shared' | 'crashed' | 'invalid' | 'empty';

interface AnswerCardProps {
  answer: string | null;
  category: string;
  points: number;
  status: AnswerStatus;
}

const statusStyles: Record<AnswerStatus, { bg: string; text: string; border: string; badge?: ReactNode }> = {
  unique: {
    bg: 'bg-(--rmhbox-success-dim)',
    text: 'text-(--rmhbox-success)',
    border: 'border-(--rmhbox-success)/30',
    badge: <Star className="h-3 w-3 fill-current text-(--rmhbox-success)" />,
  },
  shared: {
    bg: 'bg-(--rmhbox-surface)',
    text: 'text-(--rmhbox-text)',
    border: 'border-(--rmhbox-border)',
  },
  crashed: {
    bg: 'bg-(--rmhbox-danger-dim)',
    text: 'text-(--rmhbox-danger) line-through',
    border: 'border-(--rmhbox-danger)/30',
    badge: <Flame className="h-3 w-3 text-(--rmhbox-danger)" />,
  },
  invalid: {
    bg: 'bg-(--rmhbox-warning-dim)',
    text: 'text-(--rmhbox-warning) line-through',
    border: 'border-(--rmhbox-warning)/30',
    badge: <AlertTriangle className="h-3 w-3 text-(--rmhbox-warning)" />,
  },
  empty: {
    bg: 'bg-(--rmhbox-surface)/50',
    text: 'text-(--rmhbox-text-muted)/50 italic',
    border: 'border-(--rmhbox-border)/30',
  },
};

export default function AnswerCard({ answer, category, points, status }: AnswerCardProps) {
  const { t } = useTranslation("c-rmhbox");
  const style = statusStyles[status];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex flex-col gap-1 rounded-lg border p-2 ${style.bg} ${style.border}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-(--rmhbox-text-muted)">
          {category}
        </span>
        {style.badge && <span className="text-xs">{style.badge}</span>}
      </div>
      <span className={`text-sm font-medium ${style.text}`}>
        {answer || '—'}
      </span>
      <span
        className={`text-[10px] font-semibold ${
          points > 0 ? 'text-(--rmhbox-success)' : points < 0 ? 'text-(--rmhbox-danger)' : 'text-(--rmhbox-text-muted)'
        }`}
      >
        {points > 0 ? `+${points}` : points === 0 ? '0' : points} {t("pts", { defaultValue: "pts" })}
      </span>
    </motion.div>
  );
}
