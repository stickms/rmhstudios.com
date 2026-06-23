import { Flame } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from "react-i18next";

interface StreakDisplayProps {
  streak: number;
  longestStreak: number;
}

export function StreakDisplay({ streak, longestStreak }: StreakDisplayProps) {
  const { t } = useTranslation("c-doctrine");
  const isHot = streak >= 7;
  const isOnFire = streak >= 14;

  return (
    <div className="flex items-center gap-3">
      <motion.div
        animate={isOnFire ? { rotate: [0, -5, 5, 0] } : {}}
        transition={{ repeat: Infinity, duration: 0.5 }}
        className="flex items-center gap-1.5"
      >
        <Flame
          size={20}
          style={{
            color: isOnFire ? '#EF4444' : isHot ? '#F97316' : streak > 0 ? '#F59E0B' : '#52525B',
          }}
          fill={streak > 0 ? 'currentColor' : 'none'}
        />
        <span className="text-lg font-bold tabular-nums" style={{ color: streak > 0 ? '#F5F5F5' : '#52525B' }}>
          {streak}
        </span>
      </motion.div>
      <div className="text-[10px] text-white/30 leading-tight">
        <p>{t("day-streak", { defaultValue: "day streak" })}</p>
        <p>{t("best-streak", { defaultValue: "best: {{longestStreak}}", longestStreak })}</p>
      </div>
    </div>
  );
}
