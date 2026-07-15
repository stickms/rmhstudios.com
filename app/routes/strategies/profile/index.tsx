import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useDoctrineReputation } from '@/hooks/useDoctrineReputation';
import { getRank } from '@/lib/doctrine/reputation';
import { RANKS } from '@/lib/doctrine/constants';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { ScrollView } from '@/canvas-ui/widgets/ScrollView';
import { CanvasLink } from '@/canvas-ui/widgets/Link';
import { Icon } from '@/canvas-ui/widgets/Icon';
import { icons } from '@/canvas-ui/widgets/icons';
import { Skeleton } from '@/canvas-ui/widgets/primitives';
import { DoctrineShell, DOCTRINE } from '@/components/doctrine/canvas/DoctrineShell';

export const Route = createFileRoute('/strategies/profile/')({
  component: ProfilePage,
});

interface ProfileRep { badge: string; name: string; streak: number; progress: number; xpLabel: string; toNextLabel: string }
interface Stat { label: string; value: string }
interface ProfileSceneProps extends Record<string, unknown> {
  title: string; loading: boolean; rep: ProfileRep | null;
  stats: Stat[]; activityLabel: string; breakdownLabel: string; settingsLabel: string;
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <Box style={tw('flex flex-row w-full h-2 rounded-full bg-[#1C1C20] overflow-hidden')}>
      <Box style={{ ...tw('h-2 rounded-full bg-[#F97316]'), layout: { ...tw('h-2').layout, width: `${Math.min(100, progress)}%` } }} />
    </Box>
  );
}

/** Empty (data={{}}) activity heatmap: 16 weeks x 7 days of base cells. */
function Heatmap() {
  return (
    <Box style={tw('flex flex-row gap-0.5')}>
      {Array.from({ length: 16 }).map((_, w) => (
        <Box key={w} style={tw('flex flex-col gap-0.5')}>
          {Array.from({ length: 7 }).map((__, d) => (
            <Box key={d} style={tw('w-2 h-2 rounded-[2px] bg-[rgba(255,255,255,0.05)]')} />
          ))}
        </Box>
      ))}
    </Box>
  );
}

function ProfileScene(p: ProfileSceneProps) {
  return (
    <DoctrineShell>
      <ScrollView style={tw('flex flex-col flex-1 w-full overflow-hidden')} contentStyle={tw('flex flex-col w-full items-center')}>
        <Box style={tw('flex flex-col w-full max-w-[768px] px-4 py-6 gap-6')}>
          <Box style={tw('flex flex-row items-center justify-between w-full')}>
            <Box style={tw('flex flex-row items-center gap-2')}>
              <Icon node={icons.user} size={20} color={DOCTRINE.accent} />
              <CanvasText style={`text-xl font-bold text-[${DOCTRINE.text}]`}>{p.title}</CanvasText>
            </Box>
            <CanvasLink to="/strategies/profile/settings" label={p.settingsLabel} style={tw('flex flex-row p-2 rounded-site-sm')}>
              <Icon node={icons.settings} size={16} color="rgba(255,255,255,0.3)" />
            </CanvasLink>
          </Box>

          {p.loading ? (
            <Box style={tw('flex flex-col w-full gap-4')}>{[0, 1, 2].map((i) => <Skeleton key={i} style={tw('w-full h-24')} />)}</Box>
          ) : p.rep ? (
            <Box style={tw('flex flex-col w-full gap-6')}>
              {/* Rank + XP */}
              <Box style={tw('flex flex-col w-full gap-4 p-5 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)]')}>
                <Box style={tw('flex flex-row items-center justify-between')}>
                  <Box style={tw(`flex flex-row items-center gap-1 px-3 py-1.5 rounded-site-sm bg-[rgba(249,115,22,0.08)]`)}>
                    <CanvasText style={`text-base font-medium text-[${DOCTRINE.accent}]`}>{`${p.rep.badge} ${p.rep.name}`}</CanvasText>
                  </Box>
                  <Box style={tw('flex flex-row items-center gap-1.5')}>
                    <CanvasText style="text-lg">{p.rep.streak > 0 ? '🔥' : ''}</CanvasText>
                    <CanvasText style={`text-lg font-bold text-[${p.rep.streak > 0 ? DOCTRINE.text : '#52525B'}]`}>{String(p.rep.streak)}</CanvasText>
                  </Box>
                </Box>
                <Box style={tw('flex flex-col w-full gap-1.5')}>
                  {p.rep.xpLabel ? <CanvasText style="text-xs text-[rgba(255,255,255,0.4)]">{p.rep.xpLabel}</CanvasText> : null}
                  <ProgressBar progress={p.rep.progress} />
                  {p.rep.toNextLabel ? <CanvasText style="text-xs text-[rgba(255,255,255,0.3)]">{p.rep.toNextLabel}</CanvasText> : null}
                </Box>
              </Box>

              {/* Stats grid */}
              <Box style={tw('flex flex-row w-full gap-3')}>
                {p.stats.map((s) => (
                  <Box key={s.label} style={tw('flex flex-col items-center flex-1 p-3 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)]')}>
                    <CanvasText style={`text-lg font-bold text-[${DOCTRINE.accent}]`}>{s.value}</CanvasText>
                    <CanvasText style="text-xs text-[rgba(255,255,255,0.3)]">{s.label}</CanvasText>
                  </Box>
                ))}
              </Box>

              {/* Activity heatmap */}
              <Box style={tw('flex flex-col w-full gap-3 p-4 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)]')}>
                <CanvasText style="text-xs font-mono uppercase tracking-wide text-[rgba(255,255,255,0.4)]">{p.activityLabel}</CanvasText>
                <Heatmap />
              </Box>

              <CanvasLink to="/strategies/profile/reputation" textStyle="text-xs text-[rgba(255,255,255,0.3)]">{p.breakdownLabel}</CanvasLink>
            </Box>
          ) : null}
        </Box>
      </ScrollView>
    </DoctrineShell>
  );
}

function ProfileMirror(p: ProfileSceneProps) {
  return (
    <div>
      <h1>{p.title}</h1>
      {p.rep && <p>{p.rep.badge} {p.rep.name}</p>}
      <ul>{p.stats.map((s) => <li key={s.label}>{s.label}: {s.value}</li>)}</ul>
      <a href="/strategies/profile/reputation">{p.breakdownLabel}</a>
    </div>
  );
}

function ProfilePage() {
  const { t } = useTranslation("r-strategies");
  const { data: rep, isLoading } = useDoctrineReputation();

  const sceneProps: ProfileSceneProps = useMemo(() => {
    let repOut: ProfileRep | null = null;
    let stats: Stat[] = [];
    if (rep) {
      const cur = getRank(rep.totalXp);
      const idx = RANKS.findIndex((r) => r.name === cur.name);
      const next = RANKS[idx + 1];
      const progress = next ? ((rep.totalXp - cur.minXp) / (next.minXp - cur.minXp)) * 100 : 100;
      repOut = {
        badge: cur.badge, name: cur.name, streak: rep.currentStreak, progress,
        xpLabel: next ? t("xp-progress", { defaultValue: "{{current}} / {{max}} XP", current: rep.totalXp.toLocaleString(), max: next.minXp.toLocaleString() }) : '',
        toNextLabel: next ? t("xp-to-next-rank", { defaultValue: "{{xp}} XP to {{badge}} {{name}}", xp: (next.minXp - rep.totalXp).toLocaleString(), badge: next.badge, name: next.name }) : '',
      };
      stats = [
        { label: t("total-xp", { defaultValue: "Total XP" }), value: rep.totalXp.toLocaleString() },
        { label: t("sahur-count", { defaultValue: "Sahur Count" }), value: String(rep.sahurCount) },
        { label: t("coalition", { defaultValue: "Coalition" }), value: `${rep.coalitionScore.toFixed(1)}x` },
      ];
    }
    return {
      title: t("profile", { defaultValue: "Profile" }),
      loading: isLoading,
      rep: repOut,
      stats,
      activityLabel: t("activity", { defaultValue: "Activity" }),
      breakdownLabel: t("full-xp-breakdown", { defaultValue: "Full XP Breakdown →" }),
      settingsLabel: t("settings", { defaultValue: "Settings" }),
    };
  }, [t, rep, isLoading]);

  return (
    <CanvasPage routeId="/strategies/profile/" scene={ProfileScene} sceneProps={sceneProps} mirror={<ProfileMirror {...sceneProps} />} shell="fullscreen" title={sceneProps.title} />
  );
}
