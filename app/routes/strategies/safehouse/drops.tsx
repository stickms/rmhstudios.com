import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DivisivenessBadge } from '@/components/doctrine/divisiveness-badge';
import { ReactionBar } from '@/components/doctrine/reaction-bar';
import { EMPTY_REACTIONS } from '@/lib/doctrine/types';

export const Route = createFileRoute('/strategies/safehouse/drops')({
  component: DropsPage,
});

function DropsPage() {
  const { t } = useTranslation("r-strategies");
  const { data, isLoading } = useQuery({
    queryKey: ['doctrine', 'disclosures'],
    queryFn: async () => {
      const res = await fetch('/api/doctrine/safehouse/disclosures');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 60_000,
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          {t("controlled-disclosures", { defaultValue: "Controlled Disclosures" })}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--doctrine-text-muted)' }}>
          {t("features-not-released", { defaultValue: "Features are not released. They are disclosed." })}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--doctrine-bg-secondary)' }} />
          ))}
        </div>
      )}

      <div className="space-y-3">
        {data?.map((d: { id: string; codename: string; publicTitle: string; content: string | null; narrative: string | null; status: string; disclosedAt: string | null; reactions: { fire: number; based: number; mid: number; cringe: number; trash: number; tung: number } }) => (
          <article
            key={d.id}
            className="rounded-lg p-4 space-y-2"
            style={{
              background: 'var(--doctrine-bg-secondary)',
              border: d.status === 'CLASSIFIED' ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(255,255,255,0.06)',
              opacity: d.status === 'CLASSIFIED' ? 0.5 : 1,
            }}
          >
            <div className="flex items-center gap-2">
              {d.status === 'CLASSIFIED' && <Lock size={12} className="text-white/20" />}
              {d.status === 'TEASED' && <EyeOff size={12} className="text-amber-400/60" />}
              {d.status === 'DISCLOSED' && <Eye size={12} className="text-green-400/60" />}
              <span className="text-[10px] font-mono uppercase" style={{ color: d.status === 'CLASSIFIED' ? '#52525B' : d.status === 'TEASED' ? '#F59E0B' : '#22C55E' }}>
                {d.status}
              </span>
              <span className="text-xs font-mono text-white/30">{d.codename}</span>
              <DivisivenessBadge reactions={d.reactions ?? EMPTY_REACTIONS} />
            </div>

            <h3 className={`text-sm font-semibold ${d.status === 'CLASSIFIED' ? 'text-white/20 blur-sm select-none' : 'text-white/90'}`}>
              {d.publicTitle}
            </h3>

            {d.narrative && (
              <p className="text-xs text-white/40 line-clamp-2">{d.narrative}</p>
            )}

            {d.status === 'DISCLOSED' && d.reactions && (
              <ReactionBar reactions={d.reactions} targetType="disclosure" targetId={d.id} />
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
