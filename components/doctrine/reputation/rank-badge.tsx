import { getRank } from '@/lib/doctrine/reputation';

interface RankBadgeProps {
  xp: number;
  size?: 'sm' | 'md' | 'lg';
}

export function RankBadge({ xp, size = 'md' }: RankBadgeProps) {
  const rank = getRank(xp);
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded font-medium ${sizeClasses[size]}`}
      style={{ background: 'var(--doctrine-accent, #F97316)15', color: 'var(--doctrine-accent, #F97316)' }}>
      <span>{rank.badge}</span>
      <span>{rank.name}</span>
    </span>
  );
}
