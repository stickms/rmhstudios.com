import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
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
import { ReactionBar } from '@/components/doctrine/canvas/ReactionBar';

export const Route = createFileRoute('/strategies/safehouse/drops')({
  component: DropsPage,
});

function diColorFor(di: number): string {
  if (di >= DI_BOOST_THRESHOLD) return '#F97316';
  if (di >= 50) return '#EAB308';
  if (di >= DI_SUPPRESS_THRESHOLD) return '#A1A1AA';
  return '#52525B';
}

const STATUS = {
  CLASSIFIED: { color: '#52525B', icon: 'lock' as const },
  TEASED: { color: '#F59E0B', icon: 'eye-off' as const },
  DISCLOSED: { color: '#22C55E', icon: 'eye' as const },
};

interface Drop {
  id: string; codename: string; publicTitle: string; narrative: string | null;
  status: string; di: number; diColor: string; reactions: ReactionCount;
}
interface DropsSceneProps extends Record<string, unknown> {
  title: string; subtitle: string; loading: boolean; drops: Drop[];
}

function DropCard({ d }: { d: Drop }) {
  const st = STATUS[d.status as keyof typeof STATUS] ?? STATUS.CLASSIFIED;
  const classified = d.status === 'CLASSIFIED';
  return (
    <Box
      name="drop-card"
      style={tw(`flex flex-col w-full gap-2 p-4 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)]`)}
      opacity={classified ? 0.5 : 1}
    >
      <Box style={tw('flex flex-row items-center gap-2')}>
        <Icon node={icons[st.icon]} size={12} color={st.color} />
        <CanvasText style={`text-xs font-mono uppercase text-[${st.color}]`}>{d.status}</CanvasText>
        <CanvasText style="text-xs font-mono text-[rgba(255,255,255,0.3)]">{d.codename}</CanvasText>
        {d.di > 0 && (
          <Box style={tw(`flex flex-row px-1.5 py-0.5 rounded-site-sm bg-[rgba(255,255,255,0.06)]`)}>
            <CanvasText style={`text-xs font-mono text-[${d.diColor}]`}>{`${d.di} DI`}</CanvasText>
          </Box>
        )}
      </Box>
      <CanvasText style={classified ? 'text-sm font-semibold text-[rgba(255,255,255,0.2)]' : 'text-sm font-semibold text-[rgba(255,255,255,0.9)]'}>
        {classified ? '•••••••••••' : d.publicTitle}
      </CanvasText>
      {d.narrative && <CanvasText style="text-xs text-[rgba(255,255,255,0.4)]" maxLines={2}>{d.narrative}</CanvasText>}
      {d.status === 'DISCLOSED' && <ReactionBar reactions={d.reactions} targetType="disclosure" targetId={d.id} />}
    </Box>
  );
}

function DropsScene({ title, subtitle, loading, drops }: DropsSceneProps) {
  return (
    <DoctrineShell>
      <ScrollView style={tw('flex flex-col flex-1 w-full overflow-hidden')} contentStyle={tw('flex flex-col w-full items-center')}>
        <Box style={tw('flex flex-col w-full max-w-[768px] px-4 py-6 gap-6')}>
          <Box style={tw('flex flex-col gap-1')}>
            <CanvasText style={`text-xl font-bold text-[${DOCTRINE.text}]`}>{title}</CanvasText>
            <CanvasText style="text-sm text-[#52525B]">{subtitle}</CanvasText>
          </Box>
          {loading ? (
            <Box style={tw('flex flex-col w-full gap-3')}>{[0, 1, 2].map((i) => <Skeleton key={i} style={tw('w-full h-24')} />)}</Box>
          ) : (
            <Box style={tw('flex flex-col w-full gap-3')}>{drops.map((d) => <DropCard key={d.id} d={d} />)}</Box>
          )}
        </Box>
      </ScrollView>
    </DoctrineShell>
  );
}

function DropsMirror({ title, subtitle, drops }: DropsSceneProps) {
  return (
    <div>
      <h1>{title}</h1><p>{subtitle}</p>
      {drops.map((d) => (
        <article key={d.id}><h3>{d.status === 'CLASSIFIED' ? d.codename : d.publicTitle}</h3>{d.narrative && <p>{d.narrative}</p>}</article>
      ))}
    </div>
  );
}

interface RawDrop { id: string; codename: string; publicTitle: string; narrative: string | null; status: string; reactions?: ReactionCount }

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

  const sceneProps: DropsSceneProps = useMemo(() => {
    const list: RawDrop[] = Array.isArray(data) ? data : [];
    const drops: Drop[] = list.map((d) => {
      const reactions = d.reactions ?? EMPTY_REACTIONS;
      const di = calculateDivisiveness(reactions);
      return { id: d.id, codename: d.codename, publicTitle: d.publicTitle, narrative: d.narrative, status: d.status, di, diColor: diColorFor(di), reactions };
    });
    return {
      title: t("controlled-disclosures", { defaultValue: "Controlled Disclosures" }),
      subtitle: t("features-not-released", { defaultValue: "Features are not released. They are disclosed." }),
      loading: isLoading,
      drops,
    };
  }, [t, data, isLoading]);

  return (
    <CanvasPage
      routeId="/strategies/safehouse/drops"
      scene={DropsScene}
      sceneProps={sceneProps}
      mirror={<DropsMirror {...sceneProps} />}
      shell="fullscreen"
      title={sceneProps.title}
    />
  );
}
