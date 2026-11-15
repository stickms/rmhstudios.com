import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, LayoutGroup, m as motion } from 'framer-motion';
import { useSliceItStore } from '@features/slice-it/engine/store';
import { transition } from '@/lib/app-motion';
import type { LobbyPlayer, TeamId } from '@features/slice-it/engine/net/events';
import { AnimatedCount } from '@/components/ui/AnimatedCount';

/**
 * The live leaderboard — you and everyone you are racing, ranked, in one list.
 *
 * It was "Opponents", a column of everybody BUT you, in no particular order of
 * interest. A race is about where you stand, so you are in it now, and the rows are
 * in score order: when someone passes someone, the rows swap places on a spring
 * (`layout` + the shared zero-bounce `transition`) instead of re-sorting in one frame,
 * and the row that moved shows a short ▲ or ▼ so you can tell who overtook whom.
 *
 * ## Where the numbers come from
 *
 * Opponents read the server's batched score tick, not a locally-maintained record:
 * that record was written from two events and never pruned on leave, so a player who
 * quit stayed on the board at their last score until reload, and because scores
 * arrived one message per player per note the order flickered continuously.
 * YOUR row is read from your own run in the store instead — the server's echo of your
 * score is a quarter of a second behind your hands, and a leaderboard on which your
 * own number lags is one you cannot trust at the moment two scores are close.
 *
 * ## Why the numbers are tweened
 *
 * A score arrives on the server's tick — a step every 250 ms, no matter how
 * continuously the opponent is actually scoring. Painting each step as it lands makes
 * a smooth run look like a stuttering one, which is the thing players describe as
 * "lag" even when the packet arrived on time. `AnimatedCount` rolls between the
 * samples, shorter than the tick so a number always finishes arriving before the next
 * one starts.
 *
 * ## Two layouts, because 288px is most of a phone
 *
 * A fixed 288px column beside the playfield left a 360px handset 72px of game. Below
 * `lg` it is a horizontal strip of compact chips above the playfield instead: same
 * rows, same order, same animation.
 */

/** Tween length for a score, ms — see above. */
const SCORE_TWEEN_MS = 200;
/** How long the ▲ / ▼ stays on a row after it moves, ms. */
const MOVE_FLAG_MS = 1600;

interface Row {
  socketId: string;
  name: string;
  userId: string | null;
  team: TeamId | null;
  score: number;
  combo: number;
  accuracy: number;
  done: boolean;
  self: boolean;
  /** Whether the name is the player's own (a seat), not the "YOU" placeholder. */
  named: boolean;
}

/**
 * A racer's name, linked to their Slice It player page (`X11`).
 *
 * Linked by **user id**, not by handle: `LobbyPlayer` comes off the wire with
 * `userId` and a display name and no handle. The player page resolves either form.
 * A null `userId` is a guest seat (`X10`) and renders as plain text — the honest
 * rendering, because a guest has no page.
 */
function PlayerLink({
  userId,
  name,
  className,
}: {
  userId: string | null;
  name: string;
  className: string;
}) {
  if (!userId) return <span className={className}>{name}</span>;
  return (
    <Link
      to="/slice-it/player/$handle"
      params={{ handle: userId }}
      className={`${className} hover:underline`}
    >
      {name}
    </Link>
  );
}

/** Ranks (1-based), keyed by socket, for a list already in order. */
function rankMap(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  rows.forEach((row, index) => (out[row.socketId] = index + 1));
  return out;
}

export function MultiplayerSidebar({
  asideRef,
}: {
  /** The wide column, so the margin waves can stop where it starts. */
  asideRef?: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation('c-game');
  // The team badge's strings live in `r-slice-it` alongside the rest of the
  // multiplayer mode copy (`N2`), not in the shared game namespace.
  const { t: ts } = useTranslation('r-slice-it');
  const liveScores = useSliceItStore((s) => s.liveScores);
  const lobby = useSliceItStore((s) => s.lobby);
  const selfSocketId = useSliceItStore((s) => s.selfSocketId);
  const myScore = useSliceItStore((s) => s.score);
  const myCombo = useSliceItStore((s) => s.combo);
  const myAccuracy = useSliceItStore((s) => s.accuracy);

  // A dropped player's seat is held but its `socketId` is blanked (the server
  // reports '' until they rebind), while `liveScores` is frozen for the pause and
  // still keyed by the socket they had. Looked up live alone, that row loses its seat
  // and reads "Player" for exactly the moment the match is waiting on them. So every
  // seat seen is remembered by the socket it held.
  const seatsBySocket = React.useRef(new Map<string, LobbyPlayer>());

  const rows = React.useMemo<Row[]>(() => {
    const remembered = seatsBySocket.current;
    for (const p of lobby?.players ?? []) if (p.socketId) remembered.set(p.socketId, p);
    const seatOf = (socketId: string) =>
      lobby?.players.find((p) => p.socketId === socketId) ?? remembered.get(socketId);

    const others: Row[] = Object.values(liveScores)
      .filter((entry) => entry.socketId !== selfSocketId)
      .map((entry) => {
        const seat = seatOf(entry.socketId);
        return {
          socketId: entry.socketId,
          name: seat?.name ?? 'Player',
          // `userId` is what makes the name a link (X11). Null for a guest seat.
          userId: seat?.userId ?? null,
          // Null outside team mode (`N2`) — the server already reports it that way.
          team: seat?.team ?? null,
          score: entry.score,
          combo: entry.combo,
          accuracy: entry.accuracy,
          done: entry.done,
          self: false,
          named: true,
        };
      });

    const selfKey = selfSocketId ?? 'self';
    const selfSeat = selfSocketId ? seatOf(selfSocketId) : undefined;
    const me: Row = {
      socketId: selfKey,
      name: selfSeat?.name ?? t('you-badge', { defaultValue: 'YOU' }),
      userId: selfSeat?.userId ?? null,
      team: selfSeat?.team ?? null,
      // Your own run, not the server's echo of it — see above.
      score: myScore,
      combo: myCombo,
      accuracy: myAccuracy,
      done: selfSocketId ? Boolean(liveScores[selfSocketId]?.done) : false,
      self: true,
      named: Boolean(selfSeat),
    };

    // Highest first. Ties break on the socket id so two equal scores keep one
    // order rather than swapping every tick.
    return [...others, me].sort(
      (a, b) => b.score - a.score || a.socketId.localeCompare(b.socketId),
    );
  }, [liveScores, lobby, selfSocketId, myScore, myCombo, myAccuracy, t]);

  /* ── Who moved ─────────────────────────────────────────────────────────── */

  // The ▲ / ▼ is event-driven: it appears when a rank changes and clears itself, so a
  // list at rest shows none. A ref holds the last ranks and a timer clears the flags.
  const lastRanks = React.useRef<Record<string, number>>({});
  const [moves, setMoves] = React.useState<Record<string, 1 | -1>>({});
  const clearTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderKey = rows.map((r) => r.socketId).join('|');

  React.useEffect(() => {
    const next = rankMap(rows);
    const before = lastRanks.current;
    const changed: Record<string, 1 | -1> = {};
    for (const [id, rank] of Object.entries(next)) {
      const was = before[id];
      if (was !== undefined && was !== rank) changed[id] = rank < was ? 1 : -1;
    }
    lastRanks.current = next;
    if (Object.keys(changed).length === 0) return;
    setMoves((current) => ({ ...current, ...changed }));
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setMoves({}), MOVE_FLAG_MS);
    // `rows` is read for the new ranks, but it changes on every score tick; the
    // ORDER is what decides whether anyone moved, so that is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  React.useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    [],
  );

  const top = Math.max(1, rows[0]?.score ?? 1);
  const alone = rows.length <= 1;

  const moveFlag = (row: Row) =>
    moves[row.socketId] ? (
      <span
        className="slice-lb__move"
        data-dir={moves[row.socketId] === 1 ? 'up' : 'down'}
        aria-hidden
      >
        {moves[row.socketId] === 1 ? '▲' : '▼'}
      </span>
    ) : null;

  const teamChip = (row: Row) =>
    row.team ? (
      <span className="slice-lb__team" data-team={row.team}>
        {row.team === 'a'
          ? ts('mp-team-a-short', { defaultValue: 'A' })
          : ts('mp-team-b-short', { defaultValue: 'B' })}
      </span>
    ) : null;

  return (
    <LayoutGroup id="slice-leaderboard">
      {/* Phones and small tablets: one scrollable line above the playfield. */}
      <ol
        className="slice-lb-strip order-first"
        aria-label={t('leaderboard', { defaultValue: 'Leaderboard' })}
      >
        {rows.map((row, index) => (
          <motion.li
            key={row.socketId}
            layout="position"
            transition={transition}
            className={`slice-lb-chip ${row.self ? 'is-self' : ''}`}
          >
            <span className="slice-lb-chip__top">
              <span className="slice-lb__rank">{index + 1}</span>
              <PlayerLink userId={row.userId} name={row.name} className="slice-lb-chip__name" />
              {moveFlag(row)}
              {row.done && <span className="slice-lb__done">{'✓'}</span>}
            </span>
            <AnimatedCount
              value={row.score}
              format={(n) => n.toLocaleString()}
              durationMs={SCORE_TWEEN_MS}
              className="slice-lb-chip__score"
            />
          </motion.li>
        ))}
      </ol>

      <aside
        ref={asideRef as React.RefObject<HTMLElement>}
        className="slice-lb"
        aria-label={t('leaderboard', { defaultValue: 'Leaderboard' })}
      >
        <h3 className="slice-label slice-lb__title">
          {t('leaderboard', { defaultValue: 'Leaderboard' })}
        </h3>

        <ol className="slice-lb__list">
          <AnimatePresence initial={false}>
            {rows.map((row, index) => (
              <motion.li
                key={row.socketId}
                layout="position"
                transition={transition}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`slice-lb__row ${row.self ? 'is-self' : ''}`}
              >
                <span className="slice-lb__rank" data-top={index === 0 || undefined}>
                  {index + 1}
                </span>

                <span className="slice-lb__who">
                  <span className="slice-lb__name" title={row.name}>
                    <PlayerLink userId={row.userId} name={row.name} className="" />
                    {row.self && row.named && (
                      <span className="slice-lb__you">
                        {t('you-badge', { defaultValue: 'YOU' })}
                      </span>
                    )}
                    {teamChip(row)}
                  </span>
                  <span className="slice-lb__meta">
                    {row.done ? (
                      <span className="slice-lb__done">
                        {t('finished', { defaultValue: 'Finished' })}
                      </span>
                    ) : (
                      <>
                        {row.combo}x · {(row.accuracy * 100).toFixed(1)}%
                      </>
                    )}
                  </span>
                </span>

                <span className="slice-lb__score">
                  <AnimatedCount
                    value={row.score}
                    format={(n) => n.toLocaleString()}
                    durationMs={SCORE_TWEEN_MS}
                  />
                </span>

                {moveFlag(row)}

                {/* The score as a share of the leader's: a groove along the foot. */}
                <span
                  className="slice-lb__bar"
                  style={{ transform: `scaleX(${Math.min(1, row.score / top)})` }}
                  aria-hidden
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>

        {alone && (
          <p className="slice-lb__alone">
            {t('no-active-opponents', { defaultValue: 'No active opponents' })}
          </p>
        )}
      </aside>
    </LayoutGroup>
  );
}
