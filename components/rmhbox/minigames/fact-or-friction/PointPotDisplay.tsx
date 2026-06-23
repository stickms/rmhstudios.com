/**
 * PointPotDisplay — Animated pot value display for Fact or Friction.
 *
 * Shows the current pot value with a color gradient (green→yellow→red)
 * based on how much value remains. Pulses when at minimum.
 */
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useTranslation } from "react-i18next";

interface PointPotDisplayProps {
  potValue: number;
  maxValue: number;
}

export default function PointPotDisplay({ potValue, maxValue }: PointPotDisplayProps) {
  const { t } = useTranslation("c-rmhbox");
  const ratio = maxValue > 0 ? potValue / maxValue : 0;

  // Color gradient: green (high) → yellow (mid) → red (low)
  const color =
    ratio > 0.6
      ? 'text-green-400'
      : ratio > 0.3
        ? 'text-yellow-400'
        : 'text-red-400';

  const bgColor =
    ratio > 0.6
      ? 'bg-green-500/10'
      : ratio > 0.3
        ? 'bg-yellow-500/10'
        : 'bg-red-500/10';

  const isMinimum = ratio <= 0.15;

  return (
    <motion.div
      className={`flex items-center gap-2 rounded-lg px-4 py-2 ${bgColor}`}
      animate={isMinimum ? { scale: [1, 1.05, 1] } : undefined}
      transition={isMinimum ? { repeat: Infinity, duration: 0.8 } : undefined}
    >
      <Flame className={`h-5 w-5 ${color}`} />
      <AnimatePresence mode="popLayout">
        <motion.span
          key={potValue}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className={`text-xl font-bold tabular-nums ${color}`}
        >
          {potValue}
        </motion.span>
      </AnimatePresence>
      <span className="text-xs text-(--rmhbox-text-muted)">{t("pts", { defaultValue: "pts" })}</span>
    </motion.div>
  );
}
