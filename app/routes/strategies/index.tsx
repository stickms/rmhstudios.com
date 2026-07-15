/**
 * Strategies Dashboard — canvas-converted (DoctrineShell).
 * Reputation (rank/XP bar/streak), active incident banners, quick actions,
 * Sahur countdown, coalition projects. Rank/XP math computed in the DOM
 * component (getRank/RANKS) and passed to the scene.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useDoctrineReputation } from '@/hooks/useDoctrineReputation';
import { useDoctrineSahur } from '@/hooks/useDoctrineSahur';
import { getRank } from '@/lib/doctrine/reputation';
import { RANKS } from '@/lib/doctrine/constants';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { ScrollView } from '@/canvas-ui/widgets/ScrollView';
import { CanvasLink } from '@/canvas-ui/widgets/Link';
import { Icon } from '@/canvas-ui/widgets/Icon';
import { icons, type IconName } from '@/canvas-ui/widgets/icons';
import { DoctrineShell, DOCTRINE } from '@/components/doctrine/canvas/DoctrineShell';

export const Route = createFileRoute('/strategies/')({
  component: DashboardPage,
});

interface Rep { badge: string; name: string; streak: number; longestStreak: number; progress: number; xpLabel: string; toNextLabel: string; multiplierLabel: string }
interface Incident { id: string; codename: string; severity: string; title: string; color: string }
interface QuickAction { to: string; icon: IconName; label: string; countLabel: string; color: string }
interface Project { name: string; description: string; status: string; statusColor: string; userActive: boolean; url?: string; activeLabel: string; openLabel: string }
interface DashSceneProps extends Record<string, unknown> {
  title: string; subtitle: string; rep: Rep | null; activeIncidentsLabel: string;
  incidents: Incident[]; quickActions: QuickAction[]; sahurActive: boolean;
  sahurLabel: string; sahurCountdown: string; coalitionLabel: string; projects: Project[];
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <Box style={tw('flex flex-row w-full h-2 rounded-full bg-[#1C1C20] overflow-hidden')}>
      <Box style={{ ...tw('h-2 rounded-full bg-[#F97316]'), layout: { ...tw('h-2').layout, width: `${Math.min(100, progress)}%` } }} />
    </Box>
  );
}

function DashboardScene(p: DashSceneProps) {
  return (
    <DoctrineShell>
      <ScrollView style={tw('flex flex-col flex-1 w-full overflow-hidden')} contentStyle={tw('flex flex-col w-full items-center')}>
        <Box style={tw('flex flex-col w-full max-w-[896px] px-4 py-6 gap-6')}>
          <Box style={tw('flex flex-col gap-1')}>
            <CanvasText style={`text-2xl font-bold text-[${DOCTRINE.text}]`}>{p.title}</CanvasText>
            <CanvasText style="text-sm text-[#52525B]">{p.subtitle}</CanvasText>
          </Box>

          {p.rep && (
            <Box style={tw('flex flex-col w-full gap-4 p-5 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)]')}>
              <Box style={tw('flex flex-row items-center justify-between w-full')}>
                <Box style={tw(`flex flex-row items-center gap-1 px-2 py-1 rounded-site-sm bg-[rgba(249,115,22,0.08)]`)}>
                  <CanvasText style={`text-sm font-medium text-[${DOCTRINE.accent}]`}>{`${p.rep.badge} ${p.rep.name}`}</CanvasText>
                </Box>
                <Box style={tw('flex flex-row items-center gap-1.5')}>
                  <CanvasText style="text-lg">{p.rep.streak > 0 ? '🔥' : ''}</CanvasText>
                  <CanvasText style={`text-lg font-bold text-[${p.rep.streak > 0 ? DOCTRINE.text : '#52525B'}]`}>{String(p.rep.streak)}</CanvasText>
                </Box>
              </Box>
              <Box style={tw('flex flex-col w-full gap-1.5')}>
                <Box style={tw('flex flex-row items-center justify-between w-full')}>
                  <CanvasText style="text-xs font-medium text-[rgba(255,255,255,0.8)]">{`${p.rep.badge} ${p.rep.name}`}</CanvasText>
                  {p.rep.xpLabel ? <CanvasText style="text-xs text-[rgba(255,255,255,0.4)]">{p.rep.xpLabel}</CanvasText> : null}
                </Box>
                <ProgressBar progress={p.rep.progress} />
                {p.rep.toNextLabel ? <CanvasText style="text-xs text-[rgba(255,255,255,0.3)]">{p.rep.toNextLabel}</CanvasText> : null}
              </Box>
              {p.rep.multiplierLabel ? <CanvasText style="text-xs font-mono text-[rgba(255,255,255,0.3)]">{p.rep.multiplierLabel}</CanvasText> : null}
            </Box>
          )}

          {p.incidents.length > 0 && (
            <Box style={tw('flex flex-col w-full gap-2')}>
              <CanvasText style="text-xs font-mono uppercase tracking-wide text-[#EF4444]">{p.activeIncidentsLabel}</CanvasText>
              {p.incidents.map((inc) => (
                <CanvasLink key={inc.id} to="/strategies/incidents" label={inc.title} style={tw(`flex flex-row items-center gap-3 w-full p-3 rounded-site bg-[rgba(239,68,68,0.03)] border border-[rgba(239,68,68,0.19)]`)}>
                  <Icon node={icons['alert-triangle']} size={16} color={inc.color} />
                  <Box style={tw('flex flex-col flex-1 min-w-0')}>
                    <Box style={tw('flex flex-row items-center gap-2')}>
                      <CanvasText style={`text-xs font-mono text-[${inc.color}]`}>{inc.codename}</CanvasText>
                      <CanvasText style={`text-xs font-mono uppercase text-[${inc.color}]`}>{inc.severity}</CanvasText>
                    </Box>
                    <CanvasText style="text-sm text-[rgba(255,255,255,0.8)]" maxLines={1}>{inc.title}</CanvasText>
                  </Box>
                </CanvasLink>
              ))}
            </Box>
          )}

          {/* Quick actions */}
          <Box style={tw('flex flex-row flex-wrap w-full gap-3')}>
            {p.quickActions.map((qa) => (
              <CanvasLink key={qa.to} to={qa.to} label={qa.label} style={tw('flex flex-col items-center gap-2 p-4 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)] w-full sm:w-[180px] grow')}>
                <Icon node={icons[qa.icon]} size={20} color={qa.color} />
                <CanvasText style="text-xs font-medium text-[rgba(255,255,255,0.8)]">{qa.label}</CanvasText>
                {qa.countLabel ? <CanvasText style="text-xs text-[rgba(255,255,255,0.3)]">{qa.countLabel}</CanvasText> : null}
              </CanvasLink>
            ))}
          </Box>

          {!p.sahurActive && (
            <Box style={tw('flex flex-row items-center justify-between w-full p-4 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)]')}>
              <Box style={tw('flex flex-row items-center gap-2')}>
                <Icon node={icons.moon} size={16} color="rgba(251,191,36,0.4)" />
                <CanvasText style="text-xs text-[rgba(255,255,255,0.4)]">{p.sahurLabel}</CanvasText>
              </Box>
              <CanvasText style="text-xs font-mono text-[rgba(255,255,255,0.3)]">{p.sahurCountdown}</CanvasText>
            </Box>
          )}

          <Box style={tw('flex flex-col w-full gap-3')}>
            <CanvasText style="text-xs font-mono uppercase tracking-wide text-[#52525B]">{p.coalitionLabel}</CanvasText>
            <Box style={tw('flex flex-row flex-wrap w-full gap-3')}>
              {p.projects.map((proj) => (
                <Box key={proj.name} style={tw('flex flex-col gap-2 p-4 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)] w-full sm:w-[360px] grow')}>
                  <Box style={tw('flex flex-row items-center justify-between')}>
                    <CanvasText style="text-sm font-semibold text-[rgba(255,255,255,0.9)]">{proj.name}</CanvasText>
                    <Box style={tw(`flex flex-row px-1.5 py-0.5 rounded-site-sm bg-[rgba(255,255,255,0.06)]`)}>
                      <CanvasText style={`text-xs font-mono uppercase text-[${proj.statusColor}]`}>{proj.status}</CanvasText>
                    </Box>
                  </Box>
                  <CanvasText style="text-xs text-[rgba(255,255,255,0.4)]">{proj.description}</CanvasText>
                  {proj.userActive ? <CanvasText style="text-xs text-[rgba(74,222,128,0.8)]">{`● ${proj.activeLabel}`}</CanvasText> : null}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </ScrollView>
    </DoctrineShell>
  );
}

function DashboardMirror(p: DashSceneProps) {
  return (
    <div>
      <h1>{p.title}</h1><p>{p.subtitle}</p>
      {p.incidents.length > 0 && <><h2>{p.activeIncidentsLabel}</h2><ul>{p.incidents.map((i) => <li key={i.id}><a href="/strategies/incidents">{i.codename} — {i.title}</a></li>)}</ul></>}
      <nav>{p.quickActions.map((q) => <a key={q.to} href={q.to}>{q.label}</a>)}</nav>
      <h2>{p.coalitionLabel}</h2>
      <ul>{p.projects.map((pr) => <li key={pr.name}>{pr.name}: {pr.description}</li>)}</ul>
    </div>
  );
}

const SEVERITY_COLORS: Record<string, string> = { COSMETIC: '#6B7280', DEGRADED: '#F59E0B', CRITICAL: '#EF4444', CATASTROPHIC: '#DC2626' };
const STATUS_COLORS: Record<string, string> = { active: '#22C55E', beta: '#F59E0B', 'coming-soon': '#6B7280' };

function DashboardPage() {
  const { t } = useTranslation("r-strategies");
  const { data: rep } = useDoctrineReputation();
  const { sahurActive, sahurCountdown } = useDoctrineSahur();
  const { data: incidents } = useQuery({ queryKey: ['doctrine', 'incidents'], queryFn: async () => (await fetch('/api/doctrine/incidents?limit=3')).json(), staleTime: 30_000 });
  const { data: puzzles } = useQuery({ queryKey: ['doctrine', 'puzzles', 'today'], queryFn: async () => (await fetch('/api/doctrine/puzzles/today')).json(), staleTime: 60_000 });

  const sceneProps: DashSceneProps = useMemo(() => {
    const activeIncidents = (Array.isArray(incidents) ? incidents : []).filter((i: { status: string }) => i.status === 'ACTIVE');
    let repOut: Rep | null = null;
    if (rep) {
      const cur = getRank(rep.totalXp);
      const idx = RANKS.findIndex((r) => r.name === cur.name);
      const next = RANKS[idx + 1];
      const progress = next ? ((rep.totalXp - cur.minXp) / (next.minXp - cur.minXp)) * 100 : 100;
      repOut = {
        badge: cur.badge, name: cur.name, streak: rep.currentStreak, longestStreak: rep.longestStreak, progress,
        xpLabel: next ? t("xp-progress", { defaultValue: "{{current}} / {{max}} XP", current: rep.totalXp.toLocaleString(), max: next.minXp.toLocaleString() }) : '',
        toNextLabel: next ? t("xp-to-next-rank", { defaultValue: "{{xp}} XP to {{badge}} {{name}}", xp: (next.minXp - rep.totalXp).toLocaleString(), badge: next.badge, name: next.name }) : '',
        multiplierLabel: rep.coalitionScore > 1 ? t("coalition-multiplier", { defaultValue: "Coalition Multiplier: {{score}}x", score: rep.coalitionScore.toFixed(1) }) : '',
      };
    }
    return {
      title: t("coalition-dashboard", { defaultValue: "Coalition Dashboard" }),
      subtitle: t("coalition-dashboard-subtitle", { defaultValue: "Your standing across the RMH ecosystem" }),
      rep: repOut,
      activeIncidentsLabel: t("active-incidents", { defaultValue: "Active Incidents" }),
      incidents: activeIncidents.map((i: { id: string; codename: string; severity: string; title: string }) => ({ id: i.id, codename: i.codename, severity: i.severity, title: i.title, color: SEVERITY_COLORS[i.severity] ?? '#EF4444' })),
      quickActions: [
        { to: '/strategies/puzzles', icon: 'puzzle', label: t("puzzles", { defaultValue: "Puzzles" }), countLabel: (Array.isArray(puzzles) ? puzzles.length : 0) ? `${puzzles.length} ${t("today", { defaultValue: "today" })}` : '', color: '#F97316' },
        { to: '/strategies/safehouse', icon: 'shield', label: t("safehouse", { defaultValue: "Safehouse" }), countLabel: '', color: '#22D3EE' },
        { to: '/strategies/incidents', icon: 'alert-triangle', label: t("incidents", { defaultValue: "Incidents" }), countLabel: activeIncidents.length ? `${activeIncidents.length} ${t("active", { defaultValue: "active" })}` : '', color: '#EF4444' },
        { to: '/strategies/sahur', icon: 'moon', label: sahurActive ? t("sahur-live", { defaultValue: "SAHUR LIVE" }) : t("sahur", { defaultValue: "Sahur" }), countLabel: '', color: sahurActive ? '#F59E0B' : '#6B7280' },
      ],
      sahurActive,
      sahurLabel: t("next-sahur-mode", { defaultValue: "Next Sahur Mode (3x XP)" }),
      sahurCountdown: sahurCountdown > 0 ? `${Math.floor(sahurCountdown / 60)}h ${sahurCountdown % 60}m` : '—',
      coalitionLabel: t("coalition", { defaultValue: "Coalition" }),
      projects: [
        { name: 'Daily Puzzles', description: 'Alibi, Spectrum, Outcast, Chainlink, Impostor', status: 'active', statusColor: STATUS_COLORS.active, userActive: true, url: '/strategies/puzzles', activeLabel: t("active", { defaultValue: "Active" }), openLabel: t("open", { defaultValue: "Open" }) },
        { name: 'Safehouse', description: 'Insider content, dev logs, disclosures', status: 'active', statusColor: STATUS_COLORS.active, userActive: false, url: '/strategies/safehouse', activeLabel: t("active", { defaultValue: "Active" }), openLabel: t("open", { defaultValue: "Open" }) },
        { name: 'Nightfall Onslaught', description: 'Tower defense action game', status: 'beta', statusColor: STATUS_COLORS.beta, userActive: false, activeLabel: t("active", { defaultValue: "Active" }), openLabel: t("open", { defaultValue: "Open" }) },
      ],
    };
  }, [t, rep, incidents, puzzles, sahurActive, sahurCountdown]);

  return (
    <CanvasPage routeId="/strategies/" scene={DashboardScene} sceneProps={sceneProps} mirror={<DashboardMirror {...sceneProps} />} shell="fullscreen" title={sceneProps.title} />
  );
}
