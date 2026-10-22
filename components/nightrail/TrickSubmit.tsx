'use client';

/**
 * Nightrail trick of the week (R21): put this run's biggest combo up for the
 * weekly vote. Nightrail records no replay, so what is submitted is the chain of
 * tricks and its cash-out; the server checks the score against the member's
 * recorded high score.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RunStats } from '@/lib/nightrail/types';

export function TrickSubmit({ runStats }: { runStats: RunStats }) {
  const { t } = useTranslation('f-async-games');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const chain = runStats.bestComboChain;
  if (!chain?.length || runStats.bestCombo <= 0) return null;

  const submit = async () => {
    setState('busy');
    try {
      const res = await fetch('/api/nightrail/tricks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: runStats.level,
          score: Math.round(runStats.bestCombo),
          multiplier: Math.round((runStats.bestComboMultiplier ?? 1) * 10) / 10,
          chain,
        }),
      });
      if (res.status === 422) {
        toast.error(
          t('trick-not-recorded', {
            defaultValue: 'Your score has not been recorded yet. Try again in a moment.',
          }),
        );
        setState('idle');
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { kept?: boolean };
      toast.success(
        body.kept
          ? t('trick-kept', { defaultValue: 'You already entered a bigger trick this week.' })
          : t('trick-entered', { defaultValue: 'Entered in this week’s trick vote.' }),
      );
      setState('done');
    } catch {
      toast.error(t('trick-error', { defaultValue: 'Could not enter the trick.' }));
      setState('idle');
    }
  };

  return (
    <div className="space-y-1 text-center">
      <p className="text-xs text-slate-400">
        {t('trick-summary', {
          defaultValue: 'Best combo: {{chain}} for {{points}}',
          chain: chain.join(' → '),
          points: Math.round(runStats.bestCombo).toLocaleString(),
        })}
      </p>
      <Button
        variant="outline"
        className="w-full border-slate-600 text-slate-200 hover:bg-slate-800"
        disabled={state !== 'idle'}
        loading={state === 'busy'}
        onClick={() => void submit()}
      >
        <Trophy className="mr-1 h-4 w-4" aria-hidden="true" />
        {state === 'done'
          ? t('trick-entered-btn', { defaultValue: 'Entered' })
          : t('trick-enter', { defaultValue: 'Enter trick of the week' })}
      </Button>
    </div>
  );
}
