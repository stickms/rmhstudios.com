import { motion } from 'framer-motion';
import { Share2, Trophy, Clock, Target } from 'lucide-react';
import { RankBadge } from '../reputation/rank-badge';

interface ResultCardProps {
  mode: string;
  correct: boolean;
  score: number;
  timeMs: number;
  attempts: number;
  difficulty: number;
  userXp?: number;
  date?: string;
}

const MODE_COLORS: Record<string, string> = {
  alibi: '#EF4444',
  spectrum: '#8B5CF6',
  outcast: '#22C55E',
  chainlink: '#3B82F6',
  impostor: '#F59E0B',
};

export function ResultCard({ mode, correct, score, timeMs, attempts, difficulty, userXp = 0, date }: ResultCardProps) {
  const color = MODE_COLORS[mode] ?? '#F97316';
  const timeStr = (timeMs / 1000).toFixed(1);

  const handleShare = async () => {
    const text = `RMH Strategies — ${mode.toUpperCase()}\n${correct ? '✅' : '❌'} Score: ${score} | Time: ${timeStr}s | Difficulty: ${'★'.repeat(difficulty)}\n${date ?? ''}\nrmhstudios.com/strategies/puzzles`;

    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // Silent fail
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm mx-auto p-6 rounded-xl space-y-4"
      style={{
        background: `linear-gradient(135deg, ${color}10, var(--doctrine-bg-secondary, #141416))`,
        border: `1px solid ${color}30`,
      }}
    >
      {/* Mode + Result */}
      <div className="text-center">
        <p className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color }}>
          {mode}
        </p>
        <p className="text-3xl font-black text-white">
          {correct ? score : 'FAILED'}
        </p>
        {correct && (
          <p className="text-xs text-white/40 mt-1">points</p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <Clock size={14} className="mx-auto text-white/30 mb-1" />
          <p className="text-sm font-mono text-white/80">{timeStr}s</p>
          <p className="text-[10px] text-white/30">time</p>
        </div>
        <div className="text-center">
          <Target size={14} className="mx-auto text-white/30 mb-1" />
          <p className="text-sm font-mono text-white/80">{attempts}</p>
          <p className="text-[10px] text-white/30">attempts</p>
        </div>
        <div className="text-center">
          <Trophy size={14} className="mx-auto text-white/30 mb-1" />
          <div className="flex justify-center">
            {'★'.repeat(difficulty).split('').map((_, i) => (
              <span key={i} className="text-xs" style={{ color }}>★</span>
            ))}
          </div>
          <p className="text-[10px] text-white/30">difficulty</p>
        </div>
      </div>

      {/* XP + Rank */}
      {userXp > 0 && (
        <div className="flex items-center justify-center">
          <RankBadge xp={userXp} size="sm" />
        </div>
      )}

      {/* Share Button */}
      <button
        onClick={handleShare}
        className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all hover:brightness-110"
        style={{ background: color, color: '#000' }}
      >
        <Share2 size={14} />
        Share Result
      </button>

      <p className="text-center text-[9px] text-white/20 font-mono">
        RMH STRATEGIES — DOCTRINE ENGINE
      </p>
    </motion.div>
  );
}
