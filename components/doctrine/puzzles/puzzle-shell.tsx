import { type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Zap, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CountdownTimer } from '../countdown-timer';
import { useDoctrineStore } from '@/stores/doctrineStore';

interface PuzzleShellProps {
  mode: string;
  difficulty: number;
  resetsAt: Date;
  children: ReactNode;
  onSubmit?: () => void;
  attempts?: number;
  phase?: string;
  isReplay?: boolean;
}

const MODE_COLORS: Record<string, string> = {
  alibi: '#EF4444',
  spectrum: '#8B5CF6',
  outcast: '#22C55E',
  chainlink: '#3B82F6',
  impostor: '#F59E0B',
};

export function PuzzleShell({ mode, difficulty, resetsAt, children, attempts = 0, phase, isReplay = false }: PuzzleShellProps) {
  const { t } = useTranslation("c-doctrine");
  const sahurActive = useDoctrineStore(s => s.sahurActive);
  const color = MODE_COLORS[mode] ?? 'var(--doctrine-accent, #F97316)';

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--doctrine-bg-primary, #0A0A0B)' }}>
      {/* Minimal top bar */}
      <div className="flex items-center justify-between px-3 md:px-4 py-1 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2 md:gap-3">
          <Link to="/strategies/puzzles" aria-label={t("back-to-puzzles", { defaultValue: "Back to Puzzles" })} className="text-white/50 hover:text-white/80 transition-colors size-11 -ml-2 flex items-center justify-center">
            <ArrowLeft size={16} aria-hidden />
          </Link>
          <span className="text-sm md:text-xs font-mono font-bold uppercase" style={{ color }}>
            {mode}
          </span>
          {isReplay && (
            <span className="flex items-center gap-1 text-xs font-mono text-white/50 bg-white/5 px-1.5 py-0.5 rounded">
              <RotateCcw size={10} /> {t("replay", { defaultValue: "REPLAY" })}
            </span>
          )}
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: i < difficulty ? color : 'rgba(255,255,255,0.1)' }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {sahurActive && (
            <span className="flex items-center gap-1 text-xs font-bold text-amber-400 animate-pulse">
              <Zap size={12} /> {t("sahur-xp-bonus", { defaultValue: "3x XP" })}
            </span>
          )}
          {attempts > 0 && (
            <span className="text-xs text-white/50 font-mono">
              {t("attempt-count", { count: attempts, defaultValue: "{{count}} attempt" })}
            </span>
          )}
          <CountdownTimer target={resetsAt} label={t("resets-in", { defaultValue: "Resets in" })} />
        </div>
      </div>

      {/* Puzzle content — edge-to-edge, no padding */}
      <div className="flex-1 flex items-center justify-center">
        {children}
      </div>

      {/* Phase indicator */}
      {phase === 'complete' && (
        <div className="p-4 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm text-green-400 font-medium">{t("puzzle-complete", { defaultValue: "Puzzle Complete" })}</p>
        </div>
      )}
    </div>
  );
}
