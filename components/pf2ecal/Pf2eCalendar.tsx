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
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';
import type { Availability, CalendarStateDTO, Session, SessionDTO } from '@/lib/pf2ecal/types';
import { toSession } from '@/lib/pf2ecal/types';
import { zonedDateKey } from '@/lib/pf2ecal/zoned-time';
import { Announcements } from './Announcements';
import { Assistant } from './Assistant';
import {
  MonthGridSkeleton,
  PanelSkeleton,
  SessionCardSkeleton,
  StatusLine,
  useBoardStatus,
} from './Loading';
import { MonthGrid } from './MonthGrid';
import { SessionCard } from './SessionCard';
import { SessionSheet } from './SessionSheet';
import { Sheet } from './Sheet';
import { SessionForm, emptyForm, type SessionFormValue } from './SessionForm';
import { SettingsSheet } from './SettingsSheet';
import { SubscribePanel } from './SubscribePanel';
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
} from './state';
import './pf2ecal.css';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

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
  const [createForm, setCreateForm] = useState<SessionFormValue | null>(null);

  const openSession = openSessionId ? (sessions.find((s) => s.id === openSessionId) ?? null) : null;

  const beginCreate = useCallback(() => {
    setCreateForm(emptyForm(selectedKey, timeZone));
    setCreating(true);
  }, [selectedKey, timeZone]);

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

  const renderCard = (session: Session) => (
    <div
      key={session.id}
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
              <button type="button" className="pf2e-btn pf2e-btn-primary" onClick={beginCreate}>
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          {/* Agenda — first in the DOM so it is first on a phone and first for
              a screen reader, regardless of where the grid sits visually. */}
          <main className="flex min-w-0 flex-col gap-6">
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
                <motion.div layout className="flex flex-col gap-3">
                  <AnimatePresence initial={false}>{upcoming.map(renderCard)}</AnimatePresence>
                </motion.div>
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
                      {past.map(renderCard)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            )}
          </main>

          <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6">
            {awaitingFirstData ? (
              <>
                <MonthGridSkeleton />
                <PanelSkeleton rows={2} />
                <PanelSkeleton rows={1} />
              </>
            ) : (
              <>
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

                <SubscribePanel feedUrl={board.feedUrl} scheduleNote={board.scheduleNote} />
              </>
            )}

            <p className="pf2e-caption">
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
        </div>
      </div>

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

      <Sheet
        open={creating}
        onOpenChange={(next) => !next && setCreating(false)}
        title={t('add-a-session', { defaultValue: 'Add a session' })}
        subtitle={t('add-a-session-sub', {
          defaultValue: 'One-off \u2014 the standing schedule keeps running alongside it',
        })}
      >
        {createForm && (
          <SessionForm
            value={createForm}
            onChange={setCreateForm}
            timeZone={timeZone}
            submitting={createSession.isPending}
            submitLabel={t('add-session', { defaultValue: 'Add session' })}
            onCancel={() => setCreating(false)}
            onSubmit={(payload) => {
              createSession.mutate(payload);
              setCreating(false);
            }}
          />
        )}
      </Sheet>

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

      {/* Bottom-right, above the page and below the sheets. No account
          needed: it only reads the board, which anyone with the link can
          already read. */}
      <Assistant />
    </div>
  );
}
