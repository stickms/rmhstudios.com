/**
 * SubmissionPill — Compact pill displaying a submitted rhyme word.
 *
 * Three visual states based on validation status:
 *   - pending (gray)  — word submitted, awaiting scoring
 *   - valid   (green) — accepted rhyme
 *   - invalid (red + strikethrough) — rejected; tooltip shows reason
 *
 * Props:
 *   word: string — The submitted word
 *   status: 'pending' | 'valid' | 'invalid' — Current validation state
 *   invalidReason?: string — Reason shown on hover when invalid
 */
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

export interface SubmissionPillProps {
  word: string;
  status: 'pending' | 'valid' | 'invalid';
  invalidReason?: string;
}

const STATUS_STYLES: Record<SubmissionPillProps['status'], string> = {
  pending: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
  valid:   'bg-green-500/20 text-green-300 border-green-500/40',
  invalid: 'bg-red-500/20 text-red-400 border-red-500/40 line-through',
};

export default function SubmissionPill({ word, status, invalidReason }: SubmissionPillProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <motion.span
      layout
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className={`relative inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
      onMouseEnter={() => status === 'invalid' && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {word}

      {/* Tooltip for invalid words */}
      {showTooltip && invalidReason && (
        <span className="absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-(--rmhbox-surface) px-2 py-1 text-[10px] text-(--rmhbox-text-muted) shadow-lg border border-(--rmhbox-border)">
          {invalidReason}
        </span>
      )}
    </motion.span>
  );
}
