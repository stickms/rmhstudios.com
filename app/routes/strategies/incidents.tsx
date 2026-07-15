import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { aggregateReactions, calculateDivisiveness } from '@/lib/doctrine/divisiveness';
import { EMPTY_REACTIONS } from '@/lib/doctrine/types';
import { DI_BOOST_THRESHOLD, DI_SUPPRESS_THRESHOLD } from '@/lib/doctrine/constants';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { ScrollView } from '@/canvas-ui/widgets/ScrollView';
import { Icon } from '@/canvas-ui/widgets/Icon';
import { icons } from '@/canvas-ui/widgets/icons';
import { Skeleton } from '@/canvas-ui/widgets/primitives';
import { DoctrineShell, DOCTRINE } from '@/components/doctrine/canvas/DoctrineShell';
import { IncidentCard, type CanvasIncident } from '@/components/doctrine/canvas/IncidentCard';

export const Route = createFileRoute('/strategies/incidents')({
  component: IncidentsPage,
});

function diColorFor(di: number): string {
  if (di >= DI_BOOST_THRESHOLD) return '#F97316';
  if (di >= 50) return '#EAB308';
  if (di >= DI_SUPPRESS_THRESHOLD) return '#A1A1AA';
  return '#52525B';
}

interface IncidentsSceneProps extends Record<string, unknown> {
  title: string;
  description: string;
  loading: boolean;
  emptyText: string;
  incidents: CanvasIncident[];
}

function IncidentsScene({ title, description, loading, emptyText, incidents }: IncidentsSceneProps) {
  return (
    <DoctrineShell>
      <ScrollView style={tw('flex flex-col flex-1 w-full overflow-hidden')} contentStyle={tw('flex flex-col w-full items-center')}>
        <Box style={tw('flex flex-col w-full max-w-[768px] px-4 py-6 gap-6')}>
          <Box style={tw('flex flex-row items-center gap-2')}>
            <Icon node={icons['alert-triangle']} size={20} color="#EF4444" />
            <CanvasText style={`text-xl font-bold text-[${DOCTRINE.text}]`}>{title}</CanvasText>
          </Box>
          <CanvasText style="text-sm text-[#52525B]">{description}</CanvasText>

          {loading ? (
            <Box style={tw('flex flex-col w-full gap-3')}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} style={tw('w-full h-32')} />
              ))}
            </Box>
          ) : incidents.length === 0 ? (
            <Box style={tw('flex flex-col items-center w-full py-16 gap-3')}>
              <CanvasText style="text-sm text-[rgba(255,255,255,0.3)]">{emptyText}</CanvasText>
            </Box>
          ) : (
            <Box style={tw('flex flex-col w-full gap-3')}>
              {incidents.map((inc) => (
                <IncidentCard key={inc.id} incident={inc} />
              ))}
            </Box>
          )}
        </Box>
      </ScrollView>
    </DoctrineShell>
  );
}

function IncidentsMirror({ title, description, incidents }: IncidentsSceneProps) {
  return (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {incidents.map((inc) => (
        <article key={inc.id}>
          <h3>{inc.codename} — {inc.title}</h3>
          <p>{inc.narrative}</p>
        </article>
      ))}
    </div>
  );
}

interface RawIncident {
  id: string; codename: string; severity: string; title: string; narrative: string;
  status: string; createdAt: string; reactions?: Array<{ reaction: string }>; _count?: { reports: number };
}

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

  const sceneProps: IncidentsSceneProps = useMemo(() => {
    const list: RawIncident[] = Array.isArray(data) ? data : [];
    const incidents: CanvasIncident[] = list.map((inc) => {
      const reactions = inc.reactions ? aggregateReactions(inc.reactions) : EMPTY_REACTIONS;
      const di = calculateDivisiveness(reactions);
      return {
        id: inc.id,
        codename: inc.codename,
        severity: inc.severity,
        title: inc.title,
        narrative: inc.narrative,
        status: inc.status,
        reportCount: inc._count?.reports ?? 0,
        dateLabel: new Date(inc.createdAt).toLocaleDateString(),
        di,
        diColor: diColorFor(di),
        reactions,
      };
    });
    return {
      title: t("incident-feed", { defaultValue: "Incident Feed" }),
      description: t("hall-of-incidents-desc", { defaultValue: "Every failure is content. Every outage is an event. This is the Hall of Incidents." }),
      loading: isLoading,
      emptyText: t("all-systems-nominal", { defaultValue: "All systems nominal. For now." }),
      incidents,
    };
  }, [t, data, isLoading]);

  return (
    <CanvasPage
      routeId="/strategies/incidents"
      scene={IncidentsScene}
      sceneProps={sceneProps}
      mirror={<IncidentsMirror {...sceneProps} />}
      shell="fullscreen"
      title={sceneProps.title}
    />
  );
}
