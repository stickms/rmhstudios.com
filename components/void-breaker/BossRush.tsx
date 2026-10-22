'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skull, Lock, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BOSS_RUSH_GAME_ID, isBossRushUnlocked } from '@/lib/void-breaker/bossRush';
import type { RunStats } from '@/lib/void-breaker/types';

type Row = { rank: number; username: string; score: number; progress: number | null };

async function fetchBoard(): Promise<Row[]> {
  try {
    const res = await fetch(`/api/games/${BOSS_RUSH_GAME_ID}/leaderboard?limit=5`);
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: Row[] };
    return data.entries ?? [];
  } catch {
    return [];
  }
}

function Board({ rows }: { rows: Row[] }) {
  const { t } = useTranslation('f-action');
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#c9a227]/80">
        <Trophy className="w-3 h-3" /> {t('vb-rush-board', { defaultValue: 'Boss Rush board' })}
      </div>
      {rows.map((r) => (
        <div key={`${r.rank}-${r.username}`} className="flex justify-between text-xs">
          <span className="text-zinc-500">
            #{r.rank} {r.username}
          </span>
          <span className="font-bold tabular-nums text-[#d4af37]">{r.score.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/** Menu entry: locked until the player clears wave 40 once in a normal run. */
export function BossRushMenu({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation('f-action');
  const [unlocked, setUnlocked] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const open = isBossRushUnlocked();
    setUnlocked(open);
    if (open) void fetchBoard().then(setRows);
  }, []);
  return (
    <div className="space-y-2">
      <Button
        onClick={onStart}
        disabled={!unlocked}
        variant="outline"
        className="w-full py-2 flex items-center justify-center gap-2 border-red-500/30 text-red-300 hover:bg-red-500/10"
      >
        {unlocked ? <Skull className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
        {t('vb-rush-start', { defaultValue: 'Boss Rush' })}
      </Button>
      {!unlocked && (
        <p className="text-[10px] font-mono text-zinc-600">
          {t('vb-rush-locked', {
            defaultValue:
              'Clear all 40 waves once to unlock Boss Rush: all eight bosses back to back.',
          })}
        </p>
      )}
      <Board rows={rows} />
    </div>
  );
}

/** Game-over block for a Boss Rush run: submits to the rush board only. */
export function BossRushResult({ runStats, signedIn }: { runStats: RunStats; signedIn: boolean }) {
  const { t } = useTranslation('f-action');
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<'idle' | 'sent' | 'failed'>('idle');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (signedIn) {
        try {
          const res = await fetch(`/api/games/${BOSS_RUSH_GAME_ID}/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              score: runStats.score,
              progress: runStats.bossesKilled,
              durationMs: runStats.timeSurvivedMs,
            }),
          });
          if (!cancelled) setStatus(res.ok ? 'sent' : 'failed');
        } catch {
          if (!cancelled) setStatus('failed');
        }
      }
      const board = await fetchBoard();
      if (!cancelled) setRows(board);
    })();
    return () => {
      cancelled = true;
    };
  }, [runStats, signedIn]);
  return (
    <div className="bg-[#1a1a24] border border-red-500/30 rounded-lg p-3 space-y-2">
      <div className="text-center text-sm font-bold text-red-300">
        {t('vb-rush-result', {
          defaultValue: 'Boss Rush: {{n}} of 8 bosses felled',
          n: runStats.bossesKilled,
        })}
      </div>
      {signedIn && status !== 'idle' && (
        <p className="text-center text-[10px] font-mono text-[#c9a227]/80">
          {status === 'sent'
            ? t('vb-rush-sent', { defaultValue: 'Score submitted to the Boss Rush board' })
            : t('vb-rush-failed', { defaultValue: 'Could not submit this score' })}
        </p>
      )}
      <Board rows={rows} />
    </div>
  );
}
