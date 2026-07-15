import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDoctrineStore } from '@/stores/doctrineStore';
import { calculateDivisiveness } from '@/lib/doctrine/divisiveness';
import { EMPTY_REACTIONS, type ReactionCount } from '@/lib/doctrine/types';
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
import { ContentCard, type CanvasContent } from '@/components/doctrine/canvas/ContentCard';

export const Route = createFileRoute('/strategies/safehouse/')({
  component: SafehouseFeed,
});

function diColorFor(di: number): string {
  if (di >= DI_BOOST_THRESHOLD) return '#F97316';
  if (di >= 50) return '#EAB308';
  if (di >= DI_SUPPRESS_THRESHOLD) return '#A1A1AA';
  return '#52525B';
}

interface SafehouseSceneProps extends Record<string, unknown> {
  title: string; subtitle: string; loading: boolean;
  emptyTitle: string; emptyHint: string; items: CanvasContent[];
}

function SafehouseScene({ title, subtitle, loading, emptyTitle, emptyHint, items }: SafehouseSceneProps) {
  return (
    <DoctrineShell>
      <ScrollView style={tw('flex flex-col flex-1 w-full overflow-hidden')} contentStyle={tw('flex flex-col w-full items-center')}>
        <Box style={tw('flex flex-col w-full max-w-[768px] px-4 py-6 gap-6')}>
          <Box style={tw('flex flex-row items-center gap-2')}>
            <Icon node={icons.shield} size={20} color={DOCTRINE.accent} />
            <CanvasText style={`text-xl font-bold text-[${DOCTRINE.text}]`}>{title}</CanvasText>
          </Box>
          <CanvasText style="text-sm text-[#52525B]">{subtitle}</CanvasText>
          {loading ? (
            <Box style={tw('flex flex-col w-full gap-4')}>{[0, 1, 2].map((i) => <Skeleton key={i} style={tw('w-full h-32')} />)}</Box>
          ) : items.length === 0 ? (
            <Box style={tw('flex flex-col items-center w-full py-16 gap-1')}>
              <CanvasText style="text-sm text-[rgba(255,255,255,0.4)]">{emptyTitle}</CanvasText>
              <CanvasText style="text-xs text-[rgba(255,255,255,0.2)]">{emptyHint}</CanvasText>
            </Box>
          ) : (
            <Box style={tw('flex flex-col w-full gap-3')}>{items.map((it) => <ContentCard key={it.id} item={it} />)}</Box>
          )}
        </Box>
      </ScrollView>
    </DoctrineShell>
  );
}

function SafehouseMirror({ title, subtitle, items }: SafehouseSceneProps) {
  return (
    <div>
      <h1>{title}</h1><p>{subtitle}</p>
      {items.map((it) => <article key={it.id}><h3>{it.title}</h3><p>{it.body}</p></article>)}
    </div>
  );
}

interface RawItem { id: string; type: string; title: string; body: string; minTier: string; publishedAt: string | null; reactions?: ReactionCount }

function SafehouseFeed() {
  const { t } = useTranslation("r-strategies");
  const setDoctrineTheme = useDoctrineStore(s => s.setDoctrineTheme);
  useEffect(() => {
    setDoctrineTheme('safehouse');
    return () => setDoctrineTheme('default');
  }, [setDoctrineTheme]);

  const { data, isLoading } = useQuery({
    queryKey: ['doctrine', 'safehouse', 'content'],
    queryFn: async () => {
      const res = await fetch('/api/doctrine/safehouse/content');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    staleTime: 60_000,
  });

  const sceneProps: SafehouseSceneProps = useMemo(() => {
    const list: RawItem[] = data?.items && Array.isArray(data.items) ? data.items : [];
    const items: CanvasContent[] = list.map((it) => {
      const reactions = it.reactions ?? EMPTY_REACTIONS;
      const di = calculateDivisiveness(reactions);
      return { id: it.id, type: it.type, title: it.title, body: it.body, minTier: it.minTier, dateLabel: it.publishedAt ? new Date(it.publishedAt).toLocaleDateString() : '', di, diColor: diColorFor(di), reactions };
    });
    return {
      title: t("safehouse-title", { defaultValue: "The Safehouse" }),
      subtitle: t("safehouse-subtitle", { defaultValue: "Classified intelligence. Raw development. Unfiltered process." }),
      loading: isLoading,
      emptyTitle: t("no-intelligence", { defaultValue: "No intelligence available at your clearance level." }),
      emptyHint: t("upgrade-tier", { defaultValue: "Upgrade your tier to access classified content." }),
      items,
    };
  }, [t, data, isLoading]);

  return (
    <CanvasPage
      routeId="/strategies/safehouse/"
      scene={SafehouseScene}
      sceneProps={sceneProps}
      mirror={<SafehouseMirror {...sceneProps} />}
      shell="fullscreen"
      title={sceneProps.title}
    />
  );
}
