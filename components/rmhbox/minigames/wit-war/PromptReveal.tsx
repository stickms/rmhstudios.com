/**
 * PromptReveal — Animated display of the player's assigned prompts.
 *
 * Shows the round number and the prompts the player will answer,
 * with a staggered entrance animation.
 */
'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PromptAssignment } from './WitWarGame';

interface PromptRevealProps {
  prompts: PromptAssignment[];
  round: number;
  totalRounds: number;
}

export default function PromptReveal({ prompts, round, totalRounds }: PromptRevealProps) {
  const { t } = useTranslation("c-rmhbox");
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-2 text-lg font-semibold text-(--rmhbox-text-muted)"
      >
        <Sparkles className="h-5 w-5" />
        <span>{t("round-of", { defaultValue: "Round {{round}} of {{totalRounds}}", round, totalRounds })}</span>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="text-2xl font-bold text-(--rmhbox-text)"
      >
        {t("your-prompts", { defaultValue: "Your Prompts" })}
      </motion.h2>

      <div className="flex flex-col gap-4 w-full">
        {prompts.map((prompt, idx) => (
          <motion.div
            key={prompt.promptIndex}
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + idx * 0.3, duration: 0.4 }}
            className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-5"
          >
            <div className="text-xs font-medium text-(--rmhbox-text-muted) mb-2">
              {t("prompt-number", { defaultValue: "Prompt {{number}}", number: idx + 1 })}
            </div>
            <div className="text-lg font-medium text-(--rmhbox-text)">
              {prompt.promptText}
            </div>
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.4 }}
        className="text-sm text-(--rmhbox-text-muted) text-center"
      >
        {t("get-ready-to-write", { defaultValue: "Get ready to write your answers..." })}
      </motion.p>
    </div>
  );
}
