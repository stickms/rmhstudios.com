import { Link } from '@tanstack/react-router';
import { Clock, MessageSquare } from 'lucide-react';
import type { ReactionCount } from '@/lib/doctrine/types';
import { ReactionBar } from '../reaction-bar';
import { DivisivenessBadge } from '../divisiveness-badge';

interface IncidentCardProps {
  id: string;
  codename: string;
  severity: string;
  title: string;
  narrative: string;
  status: string;
  reportCount: number;
  createdAt: string;
  reactions: ReactionCount;
}

const SEVERITY_COLORS: Record<string, string> = {
  COSMETIC: '#6B7280',
  DEGRADED: '#F59E0B',
  CRITICAL: '#EF4444',
  CATASTROPHIC: '#DC2626',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'ACTIVE', color: '#EF4444' },
  MITIGATED: { label: 'MITIGATED', color: '#F59E0B' },
  RESOLVED: { label: 'RESOLVED', color: '#22C55E' },
  LEGENDARY: { label: 'LEGENDARY', color: '#A855F7' },
};

export function IncidentCard({ id, codename, severity, title, narrative, status, reportCount, createdAt, reactions }: IncidentCardProps) {
  const sevColor = SEVERITY_COLORS[severity] ?? '#EF4444';
  const statusInfo = STATUS_LABELS[status] ?? { label: status, color: '#6B7280' };

  return (
    <article
      className="rounded-lg p-4 space-y-3 transition-colors hover:bg-white/[0.02]"
      style={{
        background: 'var(--doctrine-bg-secondary, #141416)',
        border: status === 'ACTIVE' ? `1px solid ${sevColor}30` : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
        <span className="text-xs md:text-[10px] font-mono" style={{ color: sevColor }}>{codename}</span>
        <span
          className="text-xs md:text-[10px] font-mono uppercase px-1.5 md:px-1 py-0.5 rounded"
          style={{ color: sevColor, background: `${sevColor}15` }}
        >
          {severity}
        </span>
        <span
          className="text-xs md:text-[10px] font-mono uppercase px-1.5 md:px-1 py-0.5 rounded"
          style={{ color: statusInfo.color, background: `${statusInfo.color}15` }}
        >
          {statusInfo.label}
        </span>
        <DivisivenessBadge reactions={reactions} />
        <div className="basis-full md:basis-auto md:ml-auto flex items-center gap-2 text-white/30">
          <span className="flex items-center gap-1 text-xs md:text-[10px]">
            <MessageSquare size={10} /> {reportCount}
          </span>
          <span className="flex items-center gap-1 text-xs md:text-[10px]">
            <Clock size={10} /> {new Date(createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Content */}
      <h3 className="text-base font-semibold text-white/90">{title}</h3>
      <p className="text-sm text-white/50 line-clamp-2">{narrative}</p>

      {/* Reactions */}
      <ReactionBar reactions={reactions} targetType="incident" targetId={id} />
    </article>
  );
}
