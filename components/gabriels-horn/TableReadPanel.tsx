'use client';

/**
 * Gabriel's Horn — the table read (R11). Your bluff rate, call accuracy and
 * "tell" for the game just played, beside the table's average and your career.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameResults } from '@/lib/gabriels-horn/net/events';
import {
  summarize,
  tableAverage,
  type ReadAcc,
  type ReadSummary,
} from '@/lib/gabriels-horn/table-read';
import { Panel } from './ui';

type Career = (ReadAcc & { games: number }) | null;

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const secs = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(1)}s`);

export function TableReadPanel({
  results,
  selfSocketId,
}: {
  results: GameResults;
  selfSocketId: string | null;
}) {
  const { t } = useTranslation('f-async-games');
  const [career, setCareer] = useState<Career>(null);

  // The hub folds this game into the career row after the results emit, so give
  // it a moment before asking. Guests get a 401 and simply have no career column.
  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/gabriels-horn/table-read', { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { career: Career } | null) => setCareer(body?.career ?? null))
        .catch(() => undefined);
    }, 1500);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, []);

  const rows = results.tableRead ?? [];
  const mine = rows.find((r) => r.socketId === selfSocketId);
  if (!mine || rows.length < 2 || results.abandoned) return null;

  const you = summarize(mine);
  const avg = tableAverage(rows);
  const life: ReadSummary | null = career ? summarize(career) : null;

  const lines: {
    key: string;
    label: string;
    fmt: (v: number | null) => string;
    pick: (s: ReadSummary) => number | null;
  }[] = [
    {
      key: 'bluff',
      label: t('read-bluff-rate', { defaultValue: 'Bluff rate' }),
      fmt: pct,
      pick: (s) => s.bluffRate,
    },
    {
      key: 'calls',
      label: t('read-call-accuracy', { defaultValue: 'Call accuracy' }),
      fmt: pct,
      pick: (s) => s.callAccuracy,
    },
    {
      key: 'tell',
      label: t('read-tell', { defaultValue: 'Tell (bluff vs honest)' }),
      fmt: secs,
      pick: (s) => s.tellSeconds,
    },
  ];

  return (
    <Panel tier="fill" className="space-y-2">
      <h2 className="text-sm font-black">{t('read-title', { defaultValue: 'Table read' })}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-(--app-text-dim)">
            <th scope="col" className="text-start font-normal">
              <span className="sr-only">{t('read-stat', { defaultValue: 'Stat' })}</span>
            </th>
            <th scope="col" className="text-end font-normal">
              {t('read-you', { defaultValue: 'You' })}
            </th>
            <th scope="col" className="text-end font-normal">
              {t('read-table', { defaultValue: 'Table' })}
            </th>
            {life ? (
              <th scope="col" className="text-end font-normal">
                {t('read-career', { defaultValue: 'Career' })}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key}>
              <th scope="row" className="text-start font-normal text-(--app-text-muted)">
                {l.label}
              </th>
              <td className="text-end font-mono font-bold tabular-nums">{l.fmt(l.pick(you))}</td>
              <td className="text-end font-mono tabular-nums">{l.fmt(l.pick(avg))}</td>
              {life ? (
                <td className="text-end font-mono tabular-nums">{l.fmt(l.pick(life))}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-(--app-text-dim)">
        {t('read-tell-note', {
          defaultValue:
            'Tell: how much slower (+) or faster (−) you answer when you bluff. Anyone watching can read it.',
        })}
      </p>
    </Panel>
  );
}
