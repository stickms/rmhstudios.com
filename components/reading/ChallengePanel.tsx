'use client';

/**
 * L3 — the yearly reading challenge. Progress is derived from the member's
 * `read` shelf (finished-this-year books and their pages), so there is nothing
 * to log by hand: finish a book in the library reader, or shelve it as read.
 * `compact` is the library-page widget; the full panel lives under /reading.
 */

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Target } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { daysLeftInYear, paceFor } from '@/lib/reading/goal';
import { useGoal, useGoalMutations } from '@/lib/reading/client';
import type { GoalProgress } from '@/lib/reading/schema';

export default function ChallengePanel({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('f-reading');
  const { data: session } = useSession();
  const year = new Date().getUTCFullYear();
  const { data, isPending } = useGoal(year, !!session);
  const { set, clear } = useGoalMutations(year);
  const [editing, setEditing] = useState(false);
  const [unit, setUnit] = useState<'books' | 'pages'>('books');
  const [target, setTarget] = useState('');

  if (!session) {
    return compact ? null : (
      <SignedOutPrompt
        icon={Target}
        title={t('challenge-signed-out', { defaultValue: 'Sign in to set a reading goal' })}
        callbackURL="/reading?tab=challenge"
      />
    );
  }
  if (isPending) return <Skeleton className="h-24 w-full" />;

  const goal = data?.goal ?? null;
  const form = !goal || editing;

  async function save() {
    const n = Math.floor(Number(target));
    if (!Number.isFinite(n) || n < 1) {
      toast.error(t('challenge-bad-target', { defaultValue: 'Enter a goal of at least 1.' }));
      return;
    }
    try {
      await set.mutateAsync({ unit, target: n });
      setEditing(false);
      toast.success(t('challenge-saved', { defaultValue: 'Goal saved.' }));
    } catch {
      toast.error(t('challenge-failed', { defaultValue: 'Could not save your goal.' }));
    }
  }

  return (
    <section
      aria-label={t('challenge-heading', { year, defaultValue: '{{year}} reading challenge' })}
      className={compact ? 'glass-fill rounded-site p-4' : 'glass-pane rounded-site p-5'}
    >
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-site-text">
        <Target className="size-4 text-site-accent" aria-hidden />
        {t('challenge-heading', { year, defaultValue: '{{year}} reading challenge' })}
      </h2>

      {form ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1">
            <label htmlFor="rf-goal-target" className="text-sm text-site-text-muted">
              {t('challenge-target', { defaultValue: 'I want to read' })}
            </label>
            <Input
              id="rf-goal-target"
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              className="w-28"
              value={target}
              placeholder={goal ? String(goal.target) : unit === 'books' ? '12' : '3000'}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <Select
            aria-label={t('challenge-unit', { defaultValue: 'Goal unit' })}
            value={unit}
            onChange={(e) => setUnit(e.target.value === 'pages' ? 'pages' : 'books')}
            className="w-32"
          >
            <option value="books">{t('unit-books', { defaultValue: 'books' })}</option>
            <option value="pages">{t('unit-pages', { defaultValue: 'pages' })}</option>
          </Select>
          <Button type="submit" variant="accent" size="sm" loading={set.isPending}>
            {goal
              ? t('challenge-update', { defaultValue: 'Update goal' })
              : t('challenge-start', { defaultValue: 'Start challenge' })}
          </Button>
          {goal ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
          ) : null}
        </form>
      ) : (
        <Progress goal={goal!} year={year} />
      )}

      {!form ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setUnit(goal!.unit);
              setTarget(String(goal!.target));
              setEditing(true);
            }}
          >
            {t('challenge-edit', { defaultValue: 'Change goal' })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => clear.mutate()}
            disabled={clear.isPending}
          >
            {t('challenge-remove', { defaultValue: 'Remove goal' })}
          </Button>
          {compact ? (
            <Link
              to="/reading"
              search={{ tab: 'challenge' }}
              className="ms-auto text-sm text-site-accent underline-offset-4 hover:underline"
            >
              {t('challenge-open', { defaultValue: 'My reading' })}
            </Link>
          ) : null}
        </div>
      ) : null}
      {goal && !form ? null : (
        <p className="mt-3 text-sm text-site-text-muted">
          {t('challenge-how', {
            defaultValue:
              'Books count when you finish them in the reader or move them to your Read shelf.',
          })}
        </p>
      )}
    </section>
  );
}

function Progress({ goal, year }: { goal: GoalProgress; year: number }) {
  const { t } = useTranslation('f-reading');
  const pct = Math.min(100, Math.round((goal.done / goal.target) * 100));
  const pace = paceFor(goal.done, goal.target, goal.year, new Date());
  const left = daysLeftInYear(year, new Date());
  const unitLabel =
    goal.unit === 'books'
      ? t('unit-books', { defaultValue: 'books' })
      : t('unit-pages', { defaultValue: 'pages' });
  const paceText =
    pace.status === 'done'
      ? t('pace-done', { defaultValue: 'Goal reached. Well read.' })
      : pace.status === 'ahead'
        ? t('pace-ahead', {
            n: Math.abs(pace.delta),
            unit: unitLabel,
            defaultValue: '{{n}} {{unit}} ahead of pace',
          })
        : pace.status === 'behind'
          ? t('pace-behind', {
              n: Math.abs(pace.delta),
              unit: unitLabel,
              defaultValue: '{{n}} {{unit}} behind pace',
            })
          : t('pace-on-track', { defaultValue: 'Right on pace' });
  return (
    <div className="mt-3 space-y-2">
      <p className="text-2xl font-bold text-site-text">
        {t('challenge-progress', {
          done: goal.done,
          target: goal.target,
          unit: unitLabel,
          defaultValue: '{{done}} of {{target}} {{unit}}',
        })}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal.target}
        aria-valuenow={Math.min(goal.done, goal.target)}
        aria-label={t('challenge-progress', {
          done: goal.done,
          target: goal.target,
          unit: unitLabel,
          defaultValue: '{{done}} of {{target}} {{unit}}',
        })}
        className="h-2.5 w-full overflow-hidden rounded-full bg-site-surface-active"
      >
        <div
          className="h-full rounded-full bg-site-accent transition-[width] duration-site"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm text-site-text-muted">
        {paceText} ·{' '}
        {t('days-left', {
          count: left,
          defaultValue: '{{count}} day left',
          defaultValue_other: '{{count}} days left',
        })}
      </p>
      <p className="text-sm text-site-text-dim">
        {t('challenge-totals', {
          books: goal.books,
          pages: goal.pages,
          defaultValue: '{{books}} finished · {{pages}} pages',
        })}
      </p>
    </div>
  );
}
