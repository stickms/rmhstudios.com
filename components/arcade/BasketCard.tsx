'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShoppingBasket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { armBasket } from '@/lib/arcade/run-client';

interface BasketData {
  basket: { day: string };
  board: {
    rank: number;
    score: number;
    isMe: boolean;
    user: { name?: string | null; handle?: string | null };
  }[];
  mine: { finishedAt: string | null } | null;
}

/** Laundry Sort main-menu card: today's basket, its top five, and the one-attempt button. */
export function BasketCard({ signedIn, onPlay }: { signedIn: boolean; onPlay: () => void }) {
  const { t } = useTranslation('f-party');
  const [data, setData] = useState<BasketData | null>(null);
  useEffect(() => {
    fetch('/api/arcade/basket')
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => null);
  }, [signedIn]);

  return (
    <div className="ls-panel-strong space-y-2 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <ShoppingBasket className="size-4" aria-hidden="true" />
        {t('basket-title', { defaultValue: 'Daily basket' })}
      </h3>
      <p className="ls-muted text-xs">
        {t('basket-desc', {
          defaultValue: 'Same laundry for everyone today. One counted attempt.',
        })}
      </p>
      {data?.board.length ? (
        <ol className="space-y-0.5 text-xs">
          {data.board.slice(0, 5).map((r) => (
            <li key={r.rank} className={r.isMe ? 'font-bold' : undefined}>
              {r.rank}. {r.user.name ?? r.user.handle ?? '?'}{' '}
              <span className="ls-muted">{r.score}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {signedIn ? (
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            armBasket();
            onPlay();
          }}
        >
          {data?.mine
            ? t('basket-practice', { defaultValue: 'Practice today’s basket' })
            : t('basket-play', { defaultValue: 'Play today’s basket' })}
        </Button>
      ) : (
        <p className="ls-muted text-xs">
          {t('basket-sign-in', { defaultValue: 'Sign in to take the daily attempt.' })}
        </p>
      )}
    </div>
  );
}
