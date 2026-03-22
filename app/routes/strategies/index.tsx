/**
 * Strategies Dashboard — Coalition Overview
 *
 * The user's home base: XP, rank, streak, active projects,
 * today's puzzles, recent incidents, Sahur countdown.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { Puzzle, Shield, AlertTriangle, Moon, Trophy, Flame } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useDoctrineReputation } from '@/hooks/useDoctrineReputation';
import { useDoctrineSahur } from '@/hooks/useDoctrineSahur';
import { XpBar } from '@/components/doctrine/reputation/xp-bar';
import { RankBadge } from '@/components/doctrine/reputation/rank-badge';
import { StreakDisplay } from '@/components/doctrine/puzzles/streak-display';
import { CrisisBanner } from '@/components/doctrine/coalition/crisis-banner';
import { ProjectCard } from '@/components/doctrine/coalition/project-card';
import { CountdownTimer } from '@/components/doctrine/countdown-timer';

export const Route = createFileRoute('/strategies/')({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: rep } = useDoctrineReputation();
  const { sahurActive, sahurCountdown } = useDoctrineSahur();

  const { data: incidents } = useQuery({
    queryKey: ['doctrine', 'incidents'],
    queryFn: async () => {
      const res = await fetch('/api/doctrine/incidents?limit=3');
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: puzzles } = useQuery({
    queryKey: ['doctrine', 'puzzles', 'today'],
    queryFn: async () => {
      const res = await fetch('/api/doctrine/puzzles/today');
      return res.json();
    },
    staleTime: 60_000,
  });

  const activeIncidents = incidents?.filter?.((i: { status: string }) => i.status === 'ACTIVE') ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          Coalition Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--doctrine-text-muted)' }}>
          Your standing across the RMH ecosystem
        </p>
      </div>

      {/* Reputation Overview */}
      {rep && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between">
            <RankBadge xp={rep.totalXp} />
            <StreakDisplay streak={rep.currentStreak} longestStreak={rep.longestStreak} />
          </div>
          <XpBar totalXp={rep.totalXp} />
          {rep.coalitionScore > 1 && (
            <p className="text-sm md:text-xs text-white/30 font-mono">
              Coalition Multiplier: {rep.coalitionScore.toFixed(1)}x
            </p>
          )}
        </div>
      )}

      {/* Active Incidents */}
      {activeIncidents.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm md:text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--doctrine-error)' }}>
            Active Incidents
          </h2>
          {activeIncidents.map((incident: { id: string; codename: string; severity: string; title: string }) => (
            <CrisisBanner
              key={incident.id}
              incidentId={incident.id}
              codename={incident.codename}
              severity={incident.severity}
              title={incident.title}
            />
          ))}
        </div>
      )}

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <QuickAction to="/strategies/puzzles" icon={Puzzle} label="Puzzles" count={puzzles?.length ?? 0} countLabel="today" color="#F97316" />
        <QuickAction to="/strategies/safehouse" icon={Shield} label="Safehouse" color="#22D3EE" />
        <QuickAction to="/strategies/incidents" icon={AlertTriangle} label="Incidents" count={activeIncidents.length} countLabel="active" color="#EF4444" />
        <QuickAction to="/strategies/sahur" icon={Moon} label={sahurActive ? 'SAHUR LIVE' : 'Sahur'} color={sahurActive ? '#F59E0B' : '#6B7280'} pulse={sahurActive} />
      </div>

      {/* Sahur Countdown */}
      {!sahurActive && (
        <div className="rounded-lg p-4 flex items-center justify-between" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <Moon size={16} className="text-amber-400/40" />
            <span className="text-sm md:text-xs text-white/40">Next Sahur Mode (3x XP)</span>
          </div>
          <span className="text-sm md:text-xs font-mono text-white/30">
            {sahurCountdown > 0 ? `${Math.floor(sahurCountdown / 60)}h ${sahurCountdown % 60}m` : '—'}
          </span>
        </div>
      )}

      {/* Coalition Projects */}
      <div className="space-y-3">
        <h2 className="text-sm md:text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--doctrine-text-muted)' }}>
          Coalition
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ProjectCard name="Daily Puzzles" description="Alibi, Spectrum, Outcast, Chainlink, Impostor" status="active" userActive={true} url="/strategies/puzzles" />
          <ProjectCard name="Safehouse" description="Insider content, dev logs, disclosures" status="active" userActive={false} url="/strategies/safehouse" />
          <ProjectCard name="Nightfall Onslaught" description="Tower defense action game" status="beta" userActive={false} />
        </div>
      </div>
    </div>
  );
}

function QuickAction({ to, icon: Icon, label, count, countLabel, color, pulse }: {
  to: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  label: string;
  count?: number;
  countLabel?: string;
  color: string;
  pulse?: boolean;
}) {
  return (
    <a
      href={to}
      className={`rounded-lg p-3 md:p-4 flex flex-col items-center gap-2 text-center transition-all hover:bg-white/[0.02] min-h-[44px] ${pulse ? 'animate-pulse' : ''}`}
      style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <Icon size={20} style={{ color }} />
      <span className="text-sm md:text-xs font-medium text-white/80">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs md:text-[10px] text-white/30">{count} {countLabel}</span>
      )}
    </a>
  );
}
