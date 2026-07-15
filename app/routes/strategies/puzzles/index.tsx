import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useDoctrineReputation } from '@/hooks/useDoctrineReputation';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { ScrollView } from '@/canvas-ui/widgets/ScrollView';
import { CanvasLink } from '@/canvas-ui/widgets/Link';
import { Skeleton } from '@/canvas-ui/widgets/primitives';
import { DoctrineShell, DOCTRINE } from '@/components/doctrine/canvas/DoctrineShell';

export const Route = createFileRoute('/strategies/puzzles/')({
  component: PuzzlesIndex,
});

const MODE_INFO: Record<string, { name: string; descKey: string; descDefault: string; color: string }> = {
  ALIBI: { name: 'Alibi', descKey: 'mode-alibi-desc', descDefault: 'Find the liar among suspects', color: '#EF4444' },
  SPECTRUM: { name: 'Spectrum', descKey: 'mode-spectrum-desc', descDefault: 'Arrange items on a scale', color: '#8B5CF6' },
  OUTCAST: { name: 'Outcast', descKey: 'mode-outcast-desc', descDefault: "Find the word that doesn't belong", color: '#22C55E' },
  CHAINLINK: { name: 'Chainlink', descKey: 'mode-chainlink-desc', descDefault: 'Connect words in a chain', color: '#3B82F6' },
  IMPOSTOR: { name: 'Impostor', descKey: 'mode-impostor-desc', descDefault: 'Spot the wrong definition', color: '#F59E0B' },
};

interface Puzzle { id: string; mode: string; difficulty: number; isSahur: boolean; name: string; desc: string; color: string; sahurLabel: string }
interface PzSceneProps extends Record<string, unknown> {
  title: string; tagline: string; loading: boolean; streakText: string;
  archiveLabel: string; leaderboardLabel: string; puzzles: Puzzle[];
}

function DifficultyDots({ level, color }: { level: number; color: string }) {
  return (
    <Box style={tw('flex flex-row gap-0.5')}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Box key={i} style={tw(`w-1.5 h-1.5 rounded-full bg-[${i < level ? color : 'rgba(255,255,255,0.1)'}]`)} />
      ))}
    </Box>
  );
}

function PuzzlesScene({ title, tagline, loading, streakText, archiveLabel, leaderboardLabel, puzzles }: PzSceneProps) {
  return (
    <DoctrineShell>
      <ScrollView style={tw('flex flex-col flex-1 w-full overflow-hidden')} contentStyle={tw('flex flex-col w-full items-center')}>
        <Box style={tw('flex flex-col w-full max-w-[768px] px-4 py-6 gap-6')}>
          <Box style={tw('flex flex-row items-start justify-between w-full')}>
            <Box style={tw('flex flex-col gap-1')}>
              <CanvasText style={`text-xl font-bold text-[${DOCTRINE.text}]`}>{title}</CanvasText>
              <CanvasText style="text-sm text-[#52525B]">{tagline}</CanvasText>
            </Box>
            {streakText ? <CanvasText style={`text-sm font-mono text-[${DOCTRINE.accent}]`}>{streakText}</CanvasText> : null}
          </Box>

          {loading ? (
            <Box style={tw('flex flex-row flex-wrap w-full gap-3')}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={tw('w-full sm:w-[360px] h-28 grow')} />)}</Box>
          ) : (
            <Box style={tw('flex flex-row flex-wrap w-full gap-3')}>
              {puzzles.map((p) => (
                <CanvasLink
                  key={p.id}
                  to={`/strategies/puzzles/${p.mode.toLowerCase()}`}
                  label={p.name}
                  style={tw(`flex flex-col gap-2 p-5 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.1)] w-full sm:w-[360px] grow`)}
                >
                  <Box style={tw('flex flex-row items-center justify-between w-full')}>
                    <CanvasText style={`text-xs font-mono font-bold uppercase text-[${p.color}]`}>{p.name}</CanvasText>
                    <DifficultyDots level={p.difficulty} color={p.color} />
                  </Box>
                  <CanvasText style="text-sm text-[rgba(255,255,255,0.8)]">{p.desc}</CanvasText>
                  {p.isSahur ? <CanvasText style="text-xs font-bold text-[#fbbf24]">{p.sahurLabel}</CanvasText> : null}
                </CanvasLink>
              ))}
            </Box>
          )}

          <Box style={tw('flex flex-row gap-3')}>
            <CanvasLink to="/strategies/puzzles/archive" textStyle="text-xs text-[rgba(255,255,255,0.3)]">{archiveLabel}</CanvasLink>
            <CanvasLink to="/strategies/puzzles/leaderboard" textStyle="text-xs text-[rgba(255,255,255,0.3)]">{leaderboardLabel}</CanvasLink>
          </Box>
        </Box>
      </ScrollView>
    </DoctrineShell>
  );
}

function PuzzlesMirror({ title, tagline, puzzles, archiveLabel, leaderboardLabel }: PzSceneProps) {
  return (
    <div>
      <h1>{title}</h1><p>{tagline}</p>
      <ul>{puzzles.map((p) => <li key={p.id}><a href={`/strategies/puzzles/${p.mode.toLowerCase()}`}>{p.name}: {p.desc}</a></li>)}</ul>
      <a href="/strategies/puzzles/archive">{archiveLabel}</a>
      <a href="/strategies/puzzles/leaderboard">{leaderboardLabel}</a>
    </div>
  );
}

interface RawPuzzle { id: string; mode: string; difficulty: number; isSahur: boolean }

function PuzzlesIndex() {
  const { t } = useTranslation("r-strategies");
  const { data: rep } = useDoctrineReputation();
  const { data: puzzles, isLoading } = useQuery({
    queryKey: ['doctrine', 'puzzles', 'today'],
    queryFn: async () => {
      const res = await fetch('/api/doctrine/puzzles/today');
      return res.json();
    },
    staleTime: 60_000,
  });

  const sceneProps: PzSceneProps = useMemo(() => {
    const list: RawPuzzle[] = Array.isArray(puzzles) ? puzzles : [];
    const sahurLabel = t("sahur-exclusive", { defaultValue: "SAHUR EXCLUSIVE" });
    return {
      title: t("todays-puzzles", { defaultValue: "Today's Puzzles" }),
      tagline: t("puzzles-tagline", { defaultValue: "One thing. Maximum intensity. No second chances." }),
      loading: isLoading,
      streakText: rep?.currentStreak ? `🔥 ${rep.currentStreak}` : '',
      archiveLabel: t("browse-archive", { defaultValue: "Browse Archive →" }),
      leaderboardLabel: t("leaderboards", { defaultValue: "Leaderboards →" }),
      puzzles: list.map((p) => {
        const info = MODE_INFO[p.mode] ?? { name: p.mode, descKey: '', descDefault: '', color: '#6B7280' };
        return { id: p.id, mode: p.mode, difficulty: p.difficulty, isSahur: p.isSahur, name: info.name, desc: info.descKey ? t(info.descKey, { defaultValue: info.descDefault }) : info.descDefault, color: info.color, sahurLabel };
      }),
    };
  }, [t, puzzles, isLoading, rep]);

  return (
    <CanvasPage
      routeId="/strategies/puzzles/"
      scene={PuzzlesScene}
      sceneProps={sceneProps}
      mirror={<PuzzlesMirror {...sceneProps} />}
      shell="fullscreen"
      title={sceneProps.title}
    />
  );
}
