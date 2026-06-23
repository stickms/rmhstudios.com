import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IncidentCard } from '@/components/doctrine/incidents/incident-card';
import { aggregateReactions } from '@/lib/doctrine/divisiveness';
import { EMPTY_REACTIONS } from '@/lib/doctrine/types';

export const Route = createFileRoute('/strategies/incidents')({
  component: IncidentsPage,
});

function IncidentsPage() {
  const { t } = useTranslation("r-strategies");
  const { data, isLoading } = useQuery({
    queryKey: ['doctrine', 'incidents'],
    queryFn: async () => {
      const res = await fetch('/api/doctrine/incidents?limit=20');
      return res.json();
    },
    staleTime: 15_000,
  });

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

      <div className="space-y-3">
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
        <div className="text-center py-16">
          <AlertTriangle size={32} className="mx-auto mb-3 opacity-10" />
          <p className="text-sm text-white/30">{t("all-systems-nominal", { defaultValue: "All systems nominal. For now." })}</p>
        </div>
      )}
    </div>
  );
}
