'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { WAGER_ELIGIBLE_GAMES } from '@/lib/wager/eligible-games';
import { MIN_WAGER_STAKE, MAX_WAGER_STAKE } from '@/lib/wager/constants';
import type { SerializedWager } from '@/lib/wager/wager.server';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (wager: SerializedWager) => void;
  /** Prefill a specific opponent (from a profile "Challenge" button). */
  opponentId?: string | null;
  opponentName?: string | null;
}

export function CreateWagerDialog({ open, onClose, onCreated, opponentId, opponentName }: Props) {
  const { t } = useTranslation('c-wager');
  const [gameId, setGameId] = useState(WAGER_ELIGIBLE_GAMES[0].id);
  const [stake, setStake] = useState(25);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/wager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId,
          stakeCoins: stake,
          opponentId: opponentId ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('create-failed', { defaultValue: 'Could not create challenge' }));
        return;
      }
      toast.success(
        opponentId
          ? t('challenge-sent', { defaultValue: 'Challenge sent!' })
          : t('challenge-posted', { defaultValue: 'Open challenge posted!' }),
      );
      onCreated(data.wager);
      onClose();
    } catch {
      toast.error(t('create-failed', { defaultValue: 'Could not create challenge' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {opponentName
              ? t('challenge-title-named', {
                  defaultValue: 'Challenge {{name}}',
                  name: opponentName,
                })
              : t('challenge-title-open', { defaultValue: 'Post an open challenge' })}
          </DialogTitle>
          <DialogDescription>
            {t('challenge-desc', {
              defaultValue:
                'Stake coins on a head-to-head match. Both stakes are escrowed and paid to the winner.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="wager-game">{t('game', { defaultValue: 'Game' })}</Label>
            <Select
              id="wager-game"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
            >
              {WAGER_ELIGIBLE_GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                  {g.authoritative ? ' ✓' : ''}
                </option>
              ))}
            </Select>
            <p className="text-xs text-site-text-dim">
              {t('authoritative-hint', {
                defaultValue:
                  '✓ games report a server-verified winner. Others settle when both players agree (or an admin decides).',
              })}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wager-stake">{t('stake', { defaultValue: 'Stake (coins)' })}</Label>
            <Input
              id="wager-stake"
              type="number"
              min={MIN_WAGER_STAKE}
              max={MAX_WAGER_STAKE}
              value={stake}
              onChange={(e) => setStake(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            onClick={submit}
            loading={submitting}
            disabled={stake < MIN_WAGER_STAKE || stake > MAX_WAGER_STAKE}
          >
            {t('create', { defaultValue: 'Create challenge' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
