import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useDoctrineReputationLeaderboard } from '@/hooks/useDoctrineReputation';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { ScrollView } from '@/canvas-ui/widgets/ScrollView';
import { Icon } from '@/canvas-ui/widgets/Icon';
import { icons } from '@/canvas-ui/widgets/icons';
import { DoctrineShell, DOCTRINE } from '@/components/doctrine/canvas/DoctrineShell';

export const Route = createFileRoute('/strategies/profile/reputation')({
  component: ReputationPage,
});

interface Entry {
  rank: number;
  user: { name?: string; handle?: string };
  totalXp: number;
  currentStreak: number;
  level?: { name?: string; badge?: string };
}

interface RepSceneProps extends Record<string, unknown> {
  title: string;
  loading: boolean;
  loadingText: string;
  cols: { num: string; agent: string; rank: string; xp: string; streak: string };
  anon: string;
  entries: Entry[];
}

function Cell({ children, flex, align = 'left', color, mono }: { children: string; flex: number; align?: 'left' | 'right'; color?: string; mono?: boolean }) {
  return (
    <Box style={{ ...tw(`flex flex-row px-4 py-2 ${align === 'right' ? 'justify-end' : ''}`), layout: { ...tw('flex flex-row').layout, flexGrow: flex, flexShrink: 1, flexBasis: 0 } }}>
      <CanvasText style={`text-sm ${mono ? 'font-mono' : ''} text-[${color ?? 'rgba(255,255,255,0.8)'}]`}>{children}</CanvasText>
    </Box>
  );
}

function ReputationScene({ title, loading, loadingText, cols, anon, entries }: RepSceneProps) {
  return (
    <DoctrineShell>
      <ScrollView style={tw('flex flex-col flex-1 w-full overflow-hidden')} contentStyle={tw('flex flex-col w-full items-center')}>
        <Box style={tw('flex flex-col w-full max-w-[768px] px-4 py-6 gap-6')}>
          <Box style={tw('flex flex-row items-center gap-2')}>
            <Icon node={icons.trophy} size={20} color={DOCTRINE.accent} />
            <CanvasText style={`text-xl font-bold text-[${DOCTRINE.text}]`}>{title}</CanvasText>
          </Box>

          <Box style={tw('flex flex-col w-full rounded-site border border-[rgba(255,255,255,0.06)] overflow-hidden')}>
            {loading ? (
              <Box style={tw('flex flex-col items-center w-full p-8')}>
                <CanvasText style="text-sm text-[rgba(255,255,255,0.3)]">{loadingText}</CanvasText>
              </Box>
            ) : (
              <Box style={tw('flex flex-col w-full')}>
                {/* Header row */}
                <Box style={tw('flex flex-row w-full bg-[#141416]')}>
                  <Cell flex={1} color="rgba(255,255,255,0.3)" mono>{cols.num}</Cell>
                  <Cell flex={4} color="rgba(255,255,255,0.3)" mono>{cols.agent}</Cell>
                  <Cell flex={3} color="rgba(255,255,255,0.3)" mono>{cols.rank}</Cell>
                  <Cell flex={2} align="right" color="rgba(255,255,255,0.3)" mono>{cols.xp}</Cell>
                  <Cell flex={2} align="right" color="rgba(255,255,255,0.3)" mono>{cols.streak}</Cell>
                </Box>
                {entries.map((e, i) => (
                  <Box key={i} style={tw('flex flex-row w-full border-t border-[rgba(255,255,255,0.04)]')}>
                    <Cell flex={1} color="rgba(255,255,255,0.4)" mono>{String(e.rank)}</Cell>
                    <Cell flex={4}>{e.user?.name ?? e.user?.handle ?? anon}</Cell>
                    <Cell flex={3}>{`${e.level?.badge ?? ''} ${e.level?.name ?? ''}`.trim()}</Cell>
                    <Cell flex={2} align="right" color={DOCTRINE.accent} mono>{e.totalXp.toLocaleString()}</Cell>
                    <Cell flex={2} align="right" color="rgba(255,255,255,0.4)" mono>{`${e.currentStreak}d`}</Cell>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </ScrollView>
    </DoctrineShell>
  );
}

function ReputationMirror({ title, entries, anon }: RepSceneProps) {
  return (
    <div>
      <h1>{title}</h1>
      <ol>
        {entries.map((e, i) => (
          <li key={i}>{e.rank}. {e.user?.name ?? e.user?.handle ?? anon} — {e.totalXp.toLocaleString()} XP, {e.currentStreak}d streak</li>
        ))}
      </ol>
    </div>
  );
}

function ReputationPage() {
  const { t } = useTranslation("r-strategies");
  const { data, isLoading } = useDoctrineReputationLeaderboard(50);
  const sceneProps: RepSceneProps = useMemo(() => ({
    title: t("reputation-leaderboard", { defaultValue: "Reputation Leaderboard" }),
    loading: isLoading,
    loadingText: t("loading", { defaultValue: "Loading..." }),
    cols: {
      num: t("col-number", { defaultValue: "#" }),
      agent: t("col-agent", { defaultValue: "Agent" }),
      rank: t("col-rank", { defaultValue: "Rank" }),
      xp: t("col-xp", { defaultValue: "XP" }),
      streak: t("col-streak", { defaultValue: "Streak" }),
    },
    anon: t("anonymous", { defaultValue: "Anonymous" }),
    entries: (Array.isArray(data) ? data : []) as Entry[],
  }), [t, isLoading, data]);

  return (
    <CanvasPage
      routeId="/strategies/profile/reputation"
      scene={ReputationScene}
      sceneProps={sceneProps}
      mirror={<ReputationMirror {...sceneProps} />}
      shell="fullscreen"
      title={sceneProps.title}
    />
  );
}
