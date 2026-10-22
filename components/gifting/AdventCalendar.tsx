'use client';

/** Advent calendar (G2): 24 doors, today's opens once for a small coin grant. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Gift, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { apiJson, errorCode } from '@/components/economy-plus/api';
import { ADVENT_DOORS, type AdventState } from '@/lib/gifting/advent';

const KEY = ['advent'] as const;

export default function AdventCalendar() {
  const { t } = useTranslation('f-gifting');
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => apiJson<AdventState>('/api/advent'),
  });

  const open = useMutation({
    mutationFn: () => apiJson<{ door: number; coins: number }>('/api/advent', { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(
        t('advent-opened', {
          defaultValue: 'Door {{door}} opened: +{{coins}} coins',
          door: r.door,
          coins: r.coins,
        }),
      );
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => {
      const code = errorCode(err);
      toast.error(
        code === 'already-opened'
          ? t('advent-already', { defaultValue: "You've already opened today's door" })
          : t('advent-error', { defaultValue: "Couldn't open that door right now" }),
      );
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;
  const opened = new Set(data.opened);

  return (
    <div className="space-y-4">
      <p className="text-sm text-site-text-muted">
        {data.today === null
          ? t('advent-closed', {
              defaultValue: 'The calendar opens on December 1. One door a day until the 24th.',
            })
          : t('advent-intro', {
              defaultValue:
                "Open today's door for {{coins}} coins. One door a day, and a missed door stays shut.",
              coins: data.coins,
            })}
      </p>
      <ol className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {Array.from({ length: ADVENT_DOORS }, (_, i) => i + 1).map((door) => {
          const isToday = data.today === door;
          const done = opened.has(door);
          const past = data.today !== null && door < data.today;
          return (
            <li key={door}>
              <button
                type="button"
                disabled={!isToday || done || open.isPending}
                onClick={() => open.mutate()}
                aria-label={
                  done
                    ? t('advent-door-opened', { defaultValue: 'Door {{door}}, opened', door })
                    : isToday
                      ? t('advent-door-open', { defaultValue: 'Open door {{door}}', door })
                      : t('advent-door-shut', { defaultValue: 'Door {{door}}, shut', door })
                }
                className={`flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-site-sm font-display text-lg font-semibold transition-colors ${
                  isToday && !done
                    ? 'glass-overlay text-site-accent hover:text-site-accent-hover'
                    : done
                      ? 'glass-inset text-site-success'
                      : 'glass-fill text-site-text-dim'
                } ${past && !done ? 'opacity-60' : ''}`}
              >
                {door}
                {done ? (
                  <Check className="size-4" aria-hidden />
                ) : isToday ? (
                  <Gift className="size-4" aria-hidden />
                ) : (
                  <Lock className="size-3.5" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="flex items-center gap-1.5 text-xs text-site-text-muted">
        <CoinIcon className="size-3.5" />
        {t('advent-tally', {
          defaultValue: '{{count}} of {{total}} doors opened this year',
          count: data.opened.length,
          total: ADVENT_DOORS,
        })}
      </p>
    </div>
  );
}
