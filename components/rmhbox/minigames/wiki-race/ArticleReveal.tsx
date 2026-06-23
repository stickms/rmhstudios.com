/**
 * ArticleReveal — Start + target article reveal animation.
 *
 * Shows the start and target Wikipedia articles with their descriptions
 * in a visually distinct, animated reveal that plays before navigation
 * begins.
 *
 * Props:
 *   startArticle: { title, description } — Start article metadata
 *   targetArticle: { title, description } — Target article metadata
 *   difficulty: string — Difficulty rating for the article pair
 *   duration: number — Reveal duration in seconds
 */
'use client';

import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ArticleInfo {
  title: string;
  description: string;
}

interface ArticleRevealProps {
  startArticle: ArticleInfo;
  targetArticle: ArticleInfo;
  difficulty: string;
  duration: number;
}

const difficultyColors: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400',
  medium: 'bg-amber-500/20 text-amber-400',
  hard: 'bg-red-500/20 text-red-400',
};

export default function ArticleReveal({
  startArticle,
  targetArticle,
  difficulty,
  duration: _duration,
}: ArticleRevealProps) {
  void _duration;
  const { t } = useTranslation("c-rmhbox");

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xl font-bold"
      >
        Wiki-Race
      </motion.h2>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
          difficultyColors[difficulty] ?? difficultyColors.medium
        }`}
      >
        {difficulty}
      </motion.div>

      <div className="flex w-full items-center justify-center gap-4">
        {/* Start article */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="flex-1 rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-(--rmhbox-text-muted)">
            <BookOpen size={12} />
            {t("wiki-race-start-label", { defaultValue: "Start" })}
          </div>
          <h3 className="text-lg font-bold text-(--rmhbox-accent)">{startArticle.title}</h3>
          <p className="mt-1 text-sm text-(--rmhbox-text-muted)">{startArticle.description}</p>
        </motion.div>

        {/* Arrow */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: 'spring' }}
        >
          <ArrowRight size={24} className="text-(--rmhbox-accent)" />
        </motion.div>

        {/* Target article */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="flex-1 rounded-xl border-2 border-(--rmhbox-accent)/50 bg-(--rmhbox-accent)/5 p-4"
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-(--rmhbox-accent)">
            <Target size={12} />
            {t("wiki-race-target-label", { defaultValue: "Target" })}
          </div>
          <h3 className="text-lg font-bold">{targetArticle.title}</h3>
          <p className="mt-1 text-sm text-(--rmhbox-text-muted)">{targetArticle.description}</p>
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="text-sm text-(--rmhbox-text-muted)"
      >
        {t("wiki-race-navigate-instruction", { defaultValue: "Navigate from Start → Target by clicking only wiki links!" })}
      </motion.p>
    </div>
  );
}
