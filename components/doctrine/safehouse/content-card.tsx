import type { ReactionCount } from '@/lib/doctrine/types';
import { ReactionBar } from '../reaction-bar';
import { DivisivenessBadge } from '../divisiveness-badge';
import { TIERS } from '@/lib/doctrine/constants';

interface ContentCardProps {
  id: string;
  type: string;
  title: string;
  body: string;
  minTier: string;
  publishedAt: string | null;
  reactions: ReactionCount;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  DEV_LOG: { label: 'Dev Log', color: '#3B82F6' },
  BUILD: { label: 'Build', color: '#22C55E' },
  POSTMORTEM: { label: 'Postmortem', color: '#EF4444' },
  DECISION: { label: 'Decision', color: '#A855F7' },
  RAW_FOOTAGE: { label: 'Raw Footage', color: '#F59E0B' },
  FINANCIAL: { label: 'Financial', color: '#14B8A6' },
  VOTE: { label: 'Vote', color: '#F97316' },
};

export function ContentCard({ id, type, title, body, minTier, publishedAt, reactions }: ContentCardProps) {
  const typeInfo = TYPE_LABELS[type] ?? { label: type, color: '#6B7280' };
  const tier = TIERS[minTier as keyof typeof TIERS];

  return (
    <article
      className="rounded-lg p-4 space-y-3 transition-colors hover:bg-white/[0.02]"
      style={{ background: 'var(--doctrine-bg-secondary, #141416)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-xs md:text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded"
          style={{ color: typeInfo.color, backgroundColor: `${typeInfo.color}15` }}
        >
          {typeInfo.label}
        </span>
        {minTier !== 'PUBLIC' && (
          <span
            className="text-xs md:text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{ color: tier?.color ?? '#6B7280', backgroundColor: `${tier?.color ?? '#6B7280'}15` }}
          >
            {tier?.name ?? minTier}
          </span>
        )}
        <DivisivenessBadge reactions={reactions} />
        {publishedAt && (
          <span className="ml-auto text-xs md:text-[10px] text-white/30">
            {new Date(publishedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Content */}
      <h3 className="text-base font-semibold text-white/90">{title}</h3>
      <p className="text-sm text-white/50 line-clamp-3">{body}</p>

      {/* Reactions */}
      <ReactionBar reactions={reactions} targetType="safehouse" targetId={id} />
    </article>
  );
}
