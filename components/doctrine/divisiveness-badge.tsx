import type { ReactionCount } from '@/lib/doctrine/types';
import { useDoctrineDivisiveness } from '@/hooks/useDoctrineDivisiveness';

interface DivisivenessBadgeProps {
  reactions: ReactionCount;
  showLabel?: boolean;
}

export function DivisivenessBadge({ reactions, showLabel = true }: DivisivenessBadgeProps) {
  const { di, label, color } = useDoctrineDivisiveness(reactions);

  if (di === 0) return null;

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono"
      style={{ color, backgroundColor: `${color}15` }}
    >
      <span className="font-bold">{di}</span>
      {showLabel && <span className="opacity-70">DI</span>}
    </span>
  );
}
