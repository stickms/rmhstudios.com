'use client';

/**
 * GlobeSet head-to-head.
 *
 * Everyone in the room races the **same deal** — one seed, one deck — and the
 * first to clear it (or to reach the sprint's GlobeSet count) wins. Each racer
 * works their own board, because GlobeSet is a race to empty a deck rather than a
 * scramble over one shared layout.
 *
 * The server is authoritative and this component leans on that completely: it
 * renders the board the hub last confirmed, and a claim is a `submit` naming
 * card masks rather than board positions. The cards being claimed lift
 * immediately so the move feels instant, and the hub's next `globeset:board` is
 * what actually replaces them — so a rejected claim simply puts them back
 * rather than leaving the two sides disagreeing about the deck.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Copy, Crown, Loader2, Plug, Users } from 'lucide-react';
import { useGlobeSetRaceStore } from '@/lib/globeset/race-store';
import {
  browseRooms,
  connectToGlobeSetRace,
  createRoom,
  disconnectFromGlobeSetRace,
  forfeitRace,
  joinRoom,
  leaveRoom,
  quickplay,
  rematch,
  setReady,
  startRace,
  submitGlobeSet,
  updateSettings,
} from '@/lib/globeset/socket';
import { xorAll, type Card } from '@/lib/globeset/cards';
import { formatDuration } from '@/lib/globeset/game';
import { APPLE_SPRING } from '@/lib/motion';
import {
  MIN_RACE_PLAYERS,
  SPRINT_TARGETS,
  type RaceGoal,
  type SprintTarget,
} from '@/lib/globeset/constants';
import type { Quat } from '@/lib/device-attitude';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CopyButton } from '@/components/ui/copy-button';
import { GlobeSetCard } from './GlobeSetCard';
import { GlobeSetGlobe } from './GlobeSetGlobe';
import type { CardView } from './GlobeSetGame';

export interface GlobeSetRaceProps {
  shapes: boolean;
  /** The same globe/board choice the daily run is showing. */
  view: CardView;
  attitudeRef: RefObject<Quat | null>;
  gyroActive: boolean;
}

export function GlobeSetRace({ shapes, view, attitudeRef, gyroActive }: GlobeSetRaceProps) {
  const { t } = useTranslation('c-daily-puzzles');
  const status = useGlobeSetRaceStore((s) => s.status);
  const lobby = useGlobeSetRaceStore((s) => s.lobby);
  const selfId = useGlobeSetRaceStore((s) => s.selfId);
  const start = useGlobeSetRaceStore((s) => s.start);
  const results = useGlobeSetRaceStore((s) => s.results);

  // Connect on mount, hang up on unmount: the race tab is the only thing on the
  // page that needs a socket, so a player who never opens it never opens one.
  useEffect(() => {
    void connectToGlobeSetRace();
    return () => disconnectFromGlobeSetRace();
  }, []);

  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <Panel>
        <div className="flex items-center justify-center gap-2 py-8 text-site-text-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          {t('globeset-race-connecting', { defaultValue: 'Connecting…' })}
        </div>
      </Panel>
    );
  }

  if (status !== 'connected') {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Plug className="h-6 w-6 text-site-text-muted" aria-hidden />
          <p className="text-sm text-site-text-muted">
            {t('globeset-race-offline', {
              defaultValue: 'Not connected to the race server. Check your connection.',
            })}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => connectToGlobeSetRace()}
          >
            {t('globeset-race-retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      </Panel>
    );
  }

  if (results) return <RaceResults />;
  if (lobby && start && lobby.phase !== 'waiting') {
    return (
      <RaceBoard shapes={shapes} view={view} attitudeRef={attitudeRef} gyroActive={gyroActive} />
    );
  }
  if (lobby) return <Lobby selfId={selfId} />;
  return <RoomPicker />;
}

/* ── Shell ─────────────────────────────────────────────────────────────────── */

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 glass-pane rounded-site p-5">{children}</div>;
}

/* ── Before a room ─────────────────────────────────────────────────────────── */

function RoomPicker() {
  const { t } = useTranslation('c-daily-puzzles');
  const browse = useGlobeSetRaceStore((s) => s.browse);
  const browsing = useGlobeSetRaceStore((s) => s.browsing);
  const [code, setCode] = useState('');

  useEffect(() => {
    browseRooms();
  }, []);

  return (
    <Panel>
      <h2 className="text-lg font-bold text-site-text">
        {t('globeset-race-title', { defaultValue: 'Race someone' })}
      </h2>
      <p className="mt-1 text-sm text-site-text-muted">
        {t('globeset-race-lede', {
          defaultValue:
            'Everyone gets the same deck. First to clear it wins — or set a sprint and race to a GlobeSet count.',
        })}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => quickplay()}>
          {t('globeset-race-quickplay', { defaultValue: 'Quick match' })}
        </Button>
        <Button type="button" variant="secondary" onClick={() => createRoom({})}>
          {t('globeset-race-create', { defaultValue: 'Create a room' })}
        </Button>
      </div>

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim()) joinRoom(code.trim().toUpperCase());
        }}
      >
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-site-text">
            {t('globeset-race-code-label', { defaultValue: 'Room code' })}
          </span>
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={8}
            autoComplete="off"
            spellCheck={false}
            placeholder="ABC123"
            className="font-mono tracking-widest"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={code.trim().length < 4}>
          {t('globeset-race-join', { defaultValue: 'Join' })}
        </Button>
      </form>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-site-text">
            {t('globeset-race-open-rooms', { defaultValue: 'Open rooms' })}
          </h3>
          <Button type="button" variant="ghost" size="xs" onClick={() => browseRooms()}>
            {t('globeset-race-refresh', { defaultValue: 'Refresh' })}
          </Button>
        </div>
        {browsing ? (
          <p className="mt-3 text-sm text-site-text-muted">
            {t('globeset-race-looking', { defaultValue: 'Looking…' })}
          </p>
        ) : browse.length === 0 ? (
          <p className="mt-3 text-sm text-site-text-muted">
            {t('globeset-race-no-rooms', {
              defaultValue: 'Nobody is waiting right now — create a room and share the code.',
            })}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {browse.map((room) => (
              <li key={room.code}>
                <button
                  type="button"
                  onClick={() => joinRoom(room.code)}
                  className="glass-fill flex w-full items-center justify-between rounded-site px-3 py-2 text-left transition-colors hover:border-site-accent"
                >
                  <span className="font-mono text-sm font-semibold tracking-widest text-site-text">
                    {room.code}
                  </span>
                  <span className="text-xs text-site-text-muted">
                    {room.hostName} · {room.playerCount}/{room.maxPlayers} ·{' '}
                    {room.goal === 'sprint'
                      ? t('globeset-race-goal-sprint-short', {
                          defaultValue: 'Sprint to {{n}}',
                          n: room.sprintTarget,
                        })
                      : t('globeset-race-goal-clear-short', { defaultValue: 'Full deck' })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/* ── In a room, waiting ────────────────────────────────────────────────────── */

function Lobby({ selfId }: { selfId: string | null }) {
  const { t } = useTranslation('c-daily-puzzles');
  const lobby = useGlobeSetRaceStore((s) => s.lobby)!;
  const me = lobby.players.find((p) => p.socketId === selfId);
  const isHost = Boolean(me?.isHost);
  const enough = lobby.players.length >= MIN_RACE_PLAYERS;
  const othersReady = lobby.players.every((p) => p.isHost || p.ready);

  const inviteUrl =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}/daily/globeset?room=${lobby.code}`;

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-site-text-muted">
            {t('globeset-race-code-label', { defaultValue: 'Room code' })}
          </p>
          <p className="font-mono text-2xl font-bold tracking-[0.3em] text-site-text">
            {lobby.code}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton
            value={inviteUrl}
            icon={Copy}
            variant="secondary"
            size="sm"
            label={t('copy-invite-link', { defaultValue: 'Copy invite link' })}
          >
            {t('copy-invite-link', { defaultValue: 'Copy invite link' })}
          </CopyButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => leaveRoom()}>
            {t('globeset-race-leave', { defaultValue: 'Leave' })}
          </Button>
        </div>
      </div>

      <ul
        className="mt-5 space-y-2"
        aria-label={t('globeset-race-players', { defaultValue: 'Players' })}
      >
        {lobby.players.map((player) => (
          <li
            key={player.socketId}
            className="glass-fill flex items-center justify-between rounded-site px-3 py-2"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-site-text">
              {player.isHost && <Crown className="h-4 w-4 text-site-warning" aria-hidden />}
              {player.name}
            </span>
            <span
              className={`text-xs font-semibold ${player.ready ? 'text-site-success' : 'text-site-text-muted'}`}
            >
              {player.ready
                ? t('globeset-race-ready', { defaultValue: 'Ready' })
                : t('globeset-race-not-ready', { defaultValue: 'Waiting' })}
            </span>
          </li>
        ))}
      </ul>

      {isHost && (
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-site-text">
            {t('globeset-race-goal', { defaultValue: 'Win condition' })}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['clear', 'sprint'] as RaceGoal[]).map((goal) => (
              <Button
                key={goal}
                type="button"
                size="sm"
                variant={lobby.goal === goal ? 'accent-outline' : 'ghost'}
                aria-pressed={lobby.goal === goal}
                onClick={() => updateSettings({ goal })}
              >
                {goal === 'clear'
                  ? t('globeset-race-goal-clear', { defaultValue: 'Clear all 63 cards' })
                  : t('globeset-race-goal-sprint', { defaultValue: 'Sprint' })}
              </Button>
            ))}
            {lobby.goal === 'sprint' &&
              SPRINT_TARGETS.map((target) => (
                <Button
                  key={target}
                  type="button"
                  size="sm"
                  variant={lobby.sprintTarget === target ? 'accent-outline' : 'ghost'}
                  aria-pressed={lobby.sprintTarget === target}
                  onClick={() => updateSettings({ sprintTarget: target as SprintTarget })}
                >
                  {t('globeset-race-sprint-n', { defaultValue: '{{n}} sets', n: target })}
                </Button>
              ))}
            <Button
              type="button"
              size="sm"
              variant={lobby.isPublic ? 'accent-outline' : 'ghost'}
              aria-pressed={lobby.isPublic}
              onClick={() => updateSettings({ isPublic: !lobby.isPublic })}
            >
              <Users className="h-4 w-4" aria-hidden />
              {lobby.isPublic
                ? t('globeset-race-public', { defaultValue: 'Listed publicly' })
                : t('globeset-race-private', { defaultValue: 'Invite only' })}
            </Button>
          </div>
        </fieldset>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {isHost ? (
          <Button type="button" onClick={() => startRace()} disabled={!enough || !othersReady}>
            {t('globeset-race-start', { defaultValue: 'Start the race' })}
          </Button>
        ) : (
          <Button
            type="button"
            variant={me?.ready ? 'secondary' : 'default'}
            onClick={() => setReady(!me?.ready)}
          >
            {me?.ready
              ? t('globeset-race-unready', { defaultValue: 'Not ready' })
              : t('globeset-race-im-ready', { defaultValue: "I'm ready" })}
          </Button>
        )}
        {!enough && (
          <p className="text-sm text-site-text-muted">
            {t('globeset-race-need-more', { defaultValue: 'Waiting for one more player.' })}
          </p>
        )}
      </div>
    </Panel>
  );
}

/* ── Racing ────────────────────────────────────────────────────────────────── */

function RaceBoard({ shapes, view, attitudeRef, gyroActive }: Omit<GlobeSetRaceProps, never>) {
  const { t } = useTranslation('c-daily-puzzles');
  const lobby = useGlobeSetRaceStore((s) => s.lobby)!;
  const start = useGlobeSetRaceStore((s) => s.start)!;
  const boardState = useGlobeSetRaceStore((s) => s.board);
  const standings = useGlobeSetRaceStore((s) => s.standings);
  const lastReject = useGlobeSetRaceStore((s) => s.lastReject);
  const selfId = useGlobeSetRaceStore((s) => s.selfId);

  /** Card values, never board positions — see `GlobeSetBoard`. */
  const [selected, setSelected] = useState<Card[]>([]);
  /** Cards handed to the server and not yet confirmed gone. */
  const [pending, setPending] = useState<Card[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const board = useMemo(() => boardState?.board ?? [], [boardState]);

  // One interval for both the countdown and the run clock — they are the same
  // number either side of zero.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  // The server confirmed a new board, so nothing is in flight any more.
  useEffect(() => {
    setPending([]);
    setSelected([]);
  }, [boardState]);

  // A rejected claim puts the cards back rather than leaving them lifted.
  useEffect(() => {
    if (lastReject) setPending([]);
  }, [lastReject]);

  // Computed from a ref rather than inside a `setSelected` updater: an updater
  // runs during render, and both emitting to the socket and setting a second
  // piece of state from there would run twice per claim. See the matching note
  // in `GlobeSetGame.tsx`.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const toggle = useCallback(
    (card: Card) => {
      if (!board.includes(card)) return;
      const current = selectedRef.current.filter((c) => board.includes(c));
      const next = current.includes(card) ? current.filter((c) => c !== card) : [...current, card];
      if (next.length > 0 && xorAll(next) === 0) {
        submitGlobeSet(next);
        setPending(next);
        setSelected([]);
        return;
      }
      setSelected(next);
    },
    [board],
  );

  const msToStart = start.startsAt - now;
  const counting = msToStart > 0;
  const finishedAt = boardState?.finishedAtMs ?? null;
  const elapsed = finishedAt ?? Math.max(0, now - start.startsAt);

  const rosterName = (socketId: string) =>
    start.roster.find((p) => p.socketId === socketId)?.name ??
    t('globeset-race-unknown-player', { defaultValue: 'Player' });

  return (
    <div className="mt-5 space-y-4">
      <div className="glass-pane flex flex-wrap items-center justify-between gap-4 rounded-site p-4">
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-site-text-muted">
            {counting
              ? t('globeset-race-starting', { defaultValue: 'Starting in' })
              : t('globeset-stat-time', { defaultValue: 'Time' })}
          </p>
          <p className="font-mono text-3xl font-bold tabular-nums text-site-text">
            {counting ? Math.ceil(msToStart / 1000) : formatDuration(Math.floor(elapsed / 1000))}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-site-text-muted">
            {lobby.goal === 'sprint'
              ? t('globeset-race-goal-sprint-short', {
                  defaultValue: 'Sprint to {{n}}',
                  n: lobby.sprintTarget,
                })
              : t('globeset-race-goal-clear-short', { defaultValue: 'Full deck' })}
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums text-site-text">
            {boardState?.globeSets ?? 0}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => forfeitRace()}>
          {t('globeset-race-forfeit', { defaultValue: 'Forfeit' })}
        </Button>
      </div>

      {/* ── Live standings ──────────────────────────────────────────────── */}
      <ul className="grid gap-2 sm:grid-cols-2">
        {standings.map((row) => (
          <li
            key={row.socketId}
            className={`glass-fill flex items-center justify-between rounded-site px-3 py-2 text-sm ${
              row.socketId === selfId ? 'border-site-accent' : ''
            }`}
          >
            <span className="truncate font-medium text-site-text">{rosterName(row.socketId)}</span>
            <span className="font-mono text-xs tabular-nums text-site-text-muted">
              {row.done
                ? t('globeset-race-done', { defaultValue: 'Done' })
                : t('globeset-race-cleared', {
                    defaultValue: '{{cleared}} cards · {{sets}} sets',
                    cleared: row.cleared,
                    sets: row.globeSets,
                  })}
            </span>
          </li>
        ))}
      </ul>

      {finishedAt !== null ? (
        <div className="glass-pane rounded-site p-6 text-center">
          <p className="text-sm text-site-text-muted">
            {t('globeset-race-waiting-others', {
              defaultValue: 'Finished — waiting for the rest of the room.',
            })}
          </p>
        </div>
      ) : view === 'globe' ? (
        <GlobeSetGlobe
          board={board}
          selected={selected}
          hinted={[]}
          solving={pending}
          locked={counting || pending.length > 0}
          shapes={shapes}
          attitudeRef={attitudeRef}
          gyroActive={gyroActive}
          onToggle={toggle}
          onClear={() => setSelected([])}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
          <AnimatePresence mode="popLayout" initial={false}>
            {board.map((card, index) => (
              <motion.li
                key={card}
                layout
                className="list-none"
                initial={{ opacity: 0, scale: 0.86 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7, pointerEvents: 'none' }}
                transition={APPLE_SPRING.snappy}
              >
                <GlobeSetCard
                  card={card}
                  position={index + 1}
                  selected={selected.includes(card)}
                  hinted={false}
                  solving={pending.includes(card)}
                  disabled={counting || pending.length > 0}
                  shapes={shapes}
                  onToggle={() => toggle(card)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

/* ── After ─────────────────────────────────────────────────────────────────── */

function RaceResults() {
  const { t } = useTranslation('c-daily-puzzles');
  const results = useGlobeSetRaceStore((s) => s.results)!;
  const selfId = useGlobeSetRaceStore((s) => s.selfId);
  const lobby = useGlobeSetRaceStore((s) => s.lobby);
  const isHost = lobby?.players.find((p) => p.socketId === selfId)?.isHost ?? false;

  return (
    <Panel>
      <h2 className="text-lg font-bold text-site-text">
        {t('globeset-race-results', { defaultValue: 'Final standings' })}
      </h2>
      <ol className="mt-4 space-y-2">
        {results.map((row) => (
          <li
            key={row.socketId}
            className={`glass-fill flex items-center justify-between rounded-site px-3 py-2 ${
              row.socketId === selfId ? 'border-site-accent' : ''
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-site-text">
              <span className="w-6 font-mono text-site-text-muted">#{row.placement}</span>
              {row.name}
            </span>
            <span className="font-mono text-sm tabular-nums text-site-text">
              {row.forfeited
                ? t('globeset-race-forfeited', { defaultValue: 'Forfeit' })
                : row.timeMs == null
                  ? t('globeset-race-cleared', {
                      defaultValue: '{{cleared}} cards · {{sets}} sets',
                      cleared: row.cleared,
                      sets: row.globeSets,
                    })
                  : formatDuration(Math.round(row.timeMs / 1000))}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap gap-2">
        {isHost && (
          <Button type="button" onClick={() => rematch()}>
            {t('globeset-race-rematch', { defaultValue: 'Rematch' })}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => leaveRoom()}>
          {t('globeset-race-leave', { defaultValue: 'Leave room' })}
        </Button>
      </div>
    </Panel>
  );
}
