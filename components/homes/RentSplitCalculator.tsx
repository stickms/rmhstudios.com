import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { explainSplit, FEATURE_WEIGHTS, type RoomFeature } from '@/lib/homes/rent-split';
import {
  MAX_ROOMS,
  serializeRentSplit,
  type RentSplitState,
  type RoomInput,
} from '@/lib/homes/rent-split-url';

const FEATURES = Object.keys(FEATURE_WEIGHTS) as RoomFeature[];
const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

/**
 * Fair rent split (F10): rent = a shared part split evenly + a private part
 * split by room points (area × feature multipliers). Every number shows its
 * derivation, and the cents always add up to the rent. The state round-trips
 * through the URL (`onChange` + `shareUrl`), so no database is involved.
 */
export function RentSplitCalculator({
  initial,
  onChange,
  className,
}: {
  initial: RentSplitState;
  onChange?: (state: RentSplitState) => void;
  className?: string;
}) {
  const { t } = useTranslation('f-ladder-homes');
  const [rent, setRent] = useState(String(initial.rent));
  const [shared, setShared] = useState(initial.shared);
  const [rooms, setRooms] = useState<RoomInput[]>(initial.rooms);

  const rentNum = Number(rent);
  const valid = Number.isFinite(rentNum) && rentNum > 0 && rentNum <= 100_000;
  const state: RentSplitState = { rent: valid ? rentNum : initial.rent, shared, rooms };

  useEffect(() => {
    if (valid) onChange?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rent, shared, rooms]);

  const totalCents = valid ? Math.round(rentNum * 100) : 0;
  const details = useMemo(
    () =>
      explainSplit(
        totalCents,
        rooms.map((r, i) => ({ id: String(i), area: r.area, features: r.features })),
        shared / 100,
      ),
    [totalCents, rooms, shared],
  );
  const sharedTotal = details.reduce((a, d) => a + d.sharedCents, 0);
  const privateTotal = totalCents - sharedTotal;
  const totalPoints = details.reduce((a, d) => a + d.points, 0);
  const sum = details.reduce((a, d) => a + d.cents, 0);

  const featureLabel: Record<RoomFeature, string> = {
    'private-bath': t('rs-f-bath', { defaultValue: 'Private bath' }),
    balcony: t('rs-f-balcony', { defaultValue: 'Balcony' }),
    'walk-in-closet': t('rs-f-closet', { defaultValue: 'Walk-in closet' }),
    'no-window': t('rs-f-nowindow', { defaultValue: 'No window' }),
    'shared-wall-noise': t('rs-f-noise', { defaultValue: 'Noisy wall' }),
  };
  const patch = (i: number, p: Partial<RoomInput>) =>
    setRooms((cur) => cur.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const params = new URLSearchParams(serializeRentSplit(state)).toString();
  const shareUrl =
    typeof window === 'undefined' ? '' : `${window.location.origin}/homes/rent-split?${params}`;

  return (
    <div className={className}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-site-text-muted">
            {t('rs-rent', { defaultValue: 'Total monthly rent ($)' })}
          </span>
          <Input
            type="number"
            inputMode="decimal"
            min={1}
            max={100000}
            step="any"
            value={rent}
            onChange={(e) => setRent(e.target.value)}
          />
        </label>
        <div className="space-y-2 text-sm">
          <span id="rs-shared-label" className="text-site-text-muted">
            {t('rs-shared', { defaultValue: 'Shared part, split evenly: {{pct}}%', pct: shared })}
          </span>
          <Slider
            aria-labelledby="rs-shared-label"
            min={0}
            max={90}
            step={5}
            value={[shared]}
            onValueChange={([v]) => setShared(v ?? 0)}
          />
          <p className="text-xs text-site-text-muted">
            {t('rs-shared-hint', {
              defaultValue: 'Kitchen, living room, the address: everyone gets the same of these.',
            })}
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {rooms.map((room, i) => {
          const d = details[i];
          const factors = room.features.map(
            (f) => `× ${FEATURE_WEIGHTS[f]} ${featureLabel[f].toLowerCase()}`,
          );
          return (
            <li key={i} className="glass-fill rounded-site p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-32 flex-1 space-y-1 text-sm">
                  <span className="text-site-text-muted">
                    {t('rs-room-name', { defaultValue: 'Room name' })}
                  </span>
                  <Input
                    value={room.name}
                    maxLength={24}
                    onChange={(e) => patch(i, { name: e.target.value })}
                  />
                </label>
                <label className="w-28 space-y-1 text-sm">
                  <span className="text-site-text-muted">
                    {t('rs-area', { defaultValue: 'Area (m² or ft²)' })}
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={10000}
                    step="any"
                    value={room.area}
                    onChange={(e) => patch(i, { area: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>
                {rooms.length > 2 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    aria-label={t('rs-remove', { defaultValue: 'Remove room' })}
                    onClick={() => setRooms((cur) => cur.filter((_, j) => j !== i))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </div>
              <div
                className="mt-3 flex flex-wrap gap-2"
                role="group"
                aria-label={t('rs-features', { defaultValue: 'Room features' })}
              >
                {FEATURES.map((f) => {
                  const on = room.features.includes(f);
                  return (
                    <Button
                      key={f}
                      type="button"
                      size="sm"
                      variant={on ? 'accent' : 'outline'}
                      aria-pressed={on}
                      className="min-h-11"
                      onClick={() =>
                        patch(i, {
                          features: on
                            ? room.features.filter((x) => x !== f)
                            : [...room.features, f],
                        })
                      }
                    >
                      {featureLabel[f]}
                    </Button>
                  );
                })}
              </div>
              {d && (
                <div className="mt-3 border-t border-site-border pt-3 text-sm">
                  <p className="text-lg font-semibold text-site-text">
                    {t('rs-pays', {
                      defaultValue: '{{name}} pays {{amount}} / month',
                      name: room.name || `#${i + 1}`,
                      amount: money(d.cents),
                    })}
                  </p>
                  <ul className="mt-1 space-y-1 text-site-text-muted">
                    <li>
                      {t('rs-d-points', {
                        defaultValue: 'Points: {{area}} area {{factors}} = {{points}}',
                        area: room.area,
                        factors: factors.join(' '),
                        points: d.points.toFixed(1),
                      })}
                    </li>
                    <li>
                      {t('rs-d-shared', {
                        defaultValue:
                          'Shared part: {{total}} ({{pct}}% of the rent) ÷ {{rooms}} rooms = {{amount}}',
                        total: money(sharedTotal),
                        pct: shared,
                        rooms: rooms.length,
                        amount: money(d.sharedCents),
                      })}
                    </li>
                    <li>
                      {t('rs-d-private', {
                        defaultValue:
                          'Private part: {{total}} × {{points}} ÷ {{all}} points = {{amount}}',
                        total: money(privateTotal),
                        points: d.points.toFixed(1),
                        all: totalPoints.toFixed(1),
                        amount: money(d.privateCents),
                      })}
                    </li>
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {rooms.length < MAX_ROOMS && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() =>
              setRooms((cur) => [
                ...cur,
                { name: `Room ${cur.length + 1}`, area: 120, features: [] },
              ])
            }
          >
            <Plus aria-hidden />
            {t('rs-add', { defaultValue: 'Add a room' })}
          </Button>
        )}
        <CopyButton
          value={shareUrl}
          label={t('rs-copy', { defaultValue: 'Copy share link' })}
          toastOnCopy
        >
          {t('rs-copy', { defaultValue: 'Copy share link' })}
        </CopyButton>
      </div>
      {valid && (
        <p className="mt-3 text-xs text-site-text-muted">
          {t('rs-check', {
            defaultValue:
              'Amounts are rounded to whole cents so the rooms add up to exactly {{total}} (sum: {{sum}}).',
            total: money(totalCents),
            sum: money(sum),
          })}
        </p>
      )}
    </div>
  );
}
