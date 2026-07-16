'use client';

/**
 * "Today" widget — the daily loop at a glance. Concentrates the scattered daily
 * surfaces (check-in streak, coin wheel, six daily puzzles, daily quests) into
 * one card with live completion states, plus a coin-purchasable streak freeze
 * so a missed day doesn't wipe a long streak.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Flame, Puzzle, CircleDot, Target, Snowflake, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useSession } from '@/components/Providers';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useIdleReady } from '@/hooks/useIdleReady';

interface TodaySummary {
  streak: { current: number; checkedInToday: boolean; freezeTokens: number };
  wheel: { spunToday: boolean };
  puzzles: Array<{ mode: string; done: boolean }>;
  quests: { total: number; completed: number; claimable: number };
}

const PUZZLE_LABEL: Record<string, string> = {
  'lights-out': 'Lights Out',
  alibi: 'Alibi',
  spectrum: 'Spectrum',
  outcast: 'Outcast',
  chainlink: 'Chainlink',
  impostor: 'Impostor',
};

function TaskRow({
  to,
  icon,
  label,
  done,
  hint,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  done: boolean;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="-mx-2 flex items-center gap-2.5 rounded-site-sm px-2 py-1.5 transition-colors hover:bg-site-surface-hover"
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          done
            ? 'border-site-success bg-site-success/15 text-site-success'
            : 'border-site-border text-site-text-dim'
        }`}
      >
        {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : icon}
      </span>
      <span className={`min-w-0 flex-1 text-sm ${done ? 'text-site-text-muted' : 'text-site-text'}`}>
        {label}
      </span>
      {hint && <span className="shrink-0 text-xs text-site-text-dim">{hint}</span>}
    </Link>
  );
}

export function TodayWidget() {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const isDesktop = useIsDesktop();
  const idle = useIdleReady();
  const [data, setData] = useState<TodaySummary | null>(null);
  const [buying, setBuying] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/today', { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch {
      // decorative — leave empty
    }
  }, []);

  // Desktop-only (this lives in the `hidden lg:block` right sidebar) and deferred
  // to idle so it doesn't fetch on mobile or contend during hydration.
  useEffect(() => {
    if (session?.user && isDesktop && idle) void load();
  }, [session?.user, isDesktop, idle, load]);

  if (!session?.user || !data) return null;

  const puzzlesDone = data.puzzles.filter((p) => p.done).length;
  const nextPuzzle = data.puzzles.find((p) => !p.done);

  const buyFreeze = async () => {
    setBuying(true);
    try {
      const res = await fetch('/api/streak/freeze', { method: 'POST', credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(
          t('freeze-bought', {
            defaultValue: 'Streak freeze bought! You now hold {{count}}.',
            count: body.freezeTokens,
          })
        );
        setData((d) => (d ? { ...d, streak: { ...d.streak, freezeTokens: body.freezeTokens } } : d));
      } else {
        toast.error(body.error ?? t('freeze-failed', { defaultValue: 'Could not buy a freeze.' }));
      }
    } catch {
      toast.error(t('freeze-failed', { defaultValue: 'Could not buy a freeze.' }));
    } finally {
      setBuying(false);
    }
  };

  return (
    <section className="rounded-site border border-site-border bg-site-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-(family-name:--site-font-display) text-lg font-bold text-site-text">
          <Flame className="h-5 w-5 text-site-accent" aria-hidden />
          {t('today-title', { defaultValue: 'Today' })}
        </h2>
        {data.streak.current > 0 && (
          <span className="rounded-full bg-site-accent-dim px-2 py-0.5 text-xs font-semibold text-site-accent">
            {t('today-streak', { defaultValue: '{{count}}🔥', count: data.streak.current })}
          </span>
        )}
      </div>

      <div className="space-y-0.5">
        <TaskRow
          to="/progress"
          icon={<Flame className="h-3.5 w-3.5" aria-hidden />}
          label={t('today-checkin', { defaultValue: 'Daily check-in' })}
          done={data.streak.checkedInToday}
        />
        <TaskRow
          to="/progress"
          icon={<CircleDot className="h-3.5 w-3.5" aria-hidden />}
          label={t('today-wheel', { defaultValue: 'Spin the coin wheel' })}
          done={data.wheel.spunToday}
        />
        <TaskRow
          to={nextPuzzle ? `/daily/${nextPuzzle.mode}` : '/daily'}
          icon={<Puzzle className="h-3.5 w-3.5" aria-hidden />}
          label={
            nextPuzzle
              ? t('today-puzzle-next', {
                  defaultValue: 'Daily puzzle: {{name}}',
                  name: PUZZLE_LABEL[nextPuzzle.mode] ?? nextPuzzle.mode,
                })
              : t('today-puzzles-done', { defaultValue: 'Daily puzzles' })
          }
          done={puzzlesDone === data.puzzles.length}
          hint={`${puzzlesDone}/${data.puzzles.length}`}
        />
        <TaskRow
          to="/progress"
          icon={<Target className="h-3.5 w-3.5" aria-hidden />}
          label={t('today-quests', { defaultValue: 'Daily quests' })}
          done={data.quests.completed === data.quests.total}
          hint={`${data.quests.completed}/${data.quests.total}`}
        />
      </div>

      {/* Streak freeze — protect the streak against a missed day. */}
      <div className="mt-3 flex items-center gap-2 border-t border-site-border pt-3">
        <Snowflake className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />
        <p className="min-w-0 flex-1 text-xs text-site-text-muted">
          {data.streak.freezeTokens > 0
            ? t('freeze-held', {
                defaultValue: '{{count}} streak freeze protecting you',
                count: data.streak.freezeTokens,
              })
            : t('freeze-none', { defaultValue: 'No streak freeze — a miss resets your streak' })}
        </p>
        <button
          type="button"
          onClick={buyFreeze}
          disabled={buying || data.streak.freezeTokens >= 3}
          className="shrink-0 rounded-full border border-site-border px-2.5 py-1 text-xs font-semibold text-site-text transition-colors hover:bg-site-surface-hover disabled:opacity-50"
        >
          {data.streak.freezeTokens >= 3
            ? t('freeze-max', { defaultValue: 'Max' })
            : t('freeze-buy', { defaultValue: 'Buy · 150' })}
        </button>
      </div>
    </section>
  );
}
