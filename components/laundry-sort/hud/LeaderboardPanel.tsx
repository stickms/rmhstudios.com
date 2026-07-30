'use client';

/**
 * Solo and versus boards.
 *
 * Two tabs because the two modes are not comparable: a solo run is you against
 * the clock, a versus race is eight people on the same seeded laundry. Ranking
 * them together would make the number on top meaningless.
 *
 * The tab strip rides the shared `LiquidTabs` renderer — hand-rolled tab strips
 * are a CI failure in this repo (`lib/__tests__/design-consistency.test.ts`).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Spinner } from '@/components/ui/spinner';

interface Row {
  username: string;
  highScore: number;
  gamesPlayed: number;
  versusWins: number;
  versusPlayed: number;
  versusBest: number;
  bestCombo: number;
  totalSorted: number;
}

type Mode = 'solo' | 'versus';

export function LeaderboardPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useTranslation('c-laundry-sort');
  const [mode, setMode] = useState<Mode>('solo');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (which: Mode, signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/laundry-sort/leaderboard?mode=${which}&limit=10`, {
          signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as Row[];
        setRows(Array.isArray(data) ? data : []);
      } catch (cause) {
        if ((cause as Error)?.name === 'AbortError') return;
        setError(t('failed-to-load-leaderboard', { defaultValue: 'Failed to load leaderboard' }));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(mode, controller.signal);
    return () => controller.abort();
  }, [load, mode, refreshKey]);

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <LiquidTabs
        tabs={[
          { id: 'solo', label: t('solo', { defaultValue: 'Solo' }) },
          { id: 'versus', label: t('versus', { defaultValue: 'Versus' }) },
        ]}
        value={mode}
        onChange={(id) => setMode(id as Mode)}
        aria-label={t('leaderboard', { defaultValue: 'Leaderboard' })}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Spinner />
          </div>
        ) : null}

        {error ? <p className="py-4 text-center text-xs text-[var(--ls-danger)]">{error}</p> : null}

        {!loading && !error && rows.length === 0 ? (
          <p className="ls-muted py-4 text-center text-xs">
            {t('no-scores-yet', { defaultValue: 'No scores yet. Be the first!' })}
          </p>
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <ol className="space-y-1">
            {rows.map((row, index) => (
              <li
                key={row.username}
                className="flex items-baseline gap-2 rounded-md px-2 py-1.5 text-xs odd:bg-white/[0.03]"
              >
                <span className="ls-numeric ls-muted w-5 shrink-0">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{row.username}</span>
                {mode === 'versus' ? (
                  <>
                    <span className="ls-muted ls-numeric shrink-0 text-[10px]">
                      {t('races-played', {
                        defaultValue: '{{count}} races',
                        count: row.versusPlayed,
                      })}
                    </span>
                    <span className="ls-accent ls-numeric shrink-0 font-bold">
                      {t('wins-count', { defaultValue: '{{count}}W', count: row.versusWins })}
                    </span>
                  </>
                ) : (
                  <span className="ls-accent ls-numeric shrink-0 font-bold">
                    {row.highScore.toLocaleString()}
                  </span>
                )}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
