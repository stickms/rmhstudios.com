'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { useSliceItStore } from '@/lib/slice-it/store';

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
 */
export function MultiplayerSidebar() {
  const { t } = useTranslation('c-game');
  const liveScores = useSliceItStore((s) => s.liveScores);
  const lobby = useSliceItStore((s) => s.lobby);
  const selfSocketId = useSliceItStore((s) => s.selfSocketId);

  const rows = React.useMemo(() => {
    const nameOf = (socketId: string) =>
      lobby?.players.find((p) => p.socketId === socketId)?.name ?? 'Player';
    return Object.values(liveScores)
      .filter((entry) => entry.socketId !== selfSocketId)
      .map((entry) => ({ ...entry, name: nameOf(entry.socketId) }))
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
              <span className="max-w-24 truncate text-slice-text">{row.name}</span>
              {row.done && <CheckCircle2 className="w-3 h-3 text-green-500" aria-hidden />}
            </span>
            <span className="block text-sm font-black text-blue-600 leading-tight tabular-nums">
              {row.score.toLocaleString()}
            </span>
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
                  {row.name}
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
                  <dd className="font-black text-blue-600 text-lg leading-none">
                    {row.score.toLocaleString()}
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
