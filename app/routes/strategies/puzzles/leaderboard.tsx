import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { ScrollView } from '@/canvas-ui/widgets/ScrollView';
import { Icon } from '@/canvas-ui/widgets/Icon';
import { icons } from '@/canvas-ui/widgets/icons';
import { useMirrorControl } from '@/canvas-ui/mirror/MirrorControls';
import { setCursor } from '@/canvas-ui/widgets/cursor';
import { DoctrineShell, DOCTRINE } from '@/components/doctrine/canvas/DoctrineShell';

export const Route = createFileRoute('/strategies/puzzles/leaderboard')({
  component: LeaderboardPage,
});

const MODES = ['ALIBI', 'SPECTRUM', 'OUTCAST', 'CHAINLINK', 'IMPOSTOR'] as const;

interface Entry { rank: number; user: { name?: string; handle?: string }; score: number; timeMs: number }
interface LbSceneProps extends Record<string, unknown> {
  title: string; loading: boolean; loadingText: string; emptyText: string;
  cols: { player: string; score: string; time: string };
  anon: string; mode: string; modes: readonly string[];
  onModeChange: (m: string) => void; entries: Entry[];
}

function ModeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  useMirrorControl({ role: 'button', label, onActivate: onPress });
  return (
    <Box
      style={tw(`flex flex-row px-3 py-1.5 rounded-site-sm ${active ? 'bg-[rgba(255,255,255,0.1)]' : ''}`)}
      onClick={onPress}
      onTap={onPress}
      onMouseEnter={(e) => setCursor(e, 'pointer')}
      onMouseLeave={(e) => setCursor(e, 'default')}
    >
      <CanvasText style={`text-xs font-mono text-[${active ? DOCTRINE.text : 'rgba(255,255,255,0.4)'}]`}>{label}</CanvasText>
    </Box>
  );
}

function Cell({ children, flex, align = 'left', color, mono }: { children: string; flex: number; align?: 'left' | 'right'; color?: string; mono?: boolean }) {
  return (
    <Box style={{ ...tw(`flex flex-row px-4 py-2 ${align === 'right' ? 'justify-end' : ''}`), layout: { ...tw('flex flex-row').layout, flexGrow: flex, flexShrink: 1, flexBasis: 0 } }}>
      <CanvasText style={`text-sm ${mono ? 'font-mono' : ''} text-[${color ?? 'rgba(255,255,255,0.8)'}]`}>{children}</CanvasText>
    </Box>
  );
}

function LeaderboardScene(p: LbSceneProps) {
  return (
    <DoctrineShell>
      <ScrollView style={tw('flex flex-col flex-1 w-full overflow-hidden')} contentStyle={tw('flex flex-col w-full items-center')}>
        <Box style={tw('flex flex-col w-full max-w-[768px] px-4 py-6 gap-6')}>
          <Box style={tw('flex flex-row items-center gap-2')}>
            <Icon node={icons.trophy} size={20} color={DOCTRINE.accent} />
            <CanvasText style={`text-xl font-bold text-[${DOCTRINE.text}]`}>{p.title}</CanvasText>
          </Box>

          <Box style={tw('flex flex-row flex-wrap gap-1')}>
            {p.modes.map((m) => (
              <ModeTab key={m} label={m} active={p.mode === m} onPress={() => p.onModeChange(m)} />
            ))}
          </Box>

          <Box style={tw('flex flex-col w-full rounded-site border border-[rgba(255,255,255,0.06)] overflow-hidden')}>
            {p.loading ? (
              <Box style={tw('flex flex-col items-center w-full p-8')}>
                <CanvasText style="text-sm text-[rgba(255,255,255,0.3)]">{p.loadingText}</CanvasText>
              </Box>
            ) : p.entries.length === 0 ? (
              <Box style={tw('flex flex-col items-center w-full p-8')}>
                <CanvasText style="text-sm text-[rgba(255,255,255,0.3)]">{p.emptyText}</CanvasText>
              </Box>
            ) : (
              <Box style={tw('flex flex-col w-full')}>
                <Box style={tw('flex flex-row w-full bg-[#141416]')}>
                  <Cell flex={1} color="rgba(255,255,255,0.3)" mono>#</Cell>
                  <Cell flex={4} color="rgba(255,255,255,0.3)" mono>{p.cols.player}</Cell>
                  <Cell flex={2} align="right" color="rgba(255,255,255,0.3)" mono>{p.cols.score}</Cell>
                  <Cell flex={2} align="right" color="rgba(255,255,255,0.3)" mono>{p.cols.time}</Cell>
                </Box>
                {p.entries.map((e, i) => (
                  <Box key={i} style={tw('flex flex-row w-full border-t border-[rgba(255,255,255,0.04)]')}>
                    <Cell flex={1} color="rgba(255,255,255,0.4)" mono>{String(e.rank)}</Cell>
                    <Cell flex={4}>{e.user?.name ?? e.user?.handle ?? p.anon}</Cell>
                    <Cell flex={2} align="right" color={DOCTRINE.accent} mono>{String(e.score)}</Cell>
                    <Cell flex={2} align="right" color="rgba(255,255,255,0.4)" mono>{`${(e.timeMs / 1000).toFixed(1)}s`}</Cell>
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

function LeaderboardMirror(p: LbSceneProps) {
  return (
    <div>
      <h1>{p.title}</h1>
      <ol>{p.entries.map((e, i) => <li key={i}>{e.rank}. {e.user?.name ?? e.user?.handle ?? p.anon} — {e.score}</li>)}</ol>
    </div>
  );
}

function LeaderboardPage() {
  const { t } = useTranslation("r-strategies");
  const [mode, setMode] = useState<string>(MODES[0]);
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: ['doctrine', 'leaderboard', mode, today],
    queryFn: async () => {
      const res = await fetch(`/api/doctrine/puzzles/leaderboard?mode=${mode}&date=${today}&limit=50`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const sceneProps: LbSceneProps = useMemo(() => ({
    title: t("leaderboards", { defaultValue: "Leaderboards" }),
    loading: isLoading,
    loadingText: t("loading", { defaultValue: "Loading..." }),
    emptyText: t("no-submissions", { defaultValue: "No submissions yet today. Be the first." }),
    cols: { player: t("player", { defaultValue: "Player" }), score: t("score", { defaultValue: "Score" }), time: t("time", { defaultValue: "Time" }) },
    anon: t("anonymous", { defaultValue: "Anonymous" }),
    mode, modes: MODES, onModeChange: setMode,
    entries: (Array.isArray(data) ? data : []) as Entry[],
  }), [t, isLoading, data, mode]);

  return (
    <CanvasPage
      routeId="/strategies/puzzles/leaderboard"
      scene={LeaderboardScene}
      sceneProps={sceneProps}
      mirror={<LeaderboardMirror {...sceneProps} />}
      shell="fullscreen"
      title={sceneProps.title}
    />
  );
}
