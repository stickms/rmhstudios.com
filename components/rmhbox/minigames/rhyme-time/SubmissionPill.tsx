/**
 * SubmissionPill — Compact pill displaying a submitted rhyme word.
 *
 * Four visual states based on validation status:
 *   - pending       (gray)    — word submitted, awaiting scoring
 *   - valid         (green)   — accepted rhyme
 *   - invalid       (red + strikethrough) — known word that doesn't rhyme
 *   - not_in_dict   (gray, dimmed) — word not found in dictionary (no penalty)
 *
 * Props:
 *   word: string — The submitted word
 *   status: 'pending' | 'valid' | 'invalid' | 'not_in_dict' — Current validation state
 *   invalidReason?: string — Reason shown on hover when invalid
 */
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

export interface SubmissionPillProps {
  word: string;
  status: 'pending' | 'valid' | 'invalid' | 'not_in_dict';
  invalidReason?: string;
}

const STATUS_STYLES: Record<SubmissionPillProps['status'], string> = {
  pending:      'bg-(--rmhbox-text-muted)/20 text-(--rmhbox-text-muted) border-(--rmhbox-text-muted)/40',
  valid:        'bg-(--rmhbox-success)/20 text-(--rmhbox-success) border-(--rmhbox-success)/40',
  invalid:      'bg-(--rmhbox-danger)/20 text-(--rmhbox-danger) border-(--rmhbox-danger)/40 line-through',
  not_in_dict:  'bg-(--rmhbox-text-dim)/10 text-(--rmhbox-text-dim) border-(--rmhbox-text-dim)/30',
};

export default function SubmissionPill({ word, status, invalidReason }: SubmissionPillProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <motion.span
      layout
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className={`relative inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium my-0.5 ${STATUS_STYLES[status]}`}
      onMouseEnter={() => (status === 'invalid' || status === 'not_in_dict') && setShowTooltip(true)}
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
