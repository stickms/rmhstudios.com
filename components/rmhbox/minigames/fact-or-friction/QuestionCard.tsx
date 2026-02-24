/**
 * QuestionCard — Displays the current trivia question with metadata.
 *
 * Shows question text, category badge, difficulty indicator,
 * and question progress (e.g. "Q3/8") with entrance animation.
 */
'use client';

import { motion } from 'framer-motion';

interface QuestionCardProps {
  question: string;
  category: string;
  difficulty: string;
  questionIndex: number;
  totalQuestions: number;
}

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  hard: 'bg-red-500/20 text-red-400',
};

export default function QuestionCard({
  question,
  category,
  difficulty,
  questionIndex,
  totalQuestions,
}: QuestionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, type: 'spring' }}
      className="w-full rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-bg) p-5"
    >
      {/* Header: question number + badges */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase tracking-wider">
          Q{questionIndex}/{totalQuestions}
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-(--rmhbox-surface-hover) px-2 py-0.5 text-xs text-(--rmhbox-text-muted)">
            {category}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_STYLES[difficulty] ?? DIFFICULTY_STYLES.medium}`}>
            {difficulty}
          </span>
        </div>
      </div>

      {/* Question text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="text-lg font-semibold leading-relaxed text-(--rmhbox-text)"
      >
        {question}
      </motion.p>
    </motion.div>
  );
}
