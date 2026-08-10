'use client';

/**
 * `/pf2ecal` — the whole board.
 *
 * Layout: a month grid and the side panels on wide screens, a single column on
 * a phone with the agenda first. The agenda is the primary surface either way,
 * because the question the page answers is "when is the next one and who's
 * coming", not "what does August look like".
 *
 * Behaviour on a bad connection is designed for, not left to chance:
 *   • the route loader server-renders the board, so the first paint is real
 *     content rather than a spinner even before any JS arrives;
 *   • every write applies to the cache first and rolls back on failure
 *     (`state.ts`), so a tap on two bars is acknowledged in the same frame;
 *   • a failed load keeps whatever was last cached on screen with a retry,
 *     rather than replacing a readable page with an error;
 *   • going offline says so, instead of leaving "that did not save" unexplained.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { CalendarPlus, RefreshCw, Settings2, WifiOff } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';
import { useIdleReady } from '@/hooks/useIdleReady';
import type { Availability, CalendarStateDTO, Session, SessionDTO } from '@/lib/pf2ecal/types';
import { toSession } from '@/lib/pf2ecal/types';
import { zonedDateKey } from '@/lib/pf2ecal/zoned-time';
import { Announcements } from './Announcements';
import {
  MonthGridSkeleton,
  PanelSkeleton,
  SessionCardSkeleton,
  StatusLine,
  useBoardStatus,
} from './Loading';
import { MonthGrid } from './MonthGrid';
import { NextUp } from './NextUp';
import { SessionCard } from './SessionCard';
import { SubscribePanel } from './SubscribePanel';
import { ThemeToggle } from './ThemeToggle';
import { formatMonthLabel } from './format';
import {
  api,
  applyOwnResponse,
  removeAnnouncement,
  removeSession,
  replaceAnnouncement,
  replaceSession,
  replaceSettings,
  useCalendarBoard,
  useCalendarMutation,
  useLocalTimeZone,
  useNow,
  useOnline,
  useProgressiveList,
  useSessionBlurbs,
} from './state';
import './pf2ecal.css';
import { EASE } from './motion';

/**
 * Everything below is behind a `lazy()` boundary because none of it is needed to
 * READ the calendar, which is what nearly every visit is.
 *
 * Together they are the page's three heaviest imports — Radix's dialog, the
 * session editor, the settings form and the assistant's transcript — and none of
 * them renders a pixel until someone taps something. Each is mounted on its
 * first open and then stays mounted, so the exit animation still has a component
 * to play — and the chunks are warmed once the browser goes idle, so the first
 * tap is not waiting on the network either.
 */
const SessionSheet = lazy(() =>
  import('./SessionSheet').then((m) => ({ default: m.SessionSheet })),
);
const CreateSheet = lazy(() => import('./CreateSheet').then((m) => ({ default: m.CreateSheet })));
const SettingsSheet = lazy(() =>
  import('./SettingsSheet').then((m) => ({ default: m.SettingsSheet })),
);
const Assistant = lazy(() => import('./Assistant').then((m) => ({ default: m.Assistant })));

/** Latches true the first time its argument is, and never goes back. */
function useOnceTrue(value: boolean): boolean {
  const [seen, setSeen] = useState(value);
  useEffect(() => {
    if (value) setSeen(true);
  }, [value]);
  return seen || value;
}

export function Pf2eCalendar({ initialState }: { initialState: CalendarStateDTO }) {
  const { t } = useTranslation('r-pf2ecal');
  const { data, isPending, isError, refetch, isFetching } = useCalendarBoard();
  // The loader already server-rendered a board, so `initialState` is real data
  // and not a placeholder — the skeleton paths below only run when the client
  // navigated in without one (a soft nav that raced the loader) or the cache
  // was dropped.
  const board = data ?? initialState;
  const awaitingFirstData = isPending && !data && initialState.sessions.length === 0;
  const boardStatus = useBoardStatus(awaitingFirstData);
  const timeZone = useLocalTimeZone();
  const now = useNow();
  const online = useOnline();

  const sessions = useMemo(() => board.sessions.map(toSession), [board.sessions]);
  const viewerId = board.viewerId;

  /* ── Month navigation ─────────────────────────────────────────────────── */
  const [monthCursor, setMonthCursor] = useState(() => {
    const key = zonedDateKey(new Date(), 'America/New_York');
    const [year, month] = key.split('-').map(Number);
    return { year, month };
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const shiftMonth = useCallback((delta: number) => {
    setMonthCursor((current) => {
      const index = current.year * 12 + (current.month - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  }, []);

  const dayRefs = useRef(new Map<string, HTMLDivElement>());

  const jumpToDay = useCallback((dateKey: string) => {
    setSelectedKey(dateKey);
    const node = dayRefs.current.get(dateKey);
    // `block: 'center'` rather than 'start': the agenda has sticky-ish
    // context above it and a start-aligned scroll hides the day heading
    // behind it on a phone.
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  /* ── Sheets ───────────────────────────────────────────────────────────── */
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const openSession = openSessionId ? (sessions.find((s) => s.id === openSessionId) ?? null) : null;

  /* ── Mutations ────────────────────────────────────────────────────────── */
  // Tracks which rows have a write in flight, so exactly those rows dim rather
  // than the whole list going grey on every tap.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const markBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const respond = useCalendarMutation<
    { session: Session; status: Availability | null; note: string | null },
    { session: SessionDTO }
  >({
    send: ({ session, status, note }) =>
      status === null ? api.clearResponse(session.id) : api.respond(session.id, { status, note }),
    optimistic: ({ session, status, note }) =>
      applyOwnResponse(session.id, viewerId ?? '', board.viewerName ?? 'You', status, note),
    settle: (data) => replaceSession(data.session),
  });

  const createSession = useCalendarMutation<Record<string, unknown>, { session: SessionDTO }>({
    send: (payload) => api.createSession(payload),
    settle: (data) => replaceSession(data.session),
    successMessage: t('toast-session-added', { defaultValue: 'Session added' }),
  });

  const updateSession = useCalendarMutation<
    { id: string; payload: Record<string, unknown> },
    { session: SessionDTO }
  >({
    send: ({ id, payload }) => api.updateSession(id, payload),
    settle: (data) => replaceSession(data.session),
    successMessage: t('toast-saved', { defaultValue: 'Saved' }),
  });

  const deleteSession = useCalendarMutation<{ id: string }, { deleted: boolean }>({
    send: ({ id }) => api.deleteSession(id),
    optimistic: ({ id }) => removeSession(id),
    successMessage: t('toast-session-removed', { defaultValue: 'Session removed' }),
  });

  const postAnnouncement = useCalendarMutation<
    { body: string; pinned: boolean },
    { announcement: CalendarStateDTO['announcements'][number] }
  >({
    send: (payload) => api.createAnnouncement(payload),
    settle: (data) => replaceAnnouncement(data.announcement),
  });

  const patchAnnouncement = useCalendarMutation<
    { id: string; pinned: boolean; current: CalendarStateDTO['announcements'][number] },
    { ok: true }
  >({
    send: ({ id, pinned }) => api.updateAnnouncement(id, { pinned }),
    optimistic: ({ current, pinned }) => replaceAnnouncement({ ...current, pinned }),
  });

  const dropAnnouncement = useCalendarMutation<{ id: string }, { deleted: boolean }>({
    send: ({ id }) => api.deleteAnnouncement(id),
    optimistic: ({ id }) => removeAnnouncement(id),
  });

  const saveSettings = useCalendarMutation<
    Record<string, unknown>,
    { settings: CalendarStateDTO['settings'] }
  >({
    send: (payload) => api.saveSettings(payload),
    settle: (data) => replaceSettings(data.settings),
    successMessage: t('toast-settings-saved', { defaultValue: 'Settings saved' }),
  });

  // Not a `useCalendarMutation`: it changes nothing on the board, so it wants
  // neither an optimistic patch nor the shared invalidation. It is a one-shot
  // side effect whose only output is a toast.
  const [testing, setTesting] = useState(false);
  const testWebhook = useCallback(
    (webhookUrl: string) => {
      setTesting(true);
      void api
        .testWebhook(webhookUrl)
        .then(() => toast.success(t('test-sent', { defaultValue: 'Sent — check the channel.' })))
        .catch((error: Error) => toast.error(error.message))
        .finally(() => setTesting(false));
    },
    [t],
  );

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Latched, so a sheet that has been opened once stays in the tree and keeps
  // its exit animation. See the `lazy()` block at the top of the file.
  const sessionSheetUsed = useOnceTrue(Boolean(openSessionId));
  const createSheetUsed = useOnceTrue(creating);
  const settingsSheetUsed = useOnceTrue(settingsOpen);

  const handleRespond = useCallback(
    (session: Session, status: Availability | null, note: string | null = null) => {
      if (!viewerId) return;
      markBusy(session.id, true);
      respond.mutate({ session, status, note }, { onSettled: () => markBusy(session.id, false) });
    },
    [markBusy, respond, viewerId],
  );

  /* ── Agenda grouping ──────────────────────────────────────────────────── */
  // Upcoming first (that is what the page is for), with anything already
  // finished collapsed below it rather than dropped — the group looks back at
  // "when did we last play" often enough that hiding it entirely is wrong.
  const { upcoming, past } = useMemo(() => {
    const cutoff = now.getTime();
    return {
      upcoming: sessions.filter((s) => s.endsAt.getTime() >= cutoff),
      past: sessions.filter((s) => s.endsAt.getTime() < cutoff).reverse(),
    };
  }, [sessions, now]);

  const [showPast, setShowPast] = useState(false);

  // The phone-only "next session" card. A cancelled session is still listed in
  // the agenda — people need to see that it is off — but it is not what "next"
  // means, so the card skips past it to the next one that is actually on.
  const nextSession = useMemo(() => upcoming.find((s) => !s.canceledAt) ?? null, [upcoming]);

  /* ── Rendering a long board ───────────────────────────────────────────── */
  // The window holds six months, so a weekly game is ~26 upcoming rows before
  // anyone adds a one-off. Cards enter the DOM a page at a time as the end of
  // the list approaches, and `.pf2e-cull` keeps the ones that have scrolled away
  // from costing layout — see `useProgressiveList`.
  const {
    visible: visibleUpcoming,
    hidden: hiddenUpcoming,
    sentinelRef: upcomingSentinel,
  } = useProgressiveList(upcoming);
  const {
    visible: visiblePast,
    hidden: hiddenPast,
    sentinelRef: pastSentinel,
  } = useProgressiveList(showPast ? past : []);

  // Descriptions are fetched for the cards that are actually on screen, once the
  // browser is idle — never during hydration, where they would contend with the
  // board's own revalidation for the connection.
  const idleReady = useIdleReady();
  const describable = useMemo(
    () => [...visibleUpcoming, ...visiblePast].map((session) => session.id),
    [visibleUpcoming, visiblePast],
  );
  useSessionBlurbs(
    useMemo(
      () => board.sessions.filter((session) => describable.includes(session.id)),
      [board.sessions, describable],
    ),
    idleReady && !awaitingFirstData,
  );

  // Warm the split chunks once the board is up and the browser is idle, so the
  // first tap on "Add a session" opens a sheet rather than starting a download.
  // Failures are ignored on purpose: this is a head start, and the `lazy()`
  // boundary will fetch again — and show the error boundary — if it is real.
  useEffect(() => {
    if (!idleReady) return;
    void import('./SessionSheet').catch(() => {});
    void import('./CreateSheet').catch(() => {});
    void import('./SettingsSheet').catch(() => {});
  }, [idleReady]);

  const renderCard = (session: Session) => (
    <div
      key={session.id}
      // `pf2e-cull` is `content-visibility: auto`: a card that has scrolled out
      // of view stops costing layout and paint, while staying in the DOM for
      // find-in-page and for `scrollIntoView` when the month grid jumps to it.
      className="pf2e-cull"
      ref={(node) => {
        const key = zonedDateKey(session.startsAt, timeZone);
        if (node) dayRefs.current.set(key, node);
        else dayRefs.current.delete(key);
      }}
    >
      <SessionCard
        session={session}
        timeZone={timeZone}
        now={now}
        viewerId={viewerId}
        pending={busyIds.has(session.id)}
        onOpen={(s) => setOpenSessionId(s.id)}
        onRespond={(s, status) => handleRespond(s, status)}
      />
    </div>
  );

  return (
    <div className="pf2e">
      <div className="pf2e-shell pt-8 sm:pt-12">
        <header className="mb-6 sm:mb-8">
          <p className="pf2e-mono-label mb-2">{t('kicker', { defaultValue: 'Pathfinder 2e' })}</p>
          <h1 className="pf2e-display">
            {t('page-title', { defaultValue: 'The table\u2019s calendar' })}
          </h1>
          <p className="pf2e-body pf2e-muted mt-2 max-w-prose">
            {board.scheduleNote}.{' '}
            {t('page-lede', {
              defaultValue: 'Times below are in your timezone, with Central in parentheses.',
            })}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {viewerId ? (
              <button
                type="button"
                className="pf2e-btn pf2e-btn-primary"
                onClick={() => setCreating(true)}
              >
                <CalendarPlus size={16} aria-hidden />
                {t('add-a-session', { defaultValue: 'Add a session' })}
              </button>
            ) : (
              <Link
                to="/login"
                search={{ callbackURL: '/pf2ecal' }}
                className="pf2e-btn pf2e-btn-primary"
              >
                {t('sign-in-to-edit', { defaultValue: 'Sign in to edit' })}
              </Link>
            )}
            <button
              type="button"
              className="pf2e-btn pf2e-btn-ghost"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={16} aria-hidden />
              {t('settings', { defaultValue: 'Settings' })}
            </button>
            <button
              type="button"
              className="pf2e-btn pf2e-btn-ghost"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                size={15}
                aria-hidden
                className={isFetching ? 'animate-spin' : undefined}
              />
              {isFetching
                ? t('refreshing', { defaultValue: 'Refreshing…' })
                : t('refresh', { defaultValue: 'Refresh' })}
            </button>
            {/* Trailing on a wide screen, its own wrapped line on a phone —
                where `flex-wrap` puts it rather than squeezing the buttons. */}
            <div className="w-full sm:ms-auto sm:w-auto">
              <ThemeToggle />
            </div>
          </div>

          <AnimatePresence>
            {!online && (
              <motion.p
                className="pf2e-banner mt-4"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: EASE }}
                role="status"
              >
                <WifiOff size={15} aria-hidden />
                {t('offline-banner', {
                  defaultValue:
                    'You\u2019re offline. You can still read the schedule; changes won\u2019t save until you\u2019re back.',
                })}
              </motion.p>
            )}
          </AnimatePresence>

          {isError && (
            <p className="pf2e-banner mt-4" role="status">
              {t('load-failed', {
                defaultValue:
                  'Couldn\u2019t reach the server \u2014 showing the last version loaded.',
              })}{' '}
              <button type="button" className="underline" onClick={() => void refetch()}>
                {t('try-again', { defaultValue: 'Try again' })}
              </button>
            </p>
          )}

          {/* Escalating status for a slow first load. Silent under ~1s, so a
              fast connection never sees it flash. */}
          <div className="mt-3">
            <StatusLine message={boardStatus} />
          </div>
        </header>

        {/* The rail is FIRST in the DOM, and on a wide screen `order` moves it
            back to the right-hand column.

            That is the opposite of how this started, and the reason is the
            phone: stacked, the answer people opened the page for — what is on,
            when, and what is new — was below a full agenda they had to scroll
            past. The order asked for, and the order the DOM now has, is
            announcements → next session → month → subscribe → the full agenda.

            Two layouts cannot share one DOM order when they are deliberately
            different, so the mismatch lands on the desktop side: there, a
            keyboard user reaches the rail before the agenda that sits to its
            left. That is the cheaper of the two — the alternative put the jump
            on the phone, where it means tabbing past a screenful of agenda and
            back up again — and `<main>` / `<aside>` keep both reachable
            directly by landmark either way. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          {/* `order` inside the rail as well: the phone wants announcements
              first and the month grid third, the desktop rail wants the grid at
              the top where it has always been. The next-session card is the one
              piece that exists only on the phone — on a wide screen the agenda
              is already beside the grid and it would be the same fact twice. */}
          <aside className="pf2e-rail order-1 flex min-w-0 flex-col gap-6 lg:order-2">
            {awaitingFirstData ? (
              <>
                <div className="order-3 lg:order-1" data-rail="month">
                  <MonthGridSkeleton />
                </div>
                <div className="order-1 lg:order-2">
                  <PanelSkeleton rows={2} />
                </div>
                <div className="order-2 lg:hidden">
                  <PanelSkeleton rows={1} />
                </div>
                <div className="order-4 lg:order-3">
                  <PanelSkeleton rows={1} />
                </div>
              </>
            ) : (
              <>
                <div className="order-3 lg:order-1" data-rail="month">
                  <MonthGrid
                    year={monthCursor.year}
                    month={monthCursor.month}
                    sessions={sessions}
                    timeZone={timeZone}
                    now={now}
                    selectedKey={selectedKey}
                    onSelect={jumpToDay}
                    onShift={shiftMonth}
                    onToday={() => {
                      const key = zonedDateKey(new Date(), timeZone);
                      const [year, month] = key.split('-').map(Number);
                      setMonthCursor({ year, month });
                      jumpToDay(key);
                    }}
                  />
                </div>

                <div className="order-1 lg:order-2" data-rail="announcements">
                  <Announcements
                    announcements={board.announcements}
                    timeZone={timeZone}
                    canEdit={Boolean(viewerId)}
                    busyIds={busyIds}
                    posting={postAnnouncement.isPending}
                    onPost={(body, pinned) => postAnnouncement.mutate({ body, pinned })}
                    onTogglePin={(announcement) =>
                      patchAnnouncement.mutate({
                        id: announcement.id,
                        pinned: !announcement.pinned,
                        current: announcement,
                      })
                    }
                    onDelete={(announcement) => dropAnnouncement.mutate({ id: announcement.id })}
                  />
                </div>

                <div className="order-2 lg:hidden" data-rail="next">
                  <NextUp
                    session={nextSession}
                    timeZone={timeZone}
                    now={now}
                    onOpen={(session) => setOpenSessionId(session.id)}
                  />
                </div>

                <div className="order-4 lg:order-3" data-rail="subscribe">
                  <SubscribePanel feedUrl={board.feedUrl} scheduleNote={board.scheduleNote} />
                </div>
              </>
            )}

            <p className="pf2e-caption order-5 lg:order-4">
              {t('showing-month', {
                defaultValue: 'Showing {{month}}.',
                month: formatMonthLabel(monthCursor.year, monthCursor.month),
              })}{' '}
              {t('unlisted-note', {
                defaultValue:
                  'This page is unlisted \u2014 anyone with the link can read it, and anyone signed in can edit.',
              })}
            </p>
          </aside>

          <main className="order-2 flex min-w-0 flex-col gap-6 lg:order-1">
            <section aria-label={t('upcoming-sessions', { defaultValue: 'Upcoming sessions' })}>
              <h2 className="pf2e-mono-label mb-3">
                {t('upcoming', { defaultValue: 'Upcoming' })}
              </h2>
              {awaitingFirstData ? (
                <div className="flex flex-col gap-3">
                  <SessionCardSkeleton />
                  <SessionCardSkeleton />
                  <SessionCardSkeleton />
                </div>
              ) : upcoming.length === 0 ? (
                <p className="pf2e-card pf2e-body pf2e-muted p-5">
                  {t('nothing-booked', { defaultValue: 'Nothing on the books.' })}{' '}
                  {viewerId
                    ? t('nothing-booked-editor', { defaultValue: 'Add a session to get started.' })
                    : t('nothing-booked-guest', { defaultValue: 'Sign in to add one.' })}
                </p>
              ) : (
                <>
                  <motion.div layout className="flex flex-col gap-3">
                    <AnimatePresence initial={false}>
                      {visibleUpcoming.map(renderCard)}
                    </AnimatePresence>
                  </motion.div>
                  {/* Watched 600px early, so the next page is already in the DOM
                      by the time the list ends. The count is shown because a
                      silent sentinel is indistinguishable from a list that has
                      finished — and on a phone, from one that is broken. */}
                  {hiddenUpcoming > 0 && (
                    <p className="pf2e-caption mt-3 text-center" ref={upcomingSentinel}>
                      {t('more-sessions', {
                        defaultValue: '{{count}} more session below',
                        defaultValue_other: '{{count}} more sessions below',
                        count: hiddenUpcoming,
                      })}
                    </p>
                  )}
                </>
              )}
            </section>

            {past.length > 0 && (
              <section aria-label={t('past-sessions', { defaultValue: 'Past sessions' })}>
                <button
                  type="button"
                  className="pf2e-btn pf2e-btn-ghost pf2e-btn-sm mb-3"
                  onClick={() => setShowPast((v) => !v)}
                  aria-expanded={showPast}
                >
                  {showPast
                    ? t('hide-past', {
                        defaultValue: 'Hide {{count}} past session',
                        defaultValue_other: 'Hide {{count}} past sessions',
                        count: past.length,
                      })
                    : t('show-past', {
                        defaultValue: 'Show {{count}} past session',
                        defaultValue_other: 'Show {{count}} past sessions',
                        count: past.length,
                      })}
                </button>
                <AnimatePresence initial={false}>
                  {showPast && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.24, ease: EASE }}
                      className="flex flex-col gap-3 overflow-hidden"
                    >
                      {visiblePast.map(renderCard)}
                      {hiddenPast > 0 && (
                        <p className="pf2e-caption text-center" ref={pastSentinel}>
                          {t('more-past-sessions', {
                            defaultValue: '{{count}} more further back',
                            count: hiddenPast,
                          })}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            )}
          </main>
        </div>
      </div>

      {/* Each sheet enters the tree on its first open and stays \u2014 unmounting on
          close would cut its own exit animation. `fallback={null}` because the
          chunk is warmed on idle, so in practice there is nothing to show for:
          a sheet that flashed a spinner before appearing would be slower to READ
          than one that appears a frame later. */}
      {sessionSheetUsed && (
        <Suspense fallback={null}>
          <SessionSheet
            session={openSession}
            open={Boolean(openSession)}
            onOpenChange={(next) => !next && setOpenSessionId(null)}
            timeZone={timeZone}
            viewerId={viewerId}
            submitting={updateSession.isPending || respond.isPending}
            onRespond={handleRespond}
            onSave={(session, payload) => updateSession.mutate({ id: session.id, payload })}
            onSetCanceled={(session, canceled) =>
              updateSession.mutate({ id: session.id, payload: { canceled } })
            }
            onDelete={(session) => deleteSession.mutate({ id: session.id })}
          />
        </Suspense>
      )}

      {createSheetUsed && (
        <Suspense fallback={null}>
          <CreateSheet
            open={creating}
            onOpenChange={setCreating}
            selectedKey={selectedKey}
            timeZone={timeZone}
            submitting={createSession.isPending}
            onSubmit={(payload) => createSession.mutate(payload)}
          />
        </Suspense>
      )}

      {settingsSheetUsed && (
        <Suspense fallback={null}>
          <SettingsSheet
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            settings={board.settings}
            canEdit={Boolean(viewerId)}
            saving={saveSettings.isPending}
            testing={testing}
            onSave={(draft) => {
              saveSettings.mutate(draft as Record<string, unknown>);
              setSettingsOpen(false);
            }}
            onTest={testWebhook}
          />
        </Suspense>
      )}

      {/* Bottom-right, above the page and below the sheets. No account
          needed: it only reads the board, which anyone with the link can
          already read. Deferred to idle so its chunk never competes with the
          board's own first load. */}
      {idleReady && (
        <Suspense fallback={null}>
          <Assistant />
        </Suspense>
      )}
    </div>
  );
}
