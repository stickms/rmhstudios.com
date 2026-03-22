import { type ReactNode } from 'react';
import { Clock, Users, Zap } from 'lucide-react';
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
}

const MODE_COLORS: Record<string, string> = {
  alibi: '#EF4444',
  spectrum: '#8B5CF6',
  outcast: '#22C55E',
  chainlink: '#3B82F6',
  impostor: '#F59E0B',
};

export function PuzzleShell({ mode, difficulty, resetsAt, children, attempts = 0, phase }: PuzzleShellProps) {
  const sahurActive = useDoctrineStore(s => s.sahurActive);
  const color = MODE_COLORS[mode] ?? 'var(--doctrine-accent, #F97316)';

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--doctrine-bg-primary, #0A0A0B)' }}>
      {/* Minimal top bar — Tung Tung Tung: no chrome */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-bold uppercase" style={{ color }}>
            {mode}
          </span>
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

        <div className="flex items-center gap-4">
          {sahurActive && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 animate-pulse">
              <Zap size={12} /> 3x XP
            </span>
          )}
          {attempts > 0 && (
            <span className="text-[10px] text-white/30 font-mono">
              {attempts} attempt{attempts !== 1 ? 's' : ''}
            </span>
          )}
          <CountdownTimer target={resetsAt} label="Resets in" />
        </div>
      </div>

      {/* Puzzle content — edge-to-edge, no padding */}
      <div className="flex-1 flex items-center justify-center">
        {children}
      </div>

      {/* Phase indicator */}
      {phase === 'complete' && (
        <div className="p-4 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm text-green-400 font-medium">Puzzle Complete</p>
        </div>
      )}
    </div>
  );
}
