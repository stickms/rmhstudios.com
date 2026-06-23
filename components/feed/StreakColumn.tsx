'use client';

import { useEffect, useState } from 'react';
import { Loader2, Flame, Trophy, CalendarCheck, Check } from 'lucide-react';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';

interface StreakState {
  current: number;
  longest: number;
  totalCheckIns: number;
  checkedInToday: boolean;
  reward: number;
}

// Streak milestones that unlock rewards / achievements.
const MILESTONES = [
  { day: 7, label: '7-day streak' },
  { day: 30, label: '30-day streak' },
  { day: 100, label: '100-day streak' },
];

export function StreakColumn({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const [streak, setStreak] = useState<StreakState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/streak', { credentials: 'include' });
        if (res.ok && active) setStreak(await res.json());
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }
  if (!streak) {
    return <p className="px-4 py-16 text-center text-sm text-site-text-muted">Could not load your streak.</p>;
  }

  const next = MILESTONES.find((m) => m.day > streak.current);
  const nextPct = next ? Math.min(100, Math.round((streak.current / next.day) * 100)) : 100;

  return (
    <div className={hideHeader ? '' : 'min-h-screen'}>
      {!hideHeader && (
        <header className="sticky top-0 z-10 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-400" />
            <h1 className="text-lg font-bold text-site-text">Streak</h1>
          </div>
        </header>
      )}

      <div className="space-y-8 p-4">
        {/* Current streak hero */}
        <section className="flex flex-col items-center gap-3 rounded-xl border border-site-border bg-site-surface p-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-500/15">
            <Flame className="h-10 w-10 fill-orange-500/30 text-orange-400" />
          </div>
          <div>
            <p className="text-4xl font-extrabold text-site-text">{streak.current}</p>
            <p className="text-sm text-site-text-muted">day{streak.current === 1 ? '' : 's'} in a row</p>
          </div>
          {streak.checkedInToday ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-400">
              <Check className="h-4 w-4" /> Checked in today
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1.5 text-sm font-semibold text-orange-400">
              <Flame className="h-4 w-4" /> Visit today to keep it alive
            </span>
          )}
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-site-border bg-site-surface p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              <Trophy className="h-3.5 w-3.5" /> Longest
            </div>
            <p className="mt-1 text-2xl font-bold text-site-text">{streak.longest}</p>
            <p className="text-xs text-site-text-muted">day{streak.longest === 1 ? '' : 's'}</p>
          </div>
          <div className="rounded-xl border border-site-border bg-site-surface p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              <CalendarCheck className="h-3.5 w-3.5" /> Total check-ins
            </div>
            <p className="mt-1 text-2xl font-bold text-site-text">{streak.totalCheckIns}</p>
            <p className="text-xs text-site-text-muted">all time</p>
          </div>
        </section>

        {/* Next milestone */}
        {next && (
          <section className="rounded-xl border border-site-border bg-site-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-site-text">Next milestone</h2>
              <span className="text-xs text-site-text-muted">
                {streak.current} / {next.day} days
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-site-bg">
              <div className="h-full rounded-full bg-orange-400 transition-all" style={{ width: `${nextPct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-site-text-dim">
              {next.day - streak.current} more day{next.day - streak.current === 1 ? '' : 's'} to reach the {next.label}.
            </p>
          </section>
        )}

        {/* Milestones list */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">Milestones</h2>
          <div className="space-y-2">
            {MILESTONES.map((m) => {
              const reached = streak.current >= m.day || streak.longest >= m.day;
              return (
                <div
                  key={m.day}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    reached ? 'border-site-border bg-site-surface' : 'border-site-border/60 bg-site-bg opacity-70'
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      reached ? 'bg-orange-500/15 text-orange-400' : 'bg-site-surface text-site-text-dim'
                    }`}
                  >
                    <Flame className={`h-4 w-4 ${reached ? 'fill-orange-500/30' : ''}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-site-text">{m.label}</p>
                    <p className="text-xs text-site-text-muted">Reach a {m.day}-day check-in streak.</p>
                  </div>
                  {reached && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
                </div>
              );
            })}
          </div>
        </section>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-site-text-dim">
          <CoinIcon className="h-3.5 w-3.5" /> Check in daily to earn coins — rewards grow as your streak does.
        </p>
      </div>
    </div>
  );
}
