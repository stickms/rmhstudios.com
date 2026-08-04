'use client';

/**
 * RMHHomes — distance from a saved place.
 *
 * ─────────────────────────────── honesty ────────────────────────────────────
 *
 * This measures STRAIGHT-LINE distance. Every string in this component says
 * "distance" and none of them says "commute" or shows a duration, because the
 * number is a chord across a map: a river, a rail line or a one-way grid
 * routinely turns 3 km as-the-crow-flies into a 25-minute drive. A caveat sits
 * permanently under the control rather than behind a tooltip — a renter plans
 * their morning around this, and a caveat you have to hover to find is one the
 * person on a phone never reads.
 *
 * Saved places are labels and coordinates in `localStorage` (`lib/homes/places`);
 * nothing about them is stored server-side. The filtering itself is
 * `haversineKm` over the `lat`/`lng` already on each listing, so it costs no
 * request and updates as the slider moves.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, MapPin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistance, milesToKm, type DistanceUnit } from '@/lib/homes/distance';
import {
  addSavedPlace,
  loadSavedPlaces,
  makeSavedPlace,
  MAX_PLACE_LABEL_LENGTH,
  MAX_SAVED_PLACES,
  persistSavedPlaces,
  removeSavedPlace,
  type SavedPlace,
} from '@/lib/homes/places';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { LocationSearch, type HomesPlace } from './LocationSearch';

export interface DistanceFilterProps {
  unit?: DistanceUnit;
  /**
   * Raised whenever the active place or the radius changes. `place` is `null`
   * when the filter is off — the page should then show every result rather than
   * none.
   */
  onChange?: (place: SavedPlace | null, maxKm: number) => void;
}

/** Slider stops, in the display unit. Kept coarse — this is a rough cut. */
const MAX_STOP = 50;

export function DistanceFilter({ unit = 'mi', onChange }: DistanceFilterProps) {
  const { t } = useTranslation('site');
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [radius, setRadius] = useState(10);
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [draftPlace, setDraftPlace] = useState<HomesPlace | null>(null);

  // localStorage is browser-only; reading it in the initial state would break
  // hydration.
  useEffect(() => {
    setPlaces(loadSavedPlaces());
  }, []);

  const maxKm = useMemo(() => (unit === 'mi' ? milesToKm(radius) : radius), [unit, radius]);
  const active = useMemo(() => places.find((p) => p.id === activeId) ?? null, [places, activeId]);

  const emit = useCallback(
    (place: SavedPlace | null, km: number) => {
      onChange?.(place, km);
    },
    [onChange],
  );

  const selectPlace = useCallback(
    (id: string | null) => {
      setActiveId(id);
      const place = id ? (places.find((p) => p.id === id) ?? null) : null;
      emit(place, maxKm);
    },
    [places, maxKm, emit],
  );

  const changeRadius = useCallback(
    (next: number) => {
      setRadius(next);
      emit(active, unit === 'mi' ? milesToKm(next) : next);
    },
    [active, emit, unit],
  );

  const savePlace = useCallback(() => {
    if (!draftPlace) {
      toast.error(
        t('homes.distanceNeedPlace', { defaultValue: 'Pick a location from the suggestions.' }),
      );
      return;
    }
    const place = makeSavedPlace({
      label: draftLabel || draftPlace.label,
      lat: draftPlace.lat,
      lng: draftPlace.lng,
    });
    if (!place) {
      toast.error(t('homes.distanceBadPlace', { defaultValue: 'That place could not be saved.' }));
      return;
    }
    const next = addSavedPlace(places, place);
    setPlaces(next);
    persistSavedPlaces(next);
    setActiveId(place.id);
    emit(place, maxKm);
    setAdding(false);
    setDraftLabel('');
    setDraftQuery('');
    setDraftPlace(null);
  }, [draftPlace, draftLabel, places, maxKm, emit, t]);

  const deletePlace = useCallback(
    (id: string) => {
      const next = removeSavedPlace(places, id);
      setPlaces(next);
      persistSavedPlaces(next);
      if (activeId === id) {
        setActiveId(null);
        emit(null, maxKm);
      }
    },
    [places, activeId, maxKm, emit],
  );

  return (
    <section
      className="glass-pane p-4 sm:p-5"
      aria-labelledby="homes-distance-heading"
      data-slot="distance-filter"
    >
      <div className="flex flex-wrap items-center gap-2">
        <MapPin className="size-4 text-site-accent" aria-hidden />
        <h2 id="homes-distance-heading" className="text-sm font-semibold text-site-text">
          {t('homes.distanceTitle', { defaultValue: 'Distance from a place' })}
        </h2>
        {places.length < MAX_SAVED_PLACES && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdding((v) => !v)}
            className="ml-auto min-h-11"
            aria-expanded={adding}
          >
            <Plus className="size-4" aria-hidden />
            {t('homes.distanceAdd', { defaultValue: 'Add a place' })}
          </Button>
        )}
      </div>

      {adding && (
        <div className="mt-3 grid gap-3 border-t border-site-border pt-3">
          <div>
            <Label htmlFor="homes-place-label">
              {t('homes.distanceLabel', { defaultValue: 'Call it' })}
            </Label>
            <Input
              id="homes-place-label"
              maxLength={MAX_PLACE_LABEL_LENGTH}
              placeholder={t('homes.distanceLabelHint', { defaultValue: 'Work, campus, Mom’s' })}
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-site-text">
              {t('homes.distanceWhere', { defaultValue: 'Where is it?' })}
            </span>
            <LocationSearch
              value={draftQuery}
              onQueryChange={(q) => {
                setDraftQuery(q);
                setDraftPlace(null);
              }}
              onSelect={(p) => {
                setDraftPlace(p);
                setDraftQuery(p.label);
                if (!draftLabel) setDraftLabel(p.label.split(',')[0] ?? p.label);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={savePlace} className="min-h-11">
              {t('homes.distanceSave', { defaultValue: 'Save place' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAdding(false)}
              className="min-h-11"
            >
              {t('homes.distanceCancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}

      {places.length > 0 ? (
        <>
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="group"
            aria-label={t('homes.distancePlaces', { defaultValue: 'Saved places' })}
          >
            {places.map((place) => {
              const isActive = place.id === activeId;
              return (
                <span key={place.id} className="inline-flex items-center">
                  <Button
                    type="button"
                    size="sm"
                    variant={isActive ? 'accent' : 'outline'}
                    aria-pressed={isActive}
                    onClick={() => selectPlace(isActive ? null : place.id)}
                    className="min-h-11 rounded-r-none"
                  >
                    {place.label}
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    onClick={() => deletePlace(place.id)}
                    aria-label={t('homes.distanceRemove', {
                      defaultValue: 'Remove {{label}}',
                      label: place.label,
                    })}
                    className="min-h-11 rounded-l-none border-l-0"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </span>
              );
            })}
          </div>

          {active && (
            <div className="mt-4">
              <span
                id="homes-distance-radius-label"
                className="mb-1.5 block text-sm font-medium text-site-text"
              >
                {t('homes.distanceWithin', {
                  defaultValue: 'Within {{distance}} of {{label}}',
                  distance: formatDistance(maxKm, unit),
                  label: active.label,
                })}
              </span>
              <Slider
                min={1}
                max={MAX_STOP}
                step={1}
                value={[radius]}
                onValueChange={([v]) => changeRadius(v)}
                aria-labelledby="homes-distance-radius-label"
              />
            </div>
          )}
        </>
      ) : (
        !adding && (
          <p className="mt-3 text-sm text-site-text-dim">
            {t('homes.distanceEmpty', {
              defaultValue:
                'Save a place like “work” to sort and filter homes by how far they are.',
            })}
          </p>
        )
      )}

      <p className="mt-4 flex items-start gap-1.5 text-xs text-site-text-dim">
        <Info className="mt-px size-3 shrink-0" aria-hidden />
        <span>
          {t('homes.distanceCaveat', {
            defaultValue:
              'Straight-line distance, as the crow flies — not a travel time. Real journeys are longer, and traffic, transit and rivers are not counted.',
          })}
        </span>
      </p>
    </section>
  );
}
