import { SwissFormatOption } from '@/components/competitive/SwissStandings';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
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
import { isCheckInMinutes } from '@/lib/tournaments/checkin';
import { CheckInCreateFields } from '@/components/tournaments/CheckInPanel';
import { SeedingMethodField } from '@/components/tournaments/SeedingPanel';
import { MatchDeadlineField, deadlineChoice } from '@/components/tournaments/MatchSchedule';
import { ratingSeedingAvailable, type SeedingMethod } from '@/lib/tournaments/seeding';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { createTournamentApi } from '@/lib/tournaments/tournaments.contract';

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
  const [format, setFormat] = useState<'SINGLE_ELIM' | 'DOUBLE_ELIM' | 'ROUND_ROBIN' | 'SWISS'>('SINGLE_ELIM');
  const [entryFee, setEntryFee] = useState(0);
  const [seedPool, setSeedPool] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  // Local wall-clock `datetime-local` value; '' = no start time.
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [checkInValue, setCheckInValue] = useState('');
  const [deadlineValue, setDeadlineValue] = useState('');
  const [seeding, setSeeding] = useState<SeedingMethod>('join');
  // Rating seeding needs a ranked game; fall back to sign-up order when the game changes.
  // (adjusted while rendering, so the form never shows a method the game cannot use)
  if (seeding === 'rating' && !ratingSeedingAvailable(gameId)) setSeeding('join');
  const startsAtDate = startsAtLocal ? new Date(startsAtLocal) : null;
  const startsAtIso = startsAtDate && !Number.isNaN(startsAtDate.getTime()) ? startsAtDate.toISOString() : null;
  const checkInMinutes = Number(checkInValue);
  const checkInChoice = startsAtIso && isCheckInMinutes(checkInMinutes) ? checkInMinutes : null;

  const submit = async () => {
    setSubmitting(true);
    try {
      const data = await api(createTournamentApi, {
        body: {
          name,
          gameId,
          format,
          entryFeeCoins: entryFee,
          seedPoolCoins: seedPool,
          maxPlayers,
          startsAt: startsAtIso,
          checkInMinutes: checkInChoice,
          matchDeadlineHours: deadlineChoice(deadlineValue),
          seeding,
        },
      });
      toast.success(
        t('created', {
          defaultValue: 'Tournament created!',
        }),
      );
      onClose();
      if (data.id)
        navigate({
          to: '/tournaments/$id',
          params: {
            id: data.id,
          },
        });
    } catch (e) {
      toast.error(
        serverError(e) ??
          t('create-failed', {
            defaultValue: 'Could not create tournament',
          }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileFullscreen>
        <DialogHeader>
          <DialogTitle>
            {t('create-title', {
              defaultValue: 'Host a tournament',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('create-desc', {
              defaultValue: 'Entry fees form the prize pool. Add a seed prize to guarantee a payout.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">
              {t('name', {
                defaultValue: 'Name',
              })}
            </Label>
            <Input
              id="t-name"
              value={name}
              maxLength={120}
              placeholder={t('name-ph', {
                defaultValue: 'Friday Night Showdown',
              })}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-game">
                {t('game', {
                  defaultValue: 'Game',
                })}
              </Label>
              <Select id="t-game" value={gameId} onChange={(e) => setGameId(e.target.value)}>
                {WAGER_ELIGIBLE_GAMES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-format">
                {t('format', {
                  defaultValue: 'Format',
                })}
              </Label>
              <Select
                id="t-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as 'SINGLE_ELIM' | 'DOUBLE_ELIM' | 'ROUND_ROBIN' | 'SWISS')}
              >
                <option value="SINGLE_ELIM">
                  {t('single-elim', {
                    defaultValue: 'Single elimination',
                  })}
                </option>
                <option value="DOUBLE_ELIM">
                  {t('double-elim', { ns: 'double-elimination', defaultValue: 'Double elimination' })}
                </option>
                <option value="ROUND_ROBIN">
                  {t('round-robin', {
                    defaultValue: 'Round robin',
                  })}
                </option>
                <SwissFormatOption />
              </Select>
              {format === 'DOUBLE_ELIM' && (
                <p className="t-meta">
                  {t('double-elim-help', {
                    ns: 'double-elimination',
                    defaultValue:
                      "A player is out after a second loss. Needs at least 4 players. Pick'em is for single elimination only.",
                  })}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-fee">
                {t('entry-fee', {
                  defaultValue: 'Entry fee',
                })}
              </Label>
              <Input
                id="t-fee"
                type="number"
                min={0}
                value={entryFee}
                onChange={(e) => setEntryFee(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-seed">
                {t('seed-prize', {
                  defaultValue: 'Seed prize',
                })}
              </Label>
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
            <Label htmlFor="t-size">
              {t('max-players', {
                defaultValue: 'Bracket size',
              })}
            </Label>
            <Select id="t-size" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
              {SIZES.filter((s) => s >= MIN_TOURNAMENT_PLAYERS && s <= MAX_TOURNAMENT_PLAYERS).map((s) => (
                <option key={s} value={s}>
                  {t('players-count', {
                    defaultValue: '{{count}} players',
                    count: s,
                  })}
                </option>
              ))}
            </Select>
          </div>

          <CheckInCreateFields
            startsAtLocal={startsAtLocal}
            onStartsAtChange={setStartsAtLocal}
            checkInValue={checkInValue}
            onCheckInChange={setCheckInValue}
            hasStart={!!startsAtIso}
          />

          <MatchDeadlineField id="t-deadline" value={deadlineValue} onChange={setDeadlineValue} />

          <SeedingMethodField id="t-seeding" value={seeding} gameId={gameId} onChange={setSeeding} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
          <Button onClick={submit} loading={submitting} disabled={name.trim().length < 3}>
            {t('create', {
              defaultValue: 'Create',
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
