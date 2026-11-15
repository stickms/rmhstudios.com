import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IncidentCard } from '@features/doctrine/ui/incidents/incident-card';
import { aggregateReactions } from '@features/doctrine/engine/divisiveness';
import { EMPTY_REACTIONS } from '@features/doctrine/engine/types';
import { api } from '@/lib/contract/client';
import { listDoctrineIncidentsApi } from '@features/doctrine/engine/doctrine.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/strategies/incidents')({
  head: () => ({
    meta: buildMeta({ title: 'Incidents | RMH Strategies | RMH Studios', description: 'Live incident reports and community notices for RMH Strategies.', path: '/strategies/incidents' }),
    links: [buildCanonical('/strategies/incidents')],
  }),
  component: IncidentsPage,
});

function IncidentsPage() {
  const { t } = useTranslation("r-strategies");
  const { data, isLoading } = useQuery({
    queryKey: ['doctrine', 'incidents'],
    queryFn: () => api(listDoctrineIncidentsApi, { query: { limit: '20' }, retries: 0 }),
    staleTime: 15_000,
  });
  const arrival = useArrival(!isLoading);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center gap-2">
        <AlertTriangle size={20} style={{ color: 'var(--doctrine-error)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          {t("incident-feed", { defaultValue: "Incident Feed" })}
        </h1>
      </div>
      <p className="text-sm" style={{ color: 'var(--doctrine-text-muted)' }}>
        {t("hall-of-incidents-desc", { defaultValue: "Every failure is content. Every outage is an event. This is the Hall of Incidents." })}
      </p>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-lg animate-pulse" style={{ background: 'var(--doctrine-bg-secondary)' }} />
          ))}
        </div>
      )}

      <div className={cn('space-y-3', arrival)}>
        {data?.map?.((incident: { id: string; codename: string; severity: string; title: string; narrative: string; status: string; createdAt: string; reactions: Array<{ reaction: string }>; _count: { reports: number } }) => {
          const reactions = incident.reactions ? aggregateReactions(incident.reactions) : EMPTY_REACTIONS;
          return (
            <IncidentCard
              key={incident.id}
              id={incident.id}
              codename={incident.codename}
              severity={incident.severity}
              title={incident.title}
              narrative={incident.narrative}
              status={incident.status}
              reportCount={incident._count?.reports ?? 0}
              createdAt={incident.createdAt}
              reactions={reactions}
            />
          );
        })}
      </div>

      {data?.length === 0 && (
        <div className={cn('text-center py-16', arrival)}>
          <AlertTriangle size={32} className="mx-auto mb-3 opacity-10" />
          <p className="text-sm text-white/50">{t("all-systems-nominal", { defaultValue: "All systems nominal. For now." })}</p>
        </div>
      )}
    </div>
  );
}
