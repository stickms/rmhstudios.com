'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Link2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useArcadeRun, seedKeyOf } from '@/lib/arcade/run-client';
import { seedLink } from '@/lib/arcade/seeded';

interface Row {
  rank: number;
  score: number;
  isMe: boolean;
  user: { name?: string | null; handle?: string | null };
}

/**
 * End-of-run strip for seeded games: files a daily result or a shared-seed
 * score, offers "share this seed", and shows that seed's mini leaderboard.
 */
export function RunPanel({
  score,
  detail,
  signedIn,
}: {
  score: number;
  detail?: Record<string, number>;
  signedIn: boolean;
}) {
  const { t } = useTranslation('f-arcade');
  const run = useArcadeRun((s) => s.run);
  const [board, setBoard] = useState<Row[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const sent = useRef<string | null>(null);

  const seedKey = run ? seedKeyOf(run.seed, run.variant) : null;

  async function submit(kind: 'daily' | 'seed') {
    if (!run) return false;
    const res = await fetch('/api/arcade/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        gameId: run.gameId,
        seedKey: kind === 'daily' ? new Date().toISOString().slice(0, 10) : seedKey,
        score: Math.round(score),
        detail,
      }),
    }).catch(() => null);
    return !!res?.ok;
  }

  async function loadBoard() {
    if (!run || !seedKey) return;
    const res = await fetch(
      `/api/arcade/runs?gameId=${run.gameId}&seedKey=${encodeURIComponent(seedKey)}`,
    ).catch(() => null);
    if (res?.ok) setBoard(((await res.json()) as { board: Row[] }).board);
  }

  useEffect(() => {
    if (!run || !signedIn || run.kind === 'free') return;
    const key = `${run.kind}:${seedKey}:${score}`;
    if (sent.current === key) return;
    sent.current = key;
    void (async () => {
      if (run.kind === 'daily') {
        if (!run.counted)
          return setNote(
            t('daily-practice', {
              defaultValue: "Practice run: today's attempt was already used.",
            }),
          );
        const ok = await submit('daily');
        setNote(
          ok
            ? t('daily-saved', { defaultValue: "Saved to today's leaderboard." })
            : t('daily-failed', { defaultValue: "Couldn't save the daily result." }),
        );
        return;
      }
      await submit('seed');
      await loadBoard();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, signedIn, score]);

  if (!run) return null;

  async function share() {
    if (!run) return;
    if (signedIn && run.kind === 'free') {
      await submit('seed');
      await loadBoard();
    }
    const url = seedLink(run.gameId, run.seed, run.variant, window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('link-copied', { defaultValue: 'Seed link copied' }));
    } catch {
      window.prompt(t('copy-link', { defaultValue: 'Copy this link:' }), url);
    }
  }

  return (
    <div className="glass-fill space-y-2 rounded-site p-3 text-sm text-site-text">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-site-text-muted">
          <Trophy className="h-4 w-4" aria-hidden />
          {run.kind === 'daily'
            ? t('run-daily', { defaultValue: 'Daily mutator' })
            : t('run-seed', { defaultValue: 'Seed {{seed}}', seed: run.seed })}
        </span>
        {run.kind !== 'daily' ? (
          <Button size="xs" variant="outline" onClick={() => void share()}>
            <Link2 aria-hidden />
            {t('share-seed', { defaultValue: 'Share this seed' })}
          </Button>
        ) : null}
      </div>
      {note ? <p className="text-xs text-site-text-muted">{note}</p> : null}
      {!signedIn ? (
        <p className="text-xs text-site-text-muted">
          {t('sign-in-to-rank', { defaultValue: 'Sign in to put this run on a leaderboard.' })}
        </p>
      ) : null}
      {board && board.length > 0 ? (
        <ol className="space-y-0.5 text-xs">
          {board.map((r) => (
            <li
              key={r.rank}
              className={r.isMe ? 'flex justify-between font-semibold' : 'flex justify-between'}
            >
              <span>
                {r.rank}. {r.user.name ?? r.user.handle}
              </span>
              <span className="font-mono">{r.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
