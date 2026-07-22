'use client';

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
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
import { MAX_TOURNAMENT_PLAYERS, MIN_TOURNAMENT_PLAYERS } from '@/lib/wager/constants';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SIZES = [4, 8, 16, 32];

export function CreateTournamentDialog({ open, onClose }: Props) {
  const { t } = useTranslation('c-tournaments');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState(WAGER_ELIGIBLE_GAMES[0].id);
  const [format, setFormat] = useState<'SINGLE_ELIM' | 'ROUND_ROBIN'>('SINGLE_ELIM');
  const [entryFee, setEntryFee] = useState(0);
  const [seedPool, setSeedPool] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          gameId,
          format,
          entryFeeCoins: entryFee,
          seedPoolCoins: seedPool,
          maxPlayers,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data.error ?? t('create-failed', { defaultValue: 'Could not create tournament' }),
        );
        return;
      }
      toast.success(t('created', { defaultValue: 'Tournament created!' }));
      onClose();
      if (data.id) navigate({ to: '/tournaments/$id', params: { id: data.id } });
    } catch {
      toast.error(t('create-failed', { defaultValue: 'Could not create tournament' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileFullscreen>
        <DialogHeader>
          <DialogTitle>{t('create-title', { defaultValue: 'Host a tournament' })}</DialogTitle>
          <DialogDescription>
            {t('create-desc', {
              defaultValue:
                'Entry fees form the prize pool. Add a seed prize to guarantee a payout.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">{t('name', { defaultValue: 'Name' })}</Label>
            <Input
              id="t-name"
              value={name}
              maxLength={120}
              placeholder={t('name-ph', { defaultValue: 'Friday Night Showdown' })}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-game">{t('game', { defaultValue: 'Game' })}</Label>
              <Select id="t-game" value={gameId} onChange={(e) => setGameId(e.target.value)}>
                {WAGER_ELIGIBLE_GAMES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-format">{t('format', { defaultValue: 'Format' })}</Label>
              <Select
                id="t-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as 'SINGLE_ELIM' | 'ROUND_ROBIN')}
              >
                <option value="SINGLE_ELIM">
                  {t('single-elim', { defaultValue: 'Single elimination' })}
                </option>
                <option value="ROUND_ROBIN">
                  {t('round-robin', { defaultValue: 'Round robin' })}
                </option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-fee">{t('entry-fee', { defaultValue: 'Entry fee' })}</Label>
              <Input
                id="t-fee"
                type="number"
                min={0}
                value={entryFee}
                onChange={(e) => setEntryFee(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-seed">{t('seed-prize', { defaultValue: 'Seed prize' })}</Label>
              <Input
                id="t-seed"
                type="number"
                min={0}
                value={seedPool}
                onChange={(e) => setSeedPool(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-size">{t('max-players', { defaultValue: 'Bracket size' })}</Label>
            <Select
              id="t-size"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            >
              {SIZES.filter((s) => s >= MIN_TOURNAMENT_PLAYERS && s <= MAX_TOURNAMENT_PLAYERS).map(
                (s) => (
                  <option key={s} value={s}>
                    {t('players-count', { defaultValue: '{{count}} players', count: s })}
                  </option>
                ),
              )}
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={submit} loading={submitting} disabled={name.trim().length < 3}>
            {t('create', { defaultValue: 'Create' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
