import type { ChangelogEntry } from '@/lib/doctrine/types';
import { DivisivenessBadge } from '../divisiveness-badge';

interface ChangelogProps {
  entries: ChangelogEntry[];
}

const TYPE_ICONS: Record<string, string> = {
  disclosure: '📡',
  incident_resolved: '🔧',
  phase_transition: '🚀',
  feature_launch: '✨',
};

export function Changelog({ entries }: ChangelogProps) {
  return (
    <div className="space-y-0">
      {entries.map((entry, i) => (
        <div
          key={entry.id}
          className="relative pl-8 pb-6"
          style={{ borderLeft: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}
        >
          {/* Timeline dot */}
          <div className="absolute left-0 top-0 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-xs"
            style={{ background: 'var(--doctrine-bg-secondary, #141416)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {TYPE_ICONS[entry.type] ?? '📌'}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-white/30 uppercase">{entry.codename}</span>
              <DivisivenessBadge reactions={entry.reactions} />
              <span className="text-[10px] text-white/20 ml-auto">
                {new Date(entry.date).toLocaleDateString()}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-white/80">{entry.headline}</h4>
            <p className="text-xs text-white/40 line-clamp-2">{entry.narrative}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
