'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Share2, ShoppingBasket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useArcadeRun } from '@/lib/arcade/run-client';
import { basketShareText } from '@/lib/arcade/basket';

interface Stats {
  sorted: number;
  wrong: number;
  missed: number;
  bestCombo: number;
}
interface Row {
  rank: number;
  score: number;
  isMe: boolean;
  user: { name?: string | null; handle?: string | null };
}

/** Results strip for a daily-basket run: files the counted score, shows the board, copies the emoji grid. */
export function BasketPanel({
  score,
  stats,
  signedIn,
}: {
  score: number;
  stats: Stats;
  signedIn: boolean;
}) {
  const { t } = useTranslation('f-party');
  const run = useArcadeRun((s) => s.run);
  const [board, setBoard] = useState<Row[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    if (!run || run.kind !== 'basket' || !signedIn || sent.current) return;
    sent.current = true;
    void (async () => {
      if (run.counted) {
        const res = await fetch('/api/arcade/basket/finish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score: Math.round(score), detail: stats }),
        }).catch(() => null);
        setNote(
          res?.ok
            ? t('basket-saved', { defaultValue: 'Saved to today’s basket leaderboard.' })
            : t('basket-failed', { defaultValue: 'Couldn’t save the basket result.' }),
        );
      } else {
        setNote(
          t('basket-used', { defaultValue: 'Practice run: today’s attempt was already used.' }),
        );
      }
      const b = await fetch('/api/arcade/basket').catch(() => null);
      if (b?.ok) setBoard(((await b.json()) as { board: Row[] }).board);
    })();
  }, [run, signedIn, score, stats, t]);

  if (!run || run.kind !== 'basket') return null;

  async function share() {
    const text = basketShareText(
      run!.variant,
      Math.round(score),
      stats,
      `${window.location.origin}/laundry-sort?basket=1`,
    );
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('basket-copied', { defaultValue: 'Result copied' }));
    } catch {
      window.prompt(t('basket-copy', { defaultValue: 'Copy your result:' }), text);
    }
  }

  return (
    <div className="glass-fill space-y-2 rounded-site p-3 text-sm text-site-text">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-site-text-muted">
          <ShoppingBasket className="h-4 w-4" aria-hidden />
          {t('basket-heading', { defaultValue: 'Daily basket {{day}}', day: run.variant })}
        </span>
        <Button size="xs" variant="outline" onClick={() => void share()}>
          <Share2 aria-hidden />
          {t('basket-share', { defaultValue: 'Copy result grid' })}
        </Button>
      </div>
      {note ? <p className="text-xs text-site-text-muted">{note}</p> : null}
      {board?.length ? (
        <ol className="space-y-0.5 text-xs">
          {board.slice(0, 5).map((r) => (
            <li key={r.rank} className={r.isMe ? 'font-semibold' : undefined}>
              {r.rank}. {r.user.name ?? r.user.handle ?? '?'} · {r.score}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
