'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { usePartyStore } from '@/lib/rmhtube/party-store';
import { BINGO_MIN_POOL, parsePool } from '@/lib/rmhtube/party';
import { completedLines, makeCard } from '@/lib/rmhtube/bingo';
import { btn, btnPrimary, input, muted } from './ui';

export default function BingoTab() {
  const { t } = useTranslation('f-watch');
  const bingo = usePartyStore((s) => s.party?.bingo ?? null);
  const me = useRmhTubeStore((s) => s.room?.myUserId ?? '');
  const isHost = useRmhTubeStore((s) => s.room?.hostUserId === s.room?.myUserId);
  const [text, setText] = useState('');
  const count = parsePool(text).length;

  const pool = bingo?.pool;
  const seed = bingo?.seed;
  const calledList = bingo?.called;
  const called = useMemo(() => new Set(calledList ?? []), [calledList]);
  const card = useMemo(() => (pool && seed ? makeCard(pool, seed, me) : null), [pool, seed, me]);
  const lines = card ? completedLines(card, called) : [];
  const inLine = new Set(lines.flat());

  if (!bingo) {
    return isHost ? (
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (count >= BINGO_MIN_POOL) emit(C2S.PARTY_BINGO_START, { pool: parsePool(text) });
        }}
      >
        <p className={muted}>
          {t('bingo-pool-hint', {
            defaultValue: 'One square per line, at least {{min}}. Everyone gets their own card.',
            min: BINGO_MIN_POOL,
          })}
        </p>
        <textarea
          className={`${input} h-40`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={t('bingo-pool-label', { defaultValue: 'Bingo squares' })}
        />
        <div className="flex items-center justify-between">
          <span className={muted}>
            {t('bingo-count', { defaultValue: '{{count}} squares', count })}
          </span>
          <button type="submit" className={btnPrimary} disabled={count < BINGO_MIN_POOL}>
            {t('bingo-start', { defaultValue: 'Start bingo' })}
          </button>
        </div>
      </form>
    ) : (
      <p className={muted}>
        {t('bingo-waiting', { defaultValue: 'No bingo game yet. The host can start one.' })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {bingo.winner && (
        <p className="rounded-(--app-radius-sm) bg-(--app-accent-dim) p-2 text-center font-medium">
          {t('bingo-winner', { defaultValue: 'Bingo! {{name}} wins.', name: bingo.winner.name })}
        </p>
      )}
      {card && (
        <div
          className="grid grid-cols-5 gap-1"
          role="grid"
          aria-label={t('bingo-card', { defaultValue: 'Your bingo card' })}
        >
          {card.cells.map((cell, i) => {
            const marked = cell === null || called.has(cell);
            return (
              <div
                key={i}
                role="gridcell"
                className={`flex aspect-square items-center justify-center overflow-hidden rounded-(--app-radius-sm) border p-0.5 text-center text-[10px] leading-tight ${
                  inLine.has(i)
                    ? 'border-(--app-accent) bg-(--app-accent) text-(--app-accent-fg)'
                    : marked
                      ? 'border-(--app-accent) bg-(--app-accent-dim)'
                      : 'border-(--app-border) bg-(--app-bg)'
                }`}
              >
                {cell ?? t('bingo-free', { defaultValue: 'FREE' })}
              </div>
            );
          })}
        </div>
      )}
      {!bingo.winner && (
        <button
          type="button"
          className={`${btnPrimary} w-full`}
          disabled={lines.length === 0}
          onClick={() => emit(C2S.PARTY_BINGO_CLAIM, {})}
        >
          {t('bingo-claim', { defaultValue: 'Bingo!' })}
        </button>
      )}

      {isHost && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-(--app-text-dim)">
            {t('bingo-call', { defaultValue: 'Call squares' })}
          </h4>
          <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
            {bingo.pool.map((sq) => (
              <button
                key={sq}
                type="button"
                aria-pressed={called.has(sq)}
                disabled={!!bingo.winner}
                onClick={() => emit(C2S.PARTY_BINGO_CALL, { square: sq })}
                className={`rounded-(--app-radius-sm) border px-2 py-0.5 text-xs transition-colors ${
                  called.has(sq)
                    ? 'border-(--app-accent) bg-(--app-accent-dim)'
                    : 'border-(--app-border) hover:bg-(--app-surface-hover)'
                }`}
              >
                {sq}
              </button>
            ))}
          </div>
          <button type="button" className={btn} onClick={() => emit(C2S.PARTY_BINGO_END, {})}>
            {t('bingo-end', { defaultValue: 'End game' })}
          </button>
        </div>
      )}
    </div>
  );
}
