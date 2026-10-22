'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Link, useNavigate } from '@tanstack/react-router';
import { CalendarCheck, Plus, Share2, Star, Trash2 } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useSession } from '@/components/Providers';
import { cn } from '@/lib/utils';
import {
  MAX_MISTAKES,
  shareText,
  type GridGroup,
  type GridPlayView,
  type GridSummary,
} from '@/lib/party/connections';

const BAND = ['bg-site-warning/25', 'bg-site-success/25', 'bg-site-accent/25', 'bg-site-danger/25'];

const inputCls =
  'glass-inset h-10 w-full rounded-[var(--site-control-radius)] px-3 text-sm text-site-text';

function GridRow({ g, tag }: { g: GridSummary; tag?: string }) {
  const { t } = useTranslation('f-party');
  return (
    <Link to="/connections/u/$id" params={{ id: g.id }} className="block">
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate font-semibold text-site-text">{g.title}</p>
          <p className="text-xs text-site-text-muted">
            {t('grid-meta', {
              defaultValue: 'by {{author}} · {{plays}} plays · {{solve}} solved',
              author: g.author?.name ?? g.author?.handle ?? '?',
              plays: g.plays,
              solve: g.solveRate == null ? '-' : `${g.solveRate}%`,
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-site-text-muted">
          {tag ? <span className="text-xs font-semibold text-site-accent">{tag}</span> : null}
          {g.rating != null ? (
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5" aria-hidden />
              {g.rating}
            </span>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

export function ConnectionsHome() {
  const { t } = useTranslation('f-party');
  const [data, setData] = useState<{
    daily: GridSummary | null;
    top: GridSummary[];
    recent: GridSummary[];
  } | null>(null);
  useEffect(() => {
    fetch('/api/connections/grids')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('x'))))
      .then(setData)
      .catch(() => toast.error(t('load-failed-grids', { defaultValue: 'Could not load grids.' })));
  }, [t]);

  const list = (title: string, items: GridSummary[]) =>
    items.length ? (
      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold text-site-text">{title}</h2>
        {items.map((g) => (
          <GridRow key={g.id} g={g} />
        ))}
      </section>
    ) : null;

  return (
    <PageLayout
      title={t('conn-title', { defaultValue: 'Connections grids' })}
      description={t('conn-desc', {
        defaultValue:
          'Sort sixteen items into four hidden groups. Members make the grids; the best become the daily.',
      })}
      headerRight={
        <Button asChild variant="accent" size="sm">
          <Link to="/connections/new">
            <Plus aria-hidden />
            {t('make-grid', { defaultValue: 'Make a grid' })}
          </Link>
        </Button>
      }
    >
      <div className="space-y-6 px-4 pb-12">
        {!data ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            {data.daily ? (
              <section className="space-y-2">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-site-text">
                  <CalendarCheck className="h-4 w-4 text-site-accent" aria-hidden />
                  {t('todays-grid', { defaultValue: 'Today’s grid' })}
                </h2>
                <GridRow g={data.daily} tag={t('daily', { defaultValue: 'Daily' })} />
              </section>
            ) : null}
            {list(t('top-rated', { defaultValue: 'Top rated' }), data.top)}
            {list(t('newest', { defaultValue: 'Newest' }), data.recent)}
            {!data.recent.length ? (
              <EmptyState
                description={t('no-grids', { defaultValue: 'No grids yet. Make the first one.' })}
              />
            ) : null}
          </>
        )}
      </div>
    </PageLayout>
  );
}

export function ConnectionsNew() {
  const { t } = useTranslation('f-party');
  const session = useSession();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [groups, setGroups] = useState(() =>
    Array.from({ length: 4 }, () => ({ label: '', items: ['', '', '', ''] })),
  );
  const [busy, setBusy] = useState(false);

  const setLabel = (g: number, v: string) =>
    setGroups((gs) => gs.map((x, i) => (i === g ? { ...x, label: v } : x)));
  const setItem = (g: number, k: number, v: string) =>
    setGroups((gs) =>
      gs.map((x, i) => (i === g ? { ...x, items: x.items.map((y, j) => (j === k ? v : y)) } : x)),
    );

  const flat = groups.flatMap((g) => g.items.map((i) => i.trim().toLowerCase()));
  const filled = flat.every(Boolean) && groups.every((g) => g.label.trim().length >= 2);
  const unique = new Set(flat).size === 16;

  async function submit() {
    setBusy(true);
    const res = await fetch('/api/connections/grids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, groups }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      const { id } = (await res.json()) as { id: string };
      toast.success(t('grid-created', { defaultValue: 'Grid published.' }));
      void navigate({ to: '/connections/u/$id', params: { id } });
    } else {
      const err = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      toast.error(err.error ?? t('grid-failed', { defaultValue: 'Could not publish the grid.' }));
    }
  }

  if (!session.data?.user) {
    return (
      <PageLayout title={t('make-grid', { defaultValue: 'Make a grid' })}>
        <p className="px-4 text-sm text-site-text-muted">
          {t('grid-sign-in', { defaultValue: 'Sign in to make a grid.' })}
        </p>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={t('make-grid', { defaultValue: 'Make a grid' })}
      description={t('make-desc', {
        defaultValue:
          'Four groups, four items each, sixteen different items. Each group needs a label.',
      })}
    >
      <div className="space-y-4 px-4 pb-12">
        <input
          className={inputCls}
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('grid-title', { defaultValue: 'Grid title' })}
          aria-label={t('grid-title', { defaultValue: 'Grid title' })}
        />
        {groups.map((g, gi) => (
          <Card key={gi} className={cn('space-y-2 p-4', BAND[gi])}>
            <input
              className={inputCls}
              value={g.label}
              maxLength={40}
              onChange={(e) => setLabel(gi, e.target.value)}
              placeholder={t('group-label', { defaultValue: 'Group {{n}} label', n: gi + 1 })}
              aria-label={t('group-label', { defaultValue: 'Group {{n}} label', n: gi + 1 })}
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {g.items.map((it, k) => (
                <input
                  key={k}
                  className={inputCls}
                  value={it}
                  maxLength={30}
                  onChange={(e) => setItem(gi, k, e.target.value)}
                  aria-label={t('item-label', {
                    defaultValue: 'Group {{n}} item {{k}}',
                    n: gi + 1,
                    k: k + 1,
                  })}
                />
              ))}
            </div>
          </Card>
        ))}
        {filled && !unique ? (
          <p className="text-sm text-site-danger">
            {t('dupes', { defaultValue: 'Every one of the 16 items must be different.' })}
          </p>
        ) : null}
        <Button
          variant="accent"
          disabled={busy || title.trim().length < 3 || !filled || !unique}
          onClick={() => void submit()}
        >
          {t('publish-grid', { defaultValue: 'Publish grid' })}
        </Button>
      </div>
    </PageLayout>
  );
}

export function ConnectionsPlay({ id }: { id: string }) {
  const { t } = useTranslation('f-party');
  const session = useSession();
  const signedIn = !!session.data?.user;
  const isAdmin = !!(session.data?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [grid, setGrid] = useState<GridPlayView | null>(null);
  const [missing, setMissing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [date, setDate] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/connections/grids/${id}`).catch(() => null);
    if (res?.ok) setGrid(((await res.json()) as { grid: GridPlayView }).grid);
    else setMissing(true);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load, signedIn]);

  if (missing) {
    return (
      <PageLayout title={t('conn-title', { defaultValue: 'Connections grids' })}>
        <EmptyState
          description={t('grid-missing', { defaultValue: 'That grid does not exist.' })}
        />
      </PageLayout>
    );
  }
  if (!grid) {
    return (
      <PageLayout title={t('conn-title', { defaultValue: 'Connections grids' })}>
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </PageLayout>
    );
  }

  const done = grid.status !== 'active';
  const solvedItems = new Set(grid.found.flatMap((f) => f.items));
  const remaining = grid.items.filter((i) => !solvedItems.has(i));
  const canPlay = signedIn && !grid.isAuthor && !done;

  async function guess() {
    const res = await fetch(`/api/connections/grids/${id}/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: picked }),
    }).catch(() => null);
    if (!res?.ok) {
      const err = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      toast.error(err.error ?? t('guess-failed', { defaultValue: 'Could not check that guess.' }));
      return;
    }
    const r = (await res.json()) as { correct: boolean; oneAway: boolean };
    setMsg(
      r.correct
        ? null
        : r.oneAway
          ? t('one-away', { defaultValue: 'One away!' })
          : t('not-a-group', { defaultValue: 'Not a group.' }),
    );
    setPicked([]);
    await load();
  }

  async function rate(n: number) {
    const res = await fetch(`/api/connections/grids/${id}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: n }),
    }).catch(() => null);
    if (res?.ok) {
      toast.success(t('rated', { defaultValue: 'Thanks for rating.' }));
      await load();
    }
  }

  async function schedule(d: string | null) {
    const res = await fetch(`/api/connections/grids/${id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: d }),
    }).catch(() => null);
    if (res?.ok) {
      toast.success(
        d
          ? t('scheduled', { defaultValue: 'Scheduled as the daily for {{d}}.', d })
          : t('unscheduled', { defaultValue: 'Daily cleared.' }),
      );
      await load();
    } else toast.error(t('schedule-failed', { defaultValue: 'Could not schedule (past date?).' }));
  }

  async function remove() {
    if (
      !(await confirm({
        title: t('delete-grid', { defaultValue: 'Delete this grid?' }),
        danger: true,
      }))
    )
      return;
    const res = await fetch(`/api/connections/grids/${id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) void navigate({ to: '/connections' });
  }

  async function share() {
    const text = shareText(grid!.title, grid!, window.location.href);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('copied', { defaultValue: 'Result copied' }));
    } catch {
      window.prompt(t('copy-result', { defaultValue: 'Copy your result:' }), text);
    }
  }

  const toggle = (item: string) =>
    setPicked((p) =>
      p.includes(item) ? p.filter((x) => x !== item) : p.length < 4 ? [...p, item] : p,
    );
  const revealRest: GridGroup[] =
    done && grid.solution
      ? grid.solution.filter((g) => !grid.found.some((f) => f.label === g.label))
      : [];

  return (
    <PageLayout
      title={grid.title}
      description={t('by-author', {
        defaultValue: 'By {{author}}',
        author: grid.author?.name ?? grid.author?.handle ?? '?',
      })}
    >
      <div className="mx-auto max-w-2xl space-y-4 px-4 pb-12">
        {grid.dailyDate ? (
          <p className="text-sm font-semibold text-site-accent">
            {t('daily-on', { defaultValue: 'Daily grid for {{d}}', d: grid.dailyDate })}
          </p>
        ) : null}
        <div className="space-y-2">
          {grid.found.map((f) => (
            <div key={f.index} className={cn('rounded-site p-3 text-center', BAND[f.index % 4])}>
              <p className="text-xs font-bold uppercase text-site-text">{f.label}</p>
              <p className="text-sm text-site-text">{f.items.join(', ')}</p>
            </div>
          ))}
          {revealRest.map((g, i) => (
            <div
              key={g.label}
              className={cn(
                'rounded-site p-3 text-center opacity-70',
                BAND[(grid.found.length + i) % 4],
              )}
            >
              <p className="text-xs font-bold uppercase text-site-text">{g.label}</p>
              <p className="text-sm text-site-text">{g.items.join(', ')}</p>
            </div>
          ))}
        </div>

        {!done ? (
          <div className="grid grid-cols-4 gap-2">
            {remaining.map((item) => (
              <button
                key={item}
                type="button"
                disabled={!canPlay}
                aria-pressed={picked.includes(item)}
                onClick={() => toggle(item)}
                className={cn(
                  'glass-fill min-h-14 break-words rounded-site px-1 py-2 text-xs font-semibold text-site-text transition-colors disabled:opacity-60 sm:text-sm',
                  picked.includes(item) && 'bg-site-accent text-site-accent-fg',
                )}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}

        {canPlay ? (
          <div className="space-y-2">
            <p className="text-center text-sm text-site-text-muted" aria-live="polite">
              {t('mistakes-left', {
                defaultValue: 'Mistakes left: {{n}}',
                n: MAX_MISTAKES - grid.mistakes,
              })}
              {msg ? ` · ${msg}` : ''}
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" disabled={!picked.length} onClick={() => setPicked([])}>
                {t('deselect', { defaultValue: 'Deselect' })}
              </Button>
              <Button variant="accent" disabled={picked.length !== 4} onClick={() => void guess()}>
                {t('submit-guess', { defaultValue: 'Submit' })}
              </Button>
            </div>
          </div>
        ) : null}
        {!signedIn ? (
          <p className="text-center text-sm text-site-text-muted">
            {t('play-sign-in', { defaultValue: 'Sign in to play this grid.' })}
          </p>
        ) : null}
        {grid.isAuthor ? (
          <p className="text-center text-sm text-site-text-muted">
            {t('your-grid', {
              defaultValue: 'Your grid: {{plays}} plays, {{solve}} solved.',
              plays: grid.plays,
              solve: grid.solveRate == null ? '-' : `${grid.solveRate}%`,
            })}
          </p>
        ) : null}

        {done ? (
          <Card className="space-y-3 p-4 text-center">
            <p className="font-semibold text-site-text">
              {grid.status === 'solved'
                ? t('solved', { defaultValue: 'Solved!' })
                : t('failed', { defaultValue: 'Out of mistakes.' })}
            </p>
            <div
              className="flex flex-wrap items-center justify-center gap-1"
              role="group"
              aria-label={t('rate', { defaultValue: 'Rate this grid' })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <Button
                  key={n}
                  size="icon-sm"
                  variant={(grid.myRating ?? 0) >= n ? 'accent' : 'outline'}
                  onClick={() => void rate(n)}
                  aria-label={t('stars', { defaultValue: '{{n}} stars', n })}
                >
                  <Star aria-hidden />
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={() => void share()}>
                <Share2 aria-hidden />
                {t('share', { defaultValue: 'Share' })}
              </Button>
            </div>
          </Card>
        ) : null}

        {grid.rating != null ? (
          <p className="text-center text-xs text-site-text-muted">
            {t('stats-line', {
              defaultValue: '{{rating}} stars from {{n}} ratings · {{plays}} plays',
              rating: grid.rating,
              n: grid.ratingCount,
              plays: grid.plays,
            })}
          </p>
        ) : null}

        {isAdmin ? (
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <input
              type="date"
              className={cn(inputCls, 'w-auto')}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label={t('daily-date', { defaultValue: 'Daily date (UTC)' })}
            />
            <Button size="sm" variant="accent" disabled={!date} onClick={() => void schedule(date)}>
              {t('schedule-daily', { defaultValue: 'Schedule as daily' })}
            </Button>
            {grid.dailyDate ? (
              <Button size="sm" variant="outline" onClick={() => void schedule(null)}>
                {t('clear-daily', { defaultValue: 'Clear daily' })}
              </Button>
            ) : null}
          </Card>
        ) : null}
        {grid.isAuthor || isAdmin ? (
          <div className="text-center">
            <Button size="sm" variant="ghost" onClick={() => void remove()}>
              <Trash2 aria-hidden />
              {t('delete', { defaultValue: 'Delete' })}
            </Button>
          </div>
        ) : null}
      </div>
    </PageLayout>
  );
}
