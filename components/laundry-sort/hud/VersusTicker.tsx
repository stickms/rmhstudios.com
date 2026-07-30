'use client';

/**
 * Live standings during a race.
 *
 * Fed by the server's batched `ls:scores` broadcast (one array per tick, not
 * one message per player per tick), so this re-renders roughly twice a second
 * regardless of how many people are in the room.
 */

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useLaundryStore } from '@/lib/laundry-sort/store';

export function VersusTicker() {
  const { t } = useTranslation('c-laundry-sort');
  const liveScores = useLaundryStore((s) => s.liveScores);
  const start = useLaundryStore((s) => s.start);
  const selfSocketId = useLaundryStore((s) => s.selfSocketId);

  if (!start || liveScores.length === 0) return null;

  const nameFor = (socketId: string): string =>
    start.roster.find((r) => r.socketId === socketId)?.name ??
    t('player', { defaultValue: 'Player' });

  const ranked = [...liveScores].sort((a, b) => b.score - a.score);

  return (
    <div className="pointer-events-none absolute right-2 top-20 z-30 w-36 sm:right-4 sm:top-28 sm:w-48">
      <div className="ls-panel px-2.5 py-2">
        <div className="ls-muted mb-1.5 text-[10px] font-semibold uppercase tracking-widest">
          {t('race', { defaultValue: 'Race' })}
        </div>
        <ol className="space-y-1">
          {ranked.map((entry, index) => {
            const isSelf = entry.socketId === selfSocketId;
            return (
              <li
                key={entry.socketId}
                className={`flex items-center gap-1.5 text-[11px] sm:text-xs ${
                  isSelf ? 'font-bold text-[var(--ls-accent)]' : 'ls-muted'
                }`}
              >
                <span className="ls-numeric w-3 shrink-0 opacity-70">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{nameFor(entry.socketId)}</span>
                {entry.done ? (
                  <Check
                    className="size-3 shrink-0"
                    aria-label={t('finished', { defaultValue: 'Finished' })}
                  />
                ) : null}
                <span className="ls-numeric shrink-0 tabular-nums">
                  {entry.score.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
