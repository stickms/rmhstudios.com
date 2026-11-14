import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DivisivenessBadge } from '@features/doctrine/ui/divisiveness-badge';
import { ReactionBar } from '@features/doctrine/ui/reaction-bar';
import { EMPTY_REACTIONS } from '@features/doctrine/engine/types';
import { api } from '@/lib/contract/client';
import { getSafehouseDisclosuresApi } from '@features/doctrine/engine/doctrine.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/strategies/safehouse/drops')({
  head: () => noindexHead('Safehouse Drops'),
  component: DropsPage,
});

function DropsPage() {
  const { t } = useTranslation("r-strategies");
  const { data, isLoading } = useQuery({
    queryKey: ['doctrine', 'disclosures'],
    queryFn: async () => {
      return api(getSafehouseDisclosuresApi);
    },
    staleTime: 60_000,
  });
  const arrival = useArrival(!isLoading);

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

      <div className={cn('space-y-3', arrival)}>
        {data?.map((d) => (
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
              <span className="text-xs font-mono uppercase" style={{ color: d.status === 'CLASSIFIED' ? '#52525B' : d.status === 'TEASED' ? '#F59E0B' : '#22C55E' }}>
                {d.status}
              </span>
              <span className="text-xs font-mono text-white/50">{d.codename}</span>
              <DivisivenessBadge reactions={d.reactions ?? EMPTY_REACTIONS} />
            </div>

            <h3 className={`text-sm font-semibold ${d.status === 'CLASSIFIED' ? 'text-white/20 blur-sm select-none' : 'text-white/90'}`}>
              {d.publicTitle}
            </h3>

            {d.narrative && (
              <p className="text-xs text-white/60 line-clamp-2">{d.narrative}</p>
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
