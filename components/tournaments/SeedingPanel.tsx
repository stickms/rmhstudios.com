/**
 * Tournament seeding (s05-18): what the host and everyone else see on the
 * tournament page while registration is open, and the method field the create
 * dialog shares. The host picks a method (sign-up order, rating, random, by
 * hand) and, for "by hand", orders the entrants with Move up / Move down
 * buttons (keyboard reachable) and saves the order; a rating seeding lists each
 * entrant's rating and projected seed to everyone. Random shows nothing before
 * the start, and a hand order is the host's alone until then.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { serverError } from '@/lib/http';
import {
  SEEDING_METHODS,
  isSeedingMethod,
  ratingSeedingAvailable,
  type SeedingMethod,
  type SeedingView,
} from '@/lib/tournaments/seeding';
import { fetchSeeding, saveSeeding } from '@/lib/tournaments/seeding.queries';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

/** The method names and their one-line explanations, in the viewer's language. */
function useSeedingCopy() {
  const { t } = useTranslation('tournament-seeding');
  return {
    label(method: SeedingMethod): string {
      switch (method) {
        case 'join':
          return t('method-join', { defaultValue: 'By sign-up order' });
        case 'rating':
          return t('method-rating', { defaultValue: 'By rating' });
        case 'random':
          return t('method-random', { defaultValue: 'Random' });
        case 'manual':
          return t('method-manual', { defaultValue: 'Set by hand' });
      }
    },
    help(method: SeedingMethod): string {
      switch (method) {
        case 'join':
          return t('help-join', { defaultValue: 'Players are seeded in the order they joined.' });
        case 'rating':
          return t('help-rating', {
            defaultValue: 'The highest rating for this game is seed 1. Players without a rating count as 1000.',
          });
        case 'random':
          return t('help-random', {
            defaultValue: 'Seeds are drawn at random when the tournament starts.',
          });
        case 'manual':
          return t('help-manual', {
            defaultValue: 'The host orders the players before the start. Anyone left out follows in sign-up order.',
          });
      }
    },
  };
}

interface MethodFieldProps {
  id: string;
  value: SeedingMethod;
  disabled?: boolean;
  /** The tournament's game; rating is offered only for ranked games. */
  gameId: string;
  onChange: (method: SeedingMethod) => void;
  className?: string;
}

/** The "Seeding" select with the chosen method's explanation, shared by the create dialog and the host's panel. */
export function SeedingMethodField({ id, value, disabled, gameId, onChange, className }: MethodFieldProps) {
  const { t } = useTranslation('tournament-seeding');
  const copy = useSeedingCopy();
  const ratingOk = ratingSeedingAvailable(gameId);
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{t('field-label', { defaultValue: 'Seeding' })}</Label>
      <Select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-help`}
        onChange={(e) => {
          if (isSeedingMethod(e.target.value)) onChange(e.target.value);
        }}
      >
        {SEEDING_METHODS.map((m) => (
          <option key={m} value={m} disabled={m === 'rating' && !ratingOk}>
            {copy.label(m)}
          </option>
        ))}
      </Select>
      <p id={`${id}-help`} className="t-meta">
        {copy.help(value)}
      </p>
      {!ratingOk && (
        <p className="t-meta">
          {t('rating-unavailable', {
            defaultValue: 'Rating seeding is only available for ranked games.',
          })}
        </p>
      )}
    </div>
  );
}

interface PanelProps {
  tourney: SerializedTournament;
  /** The viewer is the host or an admin. */
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}

export function SeedingPanel({ tourney, canManage, onChanged }: PanelProps) {
  const { t } = useTranslation('tournament-seeding');
  const copy = useSeedingCopy();
  const method: SeedingMethod = isSeedingMethod(tourney.seeding) ? tourney.seeding : 'join';
  // Ratings are public; a hand order is only fetched for (and shown to) the host.
  const listed = method === 'rating' || (method === 'manual' && canManage);
  const editable = method === 'manual' && canManage;

  const [view, setView] = useState<SeedingView | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(listed);
  const [order, setOrder] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const pendingFocus = useRef<{ id: string; dir: 'up' | 'down' } | null>(null);
  const arrival = useArrival(!loading);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const next = await fetchSeeding(tourney.id);
      setView(next);
      setOrder(next.entrants.map((e) => e.id));
      setDirty(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tourney.id]);

  useEffect(() => {
    if (listed) void load();
    // A new entrant, or a change of method, changes the list.
  }, [listed, load, method, tourney.playerCount]);

  // Keep keyboard focus on the button that was pressed once its row has moved.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const pick = (dir: string) => document.querySelector<HTMLButtonElement>(`[data-seed-move="${target.id}:${dir}"]`);
    const first = pick(target.dir);
    (first && !first.disabled ? first : pick(target.dir === 'up' ? 'down' : 'up'))?.focus();
  }, [order]);

  if (tourney.status !== 'REGISTRATION') return null;

  const nameOf = (id: string) =>
    tourney.entrants?.find((e) => e.id === id)?.user?.name ?? t('unknown-player', { defaultValue: 'Player' });
  const ratingOf = new Map((view?.entrants ?? []).map((e) => [e.id, e.rating] as const));

  const run = async (work: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(okMsg);
      await onChanged();
    } catch (e) {
      toast.error(serverError(e) ?? t('failed', { defaultValue: 'Seeding could not be saved' }));
    } finally {
      setBusy(false);
    }
  };

  const changeMethod = (next: SeedingMethod) =>
    run(() => saveSeeding(tourney.id, { method: next }), t('method-saved', { defaultValue: 'Seeding saved' }));

  const move = (index: number, dir: 'up' | 'down') => {
    const to = dir === 'up' ? index - 1 : index + 1;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[index], next[to]] = [next[to], next[index]];
    pendingFocus.current = { id: order[index], dir };
    setOrder(next);
    setDirty(true);
    setAnnouncement(
      t('moved', {
        defaultValue: '{{name}} is now seed {{seed}} of {{total}}',
        name: nameOf(order[index]),
        seed: to + 1,
        total: order.length,
      }),
    );
  };

  const saveOrder = () =>
    run(() => saveSeeding(tourney.id, { order }), t('order-saved', { defaultValue: 'Seed order saved' }));

  return (
    <section aria-labelledby="seeding-heading" className="space-y-3 border-b border-site-border pb-4">
      <h2 id="seeding-heading" className="t-heading">
        {t('heading', { defaultValue: 'Seeding' })}
      </h2>

      {canManage ? (
        <SeedingMethodField
          id="seeding-method"
          value={method}
          gameId={tourney.gameId}
          disabled={busy}
          onChange={(next) => void changeMethod(next)}
          className="max-w-xs"
        />
      ) : (
        <p className="t-body">
          <span className="font-medium">{copy.label(method)}.</span> {copy.help(method)}
        </p>
      )}

      {listed && loading && <Skeleton className="h-24 rounded-site" />}

      {listed && !loading && failed && (
        <div className="space-y-2">
          <p className="t-body text-site-danger">
            {t('load-failed', { defaultValue: 'The seeds could not be loaded.' })}
          </p>
          <Button onClick={() => void load()}>{t('retry', { defaultValue: 'Try again' })}</Button>
        </div>
      )}

      {listed && !loading && !failed && order.length === 0 && (
        <p className="t-meta">{t('no-entrants', { defaultValue: 'No one has joined yet.' })}</p>
      )}

      {listed && !loading && !failed && order.length > 0 && (
        <div className={arrival}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-site-border">
                <th scope="col" className="t-label w-14 py-2 pr-3 text-right font-semibold">
                  {t('col-seed', { defaultValue: 'Seed' })}
                </th>
                <th scope="col" className="t-label py-2 font-semibold">
                  {t('col-player', { defaultValue: 'Player' })}
                </th>
                {method === 'rating' && (
                  <th scope="col" className="t-label py-2 text-right font-semibold">
                    {t('col-rating', { defaultValue: 'Rating' })}
                  </th>
                )}
                {editable && (
                  <th scope="col" className="py-2 text-right">
                    <span className="sr-only">{t('col-move', { defaultValue: 'Move' })}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {order.map((id, index) => {
                const rating = ratingOf.get(id) ?? null;
                return (
                  <tr key={id} className="border-b border-site-border">
                    <td className="t-meta w-14 py-2 pr-3 text-right tabular-nums">{index + 1}</td>
                    <td className="t-body max-w-0 truncate py-2">{nameOf(id)}</td>
                    {method === 'rating' && (
                      <td className="t-meta py-2 text-right tabular-nums">
                        {rating ?? t('unrated', { defaultValue: 'Unrated' })}
                      </td>
                    )}
                    {editable && (
                      <td className="whitespace-nowrap py-1 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          data-seed-move={`${id}:up`}
                          disabled={busy || index === 0}
                          aria-label={t('move-up', { defaultValue: 'Move {{name}} up', name: nameOf(id) })}
                          onClick={() => move(index, 'up')}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          data-seed-move={`${id}:down`}
                          disabled={busy || index === order.length - 1}
                          aria-label={t('move-down', { defaultValue: 'Move {{name}} down', name: nameOf(id) })}
                          onClick={() => move(index, 'down')}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {editable && (
            <div className="mt-3 flex items-center gap-3">
              <Button onClick={() => void saveOrder()} loading={busy} disabled={!dirty}>
                {t('save-order', { defaultValue: 'Save order' })}
              </Button>
              <p className="t-meta">
                {t('manual-note', { defaultValue: 'Only you see this order until the tournament starts.' })}
              </p>
            </div>
          )}
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
