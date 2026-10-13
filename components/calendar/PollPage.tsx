'use client';

/** K1 — `/when/$id`: respond to a poll, see the heat map, and (organiser) lock in a time. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  CalendarCheck,
  Check,
  Download,
  Link as LinkIcon,
  Lock,
  Trash2,
  Users,
} from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { EmptyState } from '@/components/ui/empty-state';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Select } from '@/components/ui/select';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { UserAvatar } from '@/components/ui/UserAvatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SITE_URL } from '@/lib/seo';
import {
  rankPoll,
  pollSlotStarts,
  emptyAnswers,
  type PollRespondent,
} from '@/lib/calendar/poll-slots';
import type { PollView } from '@/lib/calendar/types';
import type { Run, SlotScore } from '@/lib/schedule/availability';
import { api, viewerTimeZone } from './api';
import { PollGrid, type SlotHeat } from './PollGrid';

type Tab = 'mine' | 'group';

/** Relative strength of each slot, for the heat map. */
function toHeat(scores: SlotScore[]): SlotHeat[] {
  const max = scores.reduce((m, s) => Math.max(m, s.score), 0);
  return scores.map((s) => ({ yes: s.yes, maybe: s.maybe, frac: max > 0 ? s.score / max : 0 }));
}

export default function PollPage({ id }: { id: string }) {
  const { t, i18n } = useTranslation('f-calendar');
  const { data: session, isPending } = useSession();
  const [poll, setPoll] = useState<PollView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [tab, setTab] = useState<Tab>('mine');
  const [brush, setBrush] = useState<1 | 2>(1);
  const [dragToPaint, setDragToPaint] = useState(false);
  const [mine, setMine] = useState<string>('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [selected, setSelected] = useState<number | null>(null);
  const [lockRun, setLockRun] = useState<Run | null>(null);
  const [gridKey, setGridKey] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tz = useMemo(() => viewerTimeZone(), []);
  const signedIn = !!session?.user;
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const res = await api<{ poll: PollView }>(`/api/when/${encodeURIComponent(id)}`);
    if (res.ok && res.data) {
      setPoll(res.data.poll);
      setMine(
        res.data.poll.viewer.answers ?? emptyAnswers(pollSlotStarts(res.data.poll.params).length),
      );
      setGridKey((k) => k + 1);
      setState('ready');
    } else if (res.status === 404) setState('missing');
    else if (res.status !== 401) setState('error');
  }, [id]);

  useEffect(() => {
    if (!isPending && signedIn) void load();
  }, [isPending, signedIn, load]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const params = poll?.params;
  const starts = useMemo(() => (params ? pollSlotStarts(params) : []), [params]);
  const userId = session?.user?.id;

  // Everyone else's answers; the viewer's live answers are layered on top.
  const others = useMemo<PollRespondent[]>(
    () =>
      (poll?.respondents ?? [])
        .filter((r) => r.user.id !== userId)
        .map((r) => ({ userId: r.user.id, answers: r.answers, required: r.required })),
    [poll, userId],
  );
  const requiredPending = useMemo(() => poll?.pending.map((p) => p.id) ?? [], [poll]);
  const viewerRequired = useMemo(
    () =>
      !!poll?.respondents.find((r) => r.user.id === userId)?.required ||
      !!poll?.pending.some((p) => p.id === userId),
    [poll, userId],
  );

  const everyone = useMemo(() => {
    if (!poll || !userId) return [];
    const hasAnswers = mine.includes('1') || mine.includes('2');
    const all = [...others];
    if (hasAnswers) all.push({ userId, answers: mine, required: viewerRequired });
    return all;
  }, [poll, others, mine, userId, viewerRequired]);
  const pendingNow = useMemo(
    () =>
      mine.includes('1') || mine.includes('2')
        ? requiredPending.filter((p) => p !== userId)
        : requiredPending,
    [requiredPending, mine, userId],
  );

  const ranked = useMemo(
    () => (params ? rankPoll(params, everyone, pendingNow, { limit: 5 }) : { heat: [], runs: [] }),
    [params, everyone, pendingNow],
  );
  const othersHeat = useMemo(
    () => (params ? rankPoll(params, others, requiredPending, { limit: 1 }).heat : []),
    [params, others, requiredPending],
  );

  const groupHeat = useMemo(() => toHeat(ranked.heat), [ranked.heat]);
  const faintHeat = useMemo(() => toHeat(othersHeat), [othersHeat]);

  const top = ranked.runs[0];
  const highlight = useMemo(() => {
    const out = new Set<number>();
    if (!top) return out;
    starts.forEach((s, i) => {
      if (s >= top.startMin && s < top.endMin) out.add(i);
    });
    return out;
  }, [top, starts]);
  const lockedSlots = useMemo(() => {
    const out = new Set<number>();
    if (poll?.lockedStartMin == null || poll.lockedEndMin == null) return out;
    starts.forEach((s, i) => {
      if (s >= (poll.lockedStartMin as number) && s < (poll.lockedEndMin as number)) out.add(i);
    });
    return out;
  }, [poll, starts]);

  const onCommit = useCallback(
    (answers: string) => {
      setMine(answers);
      setSaving('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const res = await api(`/api/when/${encodeURIComponent(id)}/respond`, {
          method: 'PUT',
          body: { answers },
        });
        if (res.ok) setSaving('saved');
        else {
          setSaving('error');
          toast.error(
            res.error ?? t('save-failed', { defaultValue: 'Could not save your answers.' }),
          );
        }
      }, 700);
    },
    [id, t],
  );

  const fmtRange = useCallback(
    (startMin: number, endMin: number) => {
      const day = new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: tz,
      });
      const time = new Intl.DateTimeFormat(i18n.language, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: tz,
        timeZoneName: 'short',
      });
      const s = new Date(startMin * 60_000);
      const e = new Date(endMin * 60_000);
      return `${day.format(s)}, ${time.format(s)} – ${time.format(e)}`;
    },
    [i18n.language, tz],
  );

  if (isPending || (signedIn && state === 'loading')) {
    return (
      <div className="space-y-3 p-4" aria-busy>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!signedIn) {
    return (
      <SignedOutPrompt
        icon={CalendarCheck}
        title={t('signed-out-title', { defaultValue: 'Sign in to answer this poll' })}
        description={t('signed-out-body', {
          defaultValue: 'Pick the times you can make and the organiser sees when everyone is free.',
        })}
        callbackURL={`/when/${id}`}
      />
    );
  }
  if (state === 'missing') {
    return (
      <EmptyState
        icon={CalendarCheck}
        title={t('poll-missing-title', { defaultValue: 'Poll not found' })}
        description={t('poll-missing-body', {
          defaultValue: 'It may have been deleted by its organiser.',
        })}
        action={
          <Link to="/when">
            <Button variant="accent">
              {t('poll-missing-cta', { defaultValue: 'Your polls' })}
            </Button>
          </Link>
        }
      />
    );
  }
  if (state === 'error' || !poll || !params) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title={t('poll-error', { defaultValue: 'Could not load this poll just now.' })}
        action={
          <Button onClick={() => void load()}>{t('retry', { defaultValue: 'Try again' })}</Button>
        }
      />
    );
  }

  const locked = poll.lockedStartMin != null && poll.lockedEndMin != null;
  const shareUrl = `${SITE_URL}/when/${poll.id}`;
  const selectedPeople =
    selected != null
      ? poll.respondents.flatMap((r) => {
          const c = r.user.id === userId ? mine[selected] : r.answers[selected];
          return c === '1' || c === '2' ? [{ user: r.user, maybe: c === '2' }] : [];
        })
      : [];
  const viewerOnList = poll.respondents.some((r) => r.user.id === userId);
  const people = [
    ...poll.respondents.filter((r) => r.user.id !== userId),
    ...(mine.includes('1') || mine.includes('2') || viewerOnList
      ? [
          {
            user: {
              id: userId ?? '',
              name: session?.user?.name ?? null,
              handle: null,
              image: session?.user?.image ?? null,
            },
            answers: mine,
            required: viewerRequired,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <h2 className="font-display text-xl font-medium text-site-text">{poll.title}</h2>
        {poll.description && (
          <p className="whitespace-pre-wrap text-sm text-site-text-muted">{poll.description}</p>
        )}
        <p className="text-xs text-site-text-dim">
          {t('poll-by', {
            defaultValue: 'Organised by {{name}}',
            name: poll.creator.name ?? poll.creator.handle ?? '',
          })}
          {poll.communityName
            ? ` · ${t('poll-community', { defaultValue: 'for {{name}}', name: poll.communityName })}`
            : ''}
        </p>
        <p className="text-xs text-site-text-dim">
          {t('poll-tz', { defaultValue: 'Times are shown in your timezone ({{tz}}).', tz })}
        </p>
      </header>

      {locked && (
        <section className="glass-pane flex flex-wrap items-center justify-between gap-3 rounded-site p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-site-text-muted">
              <Lock className="size-3.5" aria-hidden />
              {t('locked-label', { defaultValue: 'Locked in' })}
            </p>
            <p className="mt-1 text-base font-bold text-site-text">
              {fmtRange(poll.lockedStartMin as number, poll.lockedEndMin as number)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/when/${poll.id}/ics`} download>
              <Button variant="accent" size="sm">
                <Download /> {t('locked-ics', { defaultValue: 'Add to calendar' })}
              </Button>
            </a>
            {poll.lockedEventId && (
              <Link to="/communities" search={{ tab: 'events' }}>
                <Button variant="outline" size="sm">
                  {t('locked-event', { defaultValue: 'See the event' })}
                </Button>
              </Link>
            )}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <LiquidTabs
          tabs={[
            { id: 'mine', label: t('tab-mine', { defaultValue: 'Your availability' }) },
            { id: 'group', label: t('tab-group', { defaultValue: 'Group' }) },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          aria-label={t('tabs-label', { defaultValue: 'Poll view' })}
        />
        <CopyButton
          value={shareUrl}
          icon={LinkIcon}
          variant="outline"
          size="sm"
          label={t('share', { defaultValue: 'Copy link' })}
        >
          {t('share', { defaultValue: 'Copy link' })}
        </CopyButton>
      </div>

      {tab === 'mine' && !locked && (
        <div className="glass-fill flex flex-wrap items-center gap-x-5 gap-y-3 rounded-site p-3">
          <LiquidTabs
            tabs={[
              { id: '1', label: t('brush-yes', { defaultValue: 'Available' }), icon: Check },
              { id: '2', label: t('brush-maybe', { defaultValue: 'If need be' }) },
            ]}
            value={String(brush)}
            onChange={(v) => setBrush(v === '2' ? 2 : 1)}
            size="sm"
            aria-label={t('brush-label', { defaultValue: 'Brush' })}
          />
          <label className="flex items-center gap-2 text-sm text-site-text-muted">
            <Switch
              checked={dragToPaint}
              onCheckedChange={setDragToPaint}
              aria-label={t('drag-paint', { defaultValue: 'Drag to paint on touch screens' })}
            />
            {t('drag-paint', { defaultValue: 'Drag to paint on touch screens' })}
          </label>
          <p className="text-xs text-site-text-dim" aria-live="polite">
            {saving === 'saving' && t('saving', { defaultValue: 'Saving…' })}
            {saving === 'saved' && t('saved', { defaultValue: 'Saved' })}
            {saving === 'error' && t('save-error', { defaultValue: 'Not saved' })}
          </p>
        </div>
      )}
      {tab === 'mine' && !locked && (
        <p className="text-xs text-site-text-dim">
          {t('grid-help', {
            defaultValue:
              'Press and drag to paint the times you can make. Keyboard: arrows to move, Space to paint, Shift+arrows to paint as you go.',
          })}
        </p>
      )}

      <PollGrid
        key={`${gridKey}-${tab}`}
        starts={starts}
        slotMin={params.slotMin}
        viewerTz={tz}
        locale={i18n.language}
        mode={tab === 'mine' ? 'paint' : 'view'}
        initial={mine}
        brush={brush}
        dragToPaint={dragToPaint}
        disabled={locked}
        heat={tab === 'mine' ? faintHeat : groupHeat}
        highlight={tab === 'group' && !locked ? highlight : undefined}
        lockedSlots={lockedSlots}
        onCommit={onCommit}
        onActivate={setSelected}
      />

      {tab === 'group' && selected != null && (
        <section className="glass-fill rounded-site p-3" aria-live="polite">
          <h3 className="text-sm font-bold text-site-text">
            {new Intl.DateTimeFormat(i18n.language, {
              weekday: 'long',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: tz,
            }).format(new Date(starts[selected] * 60_000))}
          </h3>
          {selectedPeople.length === 0 ? (
            <p className="mt-1 text-sm text-site-text-muted">
              {t('slot-nobody', { defaultValue: 'Nobody has marked this time.' })}
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {selectedPeople.map((p) => (
                <li key={p.user.id} className="flex items-center gap-1.5 text-sm text-site-text">
                  <UserAvatar src={p.user.image} alt="" size={20} />
                  {p.user.name ?? p.user.handle}
                  {p.maybe ? (
                    <span className="text-xs text-site-text-dim">
                      ({t('slot-maybe', { defaultValue: 'if need be' })})
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-2" aria-labelledby="poll-shortlist">
        <h3 id="poll-shortlist" className="text-sm font-bold text-site-text">
          {t('shortlist-title', { defaultValue: 'Best times' })}
        </h3>
        {ranked.runs.length === 0 ? (
          <p className="text-sm text-site-text-muted">
            {requiredPending.length > 0 || poll.pending.length > 0
              ? t('shortlist-waiting', {
                  defaultValue: 'No time works for every required person yet.',
                })
              : t('shortlist-empty', { defaultValue: 'No times yet. Mark when you are free.' })}
          </p>
        ) : (
          <ol className="space-y-2">
            {ranked.runs.map((run, i) => (
              <li
                key={run.startMin}
                className="glass-fill flex flex-wrap items-center justify-between gap-3 rounded-site p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-site-text">
                    <span className="mr-2 text-site-text-dim tabular-nums">{i + 1}.</span>
                    {fmtRange(run.startMin, run.endMin)}
                  </p>
                  <p className="text-xs text-site-text-muted">
                    {run.maybe > 0
                      ? t('run-score-maybe', {
                          defaultValue:
                            '{{score}} available at the weakest point, up to {{maybe}} if need be',
                          score: run.score,
                          maybe: run.maybe,
                        })
                      : t('run-score', {
                          defaultValue: '{{score}} available at the weakest point',
                          score: run.score,
                        })}
                  </p>
                </div>
                {poll.viewer.canLock && (
                  <Button size="sm" variant="accent" onClick={() => setLockRun(run)}>
                    <Lock /> {t('lock-in', { defaultValue: 'Lock in' })}
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="poll-people">
        <h3 id="poll-people" className="flex items-center gap-1.5 text-sm font-bold text-site-text">
          <Users className="size-4" aria-hidden />
          {t('people-title', { defaultValue: 'Responses' })} ({people.length})
        </h3>
        <ul className="flex flex-wrap gap-2">
          {people.map((r) => (
            <li
              key={r.user.id}
              className="glass-fill flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm text-site-text"
            >
              <UserAvatar src={r.user.image} alt="" size={22} />
              {r.user.name ?? r.user.handle}
              {r.required && (
                <span className="text-xs text-site-text-dim">
                  {t('required-tag', { defaultValue: 'required' })}
                </span>
              )}
            </li>
          ))}
          {pendingNow.map((pid) => {
            const p = poll.pending.find((x) => x.id === pid);
            if (!p) return null;
            return (
              <li
                key={pid}
                className="flex items-center gap-1.5 rounded-full border border-dashed border-site-border py-1 pl-1 pr-3 text-sm text-site-text-muted"
              >
                <UserAvatar src={p.image} alt="" size={22} />
                {p.name ?? p.handle} · {t('awaiting', { defaultValue: 'waiting for them' })}
              </li>
            );
          })}
        </ul>
      </section>

      {poll.viewer.isCreator && (
        <div className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const sure = await confirm({
                title: t('delete-confirm', { defaultValue: 'Delete this poll?' }),
                description: t('delete-confirm-body', {
                  defaultValue: "Everyone's answers are deleted with it.",
                }),
                confirmLabel: t('delete-poll', { defaultValue: 'Delete poll' }),
                danger: true,
              });
              if (!sure) return;
              const res = await api(`/api/when/${poll.id}`, { method: 'DELETE' });
              if (res.ok) window.location.assign('/when');
              else toast.error(t('delete-failed', { defaultValue: 'Could not delete the poll.' }));
            }}
          >
            <Trash2 /> {t('delete-poll', { defaultValue: 'Delete poll' })}
          </Button>
        </div>
      )}

      {lockRun && (
        <LockDialog
          poll={poll}
          run={lockRun}
          fmtRange={fmtRange}
          onClose={() => setLockRun(null)}
          onLocked={() => {
            setLockRun(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function LockDialog({
  poll,
  run,
  fmtRange,
  onClose,
  onLocked,
}: {
  poll: PollView;
  run: Run;
  fmtRange: (a: number, b: number) => string;
  onClose: () => void;
  onLocked: () => void;
}) {
  const { t, i18n } = useTranslation('f-calendar');
  const slot = poll.params.slotMin;
  const slots = (run.endMin - run.startMin) / slot;
  const [startIdx, setStartIdx] = useState(0);
  const [len, setLen] = useState(Math.min(slots, Math.max(1, Math.round(60 / slot))));
  const [busy, setBusy] = useState(false);
  const maxLen = slots - startIdx;
  const effLen = Math.min(len, maxLen);
  const startMin = run.startMin + startIdx * slot;
  const endMin = startMin + effLen * slot;

  const timeFmt = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: viewerTimeZone(),
  });

  const confirm = async () => {
    setBusy(true);
    const res = await api<{ eventId: string | null; notified: number }>(
      `/api/when/${poll.id}/lock`,
      {
        method: 'POST',
        body: { startMin, endMin },
      },
    );
    setBusy(false);
    if (res.ok) {
      toast.success(t('lock-done', { defaultValue: 'Locked in. Everyone has been told.' }));
      onLocked();
    } else {
      toast.error(res.error ?? t('lock-failed', { defaultValue: 'Could not lock in that time.' }));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('lock-title', { defaultValue: 'Lock in a time' })}</DialogTitle>
          <DialogDescription>
            {poll.communityId
              ? t('lock-desc-community', {
                  defaultValue:
                    'This creates a community event and notifies everyone who answered.',
                })
              : t('lock-desc', {
                  defaultValue:
                    'Everyone who answered is notified and can download a calendar file.',
                })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm text-site-text">
            {t('lock-start', { defaultValue: 'Starts at' })}
            <Select value={String(startIdx)} onChange={(e) => setStartIdx(Number(e.target.value))}>
              {Array.from({ length: slots }, (_, i) => (
                <option key={i} value={i}>
                  {timeFmt.format(new Date((run.startMin + i * slot) * 60_000))}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1 text-sm text-site-text">
            {t('lock-length', { defaultValue: 'Length' })}
            <Select value={String(effLen)} onChange={(e) => setLen(Number(e.target.value))}>
              {Array.from({ length: maxLen }, (_, i) => (
                <option key={i} value={i + 1}>
                  {t('lock-minutes', { defaultValue: '{{count}} minutes', count: (i + 1) * slot })}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-sm font-semibold text-site-text">{fmtRange(startMin, endMin)}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button variant="accent" onClick={confirm} disabled={busy}>
            <Lock /> {t('lock-in', { defaultValue: 'Lock in' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
