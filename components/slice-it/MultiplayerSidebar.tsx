'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { CheckCircle2 } from 'lucide-react';
import { useSliceItStore } from '@/lib/slice-it/store';
import { AnimatedCount } from '@/components/ui/AnimatedCount';

/**
 * The live opponent board.
 *
 * Reads the server's batched score tick rather than a locally-maintained
 * `opponents` record. That record was written from two different events and
 * never pruned on leave, so a player who quit mid-song stayed on the board at
 * their last score until the page was reloaded — and because scores arrived one
 * message per player per note hit, the ordering flickered continuously instead
 * of settling twice a second.
 *
 * ## Two layouts, because 288px is most of a phone
 *
 * This was a fixed `w-72` column beside the playfield at every width. On a
 * 360px handset that left 72px of game — the lanes were unplayable, which is a
 * strange way to lose a rhythm game. Below `lg` it becomes a horizontal strip
 * of compact chips above the playfield instead: same information, ranked the
 * same way, in one line the player can glance at without giving up the field.
 *
 * ## Why the numbers are tweened
 *
 * A score arrives on the server's tick — a step every 250 ms, no matter how
 * continuously the opponent is actually scoring. Painting each step as it lands
 * makes a smooth run look like a stuttering one, which is the thing players
 * describe as "lag" even when the packet arrived on time. `AnimatedCount` rolls
 * between the samples, so the board reads as continuous, and it snaps instantly
 * under `prefers-reduced-motion`. The tween is shorter than the tick so a number
 * always finishes arriving before the next one starts.
 */
/**
 * Tween length for an opponent's score, ms.
 *
 * Shorter than `SCORE_TICK_MS` so a number always finishes rolling before the
 * next sample lands — a tween longer than the tick would permanently lag the
 * truth rather than smooth it.
 */
const SCORE_TWEEN_MS = 200;

/**
 * An opponent's name, linked to their Slice It player page (`X11`).
 *
 * Linked by **user id**, not by handle: `LobbyPlayer` comes off the wire with
 * `userId` and a display name and no handle, and its shape lives in
 * `lib/slice-it/net/events.ts`, which this wave does not own. The player page
 * resolves either form and emits the handle version as its canonical.
 *
 * A null `userId` is a guest seat (`X10`) and renders as plain text — which is
 * the honest rendering, because a guest has no page precisely on account of
 * nothing about them being stored.
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

export function MultiplayerSidebar() {
  const { t } = useTranslation('c-game');
  // The team badge's strings live in `r-slice-it` alongside the rest of the
  // multiplayer mode copy (`N2`), not in the shared game namespace.
  const { t: ts } = useTranslation('r-slice-it');
  const liveScores = useSliceItStore((s) => s.liveScores);
  const lobby = useSliceItStore((s) => s.lobby);
  const selfSocketId = useSliceItStore((s) => s.selfSocketId);

  const rows = React.useMemo(() => {
    const seatOf = (socketId: string) => lobby?.players.find((p) => p.socketId === socketId);
    return Object.values(liveScores)
      .filter((entry) => entry.socketId !== selfSocketId)
      .map((entry) => {
        const seat = seatOf(entry.socketId);
        // `userId` is what makes the name a link (X11). Null for a guest seat,
        // which is exactly the case that has no page to link to.
        return {
          ...entry,
          name: seat?.name ?? 'Player',
          userId: seat?.userId ?? null,
          // Null outside team mode (`N2`) — the server already reports it that
          // way, so the board never has to ask two questions to draw a badge.
          team: seat?.team ?? null,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [liveScores, lobby, selfSocketId]);

  if (rows.length === 0) {
    return (
      <aside className="hidden lg:flex w-72 bg-slice-bg border-l border-slice-shadow-dark/50 p-4 flex-col gap-4 z-10 shrink-0">
        <h3 className="font-black text-slice-text-light text-xs tracking-widest uppercase mb-2">
          {t('opponents', { defaultValue: 'OPPONENTS' })}
        </h3>
        <p className="text-center text-slice-text-light text-sm mt-10 italic opacity-50">
          {t('no-active-opponents', { defaultValue: 'No active opponents' })}
        </p>
      </aside>
    );
  }

  return (
    <>
      {/* Phones and small tablets: one scrollable line above the playfield. */}
      <ol className="lg:hidden order-first flex gap-2 overflow-x-auto shrink-0 px-3 py-2 border-b border-slice-shadow-dark/50 bg-slice-bg z-10">
        {rows.map((row, index) => (
          <li
            key={row.socketId}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]"
          >
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-slice-text-light">
              <span>#{index + 1}</span>
              <PlayerLink
                userId={row.userId}
                name={row.name}
                className="max-w-24 truncate text-slice-text"
              />
              {row.done && <CheckCircle2 className="w-3 h-3 text-green-500" aria-hidden />}
            </span>
            <AnimatedCount
              value={row.score}
              format={(n) => n.toLocaleString()}
              durationMs={SCORE_TWEEN_MS}
              className="block text-sm font-black text-blue-600 leading-tight tabular-nums"
            />
          </li>
        ))}
      </ol>

      <aside className="hidden lg:flex w-72 bg-slice-bg border-l border-slice-shadow-dark/50 p-4 flex-col gap-4 shadow-[-5px_0_15px_rgba(0,0,0,0.05)] z-10 shrink-0">
        <h3 className="font-black text-slice-text-light text-xs tracking-widest uppercase mb-2">
          {t('opponents', { defaultValue: 'OPPONENTS' })}
        </h3>

        <ul className="flex flex-col gap-3 overflow-y-auto flex-1 pr-1">
          {rows.map((row, index) => (
            <li
              key={row.socketId}
              className="bg-slice-bg p-3 rounded-xl shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)]"
            >
              <div className="flex justify-between items-center mb-1 gap-2">
                <span className="font-bold text-slice-text text-sm truncate" title={row.name}>
                  <span className="text-slice-text-light mr-1">#{index + 1}</span>
                  <PlayerLink userId={row.userId} name={row.name} className="" />
                  {row.team && (
                    <span
                      className={`ml-1.5 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                        row.team === 'a'
                          ? 'bg-blue-500/20 text-blue-500'
                          : 'bg-orange-500/20 text-orange-500'
                      }`}
                    >
                      {row.team === 'a'
                        ? ts('mp-team-a-short', { defaultValue: 'A' })
                        : ts('mp-team-b-short', { defaultValue: 'B' })}
                    </span>
                  )}
                </span>
                {row.done ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-green-500 shrink-0">
                    <CheckCircle2 className="w-3 h-3" aria-hidden />
                    {t('finished', { defaultValue: 'Finished' })}
                  </span>
                ) : (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 shrink-0">
                    {t('active', { defaultValue: 'ACTIVE' })}
                  </span>
                )}
              </div>

              <dl className="space-y-1">
                <div className="flex justify-between items-end">
                  <dt className="text-[10px] font-bold text-slice-text-light">
                    {t('score', { defaultValue: 'SCORE' })}
                  </dt>
                  <dd className="font-black text-blue-600 text-lg leading-none tabular-nums">
                    <AnimatedCount
                      value={row.score}
                      format={(n) => n.toLocaleString()}
                      durationMs={SCORE_TWEEN_MS}
                    />
                  </dd>
                </div>
                <div className="flex justify-between items-end">
                  <dt className="text-[10px] font-bold text-slice-text-light">
                    {t('combo', { defaultValue: 'COMBO' })}
                  </dt>
                  <dd className="font-bold text-slice-text-muted text-sm leading-none">
                    {row.combo}x
                  </dd>
                </div>
                <div className="flex justify-between items-end">
                  <dt className="text-[10px] font-bold text-slice-text-light">
                    {t('accuracy', { defaultValue: 'Accuracy' })}
                  </dt>
                  <dd className="font-bold text-slice-text-muted text-sm leading-none font-mono">
                    {(row.accuracy * 100).toFixed(1)}%
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
