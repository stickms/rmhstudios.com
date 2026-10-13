'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Swords } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FINISH_STATUSES, PLAY_STATUSES, type PlayStatus } from '@/lib/arcade/backlog';

interface BacklogData {
  stats: { medianMinutes: number | null; count: number };
  mine: { status: PlayStatus; finishMinutes: number | null } | null;
}
interface RivalData {
  ranked: boolean;
  myScore?: number;
  rival?: { name: string; score: number; rank: number } | null;
  state?: 'ahead' | 'behind';
}

function formatMinutes(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/**
 * Backlog status (E2) and auto rival (E11) for one game. Fetched after paint
 * into a reserved-height card so nothing shifts when it fills in.
 */
export function GameTracker({ gameId, signedIn }: { gameId: string; signedIn: boolean }) {
  const { t } = useTranslation('f-arcade');
  const [data, setData] = useState<BacklogData | null>(null);
  const [rival, setRival] = useState<RivalData | null>(null);
  const [hours, setHours] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`/api/arcade/backlog?gameId=${encodeURIComponent(gameId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: BacklogData | null) => {
        if (!live || !d) return;
        setData(d);
        if (d.mine?.finishMinutes)
          setHours(String(Math.round((d.mine.finishMinutes / 60) * 10) / 10));
      })
      .catch(() => {});
    if (signedIn) {
      fetch(`/api/arcade/rival?gameId=${encodeURIComponent(gameId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: RivalData | null) => live && setRival(d))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [gameId, signedIn]);

  const save = useCallback(
    async (status: PlayStatus | '', hoursText: string) => {
      const minutes = Math.round(Number(hoursText) * 60);
      const finishMinutes =
        (FINISH_STATUSES as readonly string[]).includes(status) && minutes > 0 ? minutes : null;
      const res = await fetch(
        status ? '/api/arcade/backlog' : `/api/arcade/backlog?gameId=${encodeURIComponent(gameId)}`,
        {
          method: status ? 'PUT' : 'DELETE',
          ...(status
            ? {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId, status, finishMinutes }),
              }
            : {}),
        },
      ).catch(() => null);
      if (!res || !res.ok) {
        toast.error(t('save-failed', { defaultValue: 'Could not save that.' }));
        return;
      }
      setData((d) => (d ? { ...d, mine: status ? { status, finishMinutes } : null } : d));
    },
    [gameId, t],
  );

  const labels: Record<PlayStatus, string> = {
    want: t('status-want', { defaultValue: 'Want to play' }),
    playing: t('status-playing', { defaultValue: 'Playing' }),
    finished: t('status-finished', { defaultValue: 'Finished' }),
    completed: t('status-completed', { defaultValue: '100% complete' }),
    dropped: t('status-dropped', { defaultValue: 'Dropped' }),
  };
  const status = data?.mine?.status ?? '';
  const median = data?.stats.medianMinutes;

  return (
    <Card className="min-h-28 space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        {signedIn ? (
          <label className="flex min-w-44 flex-1 flex-col gap-1 text-xs text-site-text-muted">
            {t('your-status', { defaultValue: 'Your status' })}
            <Select
              value={status}
              disabled={!data}
              onChange={(e) => {
                const next = e.target.value as PlayStatus | '';
                void save(next, hours);
              }}
            >
              <option value="">{t('status-none', { defaultValue: 'Not tracked' })}</option>
              {PLAY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {labels[s]}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        {signedIn && status && (FINISH_STATUSES as readonly string[]).includes(status) ? (
          <label className="flex w-36 flex-col gap-1 text-xs text-site-text-muted">
            {t('hours-label', { defaultValue: 'Hours to finish' })}
            <span className="flex gap-2">
              <Input
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void save(status as PlayStatus, hours)}
              >
                {t('save', { defaultValue: 'Save' })}
              </Button>
            </span>
          </label>
        ) : null}
      </div>
      <p className="text-sm text-site-text-muted">
        {median
          ? t('median-line', {
              defaultValue: 'Median time to finish: {{time}} ({{count}} players)',
              time: formatMinutes(median),
              count: data?.stats.count ?? 0,
            })
          : t('median-none', { defaultValue: 'No completion times yet.' })}
      </p>
      {rival?.rival ? (
        <p className="flex items-center gap-2 text-sm text-site-text">
          <Swords className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />
          {rival.state === 'behind'
            ? t('rival-behind', {
                defaultValue: "You're ahead of {{name}}. We'll tell you if they pass you.",
                name: rival.rival.name,
              })
            : t('rival-ahead', {
                defaultValue: 'Your rival: {{name}} (#{{rank}}) is {{gap}} points ahead.',
                name: rival.rival.name,
                rank: rival.rival.rank,
                gap: Math.abs(rival.rival.score - (rival.myScore ?? 0)).toLocaleString(),
              })}
        </p>
      ) : null}
    </Card>
  );
}
