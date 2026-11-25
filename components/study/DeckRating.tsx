import { useId, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { MAX_STARS, MIN_STARS, type RatingDisplay } from '@/lib/study/deck-ratings';
import {
  getDeckRatingApi,
  rateDeckApi,
  removeDeckRatingApi,
  type DeckRatingView,
} from '@/lib/study/deck-ratings.contract';

const STARS = Array.from({ length: MAX_STARS - MIN_STARS + 1 }, (_, i) => MIN_STARS + i);

/** A deck's ratings and copies as one line of meta text: the average once there are enough ratings, else a plain note. */
export function DeckRatingLine({ rating, copyCount }: { rating: RatingDisplay; copyCount: number }) {
  const { t, i18n } = useTranslation('deck-ratings');
  const oneDecimal = useMemo(
    () => new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [i18n.language],
  );
  return (
    <p className="t-meta">
      {rating.average === null
        ? t('rating-none', { defaultValue: 'Not enough ratings yet' })
        : t('rating-average', {
            average: oneDecimal.format(rating.average),
            count: rating.count,
            defaultValue_one: '{{average}} out of 5 from {{count}} rating',
            defaultValue: '{{average}} out of 5 from {{count}} ratings',
          })}
      {copyCount > 0 &&
        ` · ${t('copies', {
          count: copyCount,
          defaultValue_one: '{{count}} copy',
          defaultValue: '{{count}} copies',
        })}`}
    </p>
  );
}

/**
 * The deck page's rating block: the line every viewer sees, and "Rate this deck" for a signed-in member who studied a
 * copy (the server decides, `eligibility`). A member who has a copy but has not studied it enough is told how far they
 * are; everyone else (the owner, an editor, a member with no copy) sees the line alone.
 */
export function DeckRatingBlock({
  deckId,
  rating,
  copyCount,
  viewerCanRate,
}: {
  deckId: string;
  rating: RatingDisplay;
  copyCount: number;
  /** A signed-in viewer who is neither the owner nor an editor of a public deck. */
  viewerCanRate: boolean;
}) {
  const query = useQuery({
    ...apiQuery(getDeckRatingApi, { params: { id: deckId } }),
    enabled: viewerCanRate,
    retry: false,
  });
  const arrival = useArrival(!viewerCanRate || !query.isPending);
  const view = query.data;
  return (
    <div className={arrival}>
      <DeckRatingLine rating={view?.summary ?? rating} copyCount={view?.copies ?? copyCount} />
      {viewerCanRate && query.isPending && <Skeleton className="mt-2 h-9 w-full" aria-busy />}
      {view && <RateControl deckId={deckId} view={view} />}
    </div>
  );
}

function RateControl({ deckId, view }: { deckId: string; view: DeckRatingView }) {
  const { t } = useTranslation('deck-ratings');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const name = useId();
  const key = apiQuery(getDeckRatingApi, { params: { id: deckId } }).queryKey;

  if (view.eligibility === 'not-studied') {
    return (
      <p className="t-meta mt-2">
        {t('rate-study-more', {
          reviews: view.reviews,
          needed: view.needed,
          defaultValue: 'Study your copy of this deck to rate it: {{reviews}} of {{needed}} reviews so far.',
        })}
      </p>
    );
  }
  if (view.eligibility !== 'ok') return null;

  const keep = (next: { stars: number | null; summary: RatingDisplay }) =>
    queryClient.setQueryData<DeckRatingView>(key, (old) => (old ? { ...old, ...next } : old));

  async function rate(stars: number) {
    try {
      const res = await api(rateDeckApi, { params: { id: deckId }, body: { stars } });
      keep(res);
      toast.success(t('rate-saved', { defaultValue: 'Rating saved' }));
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('rate-failed', { defaultValue: 'Could not save your rating' }));
    }
  }

  async function remove() {
    try {
      const res = await api(removeDeckRatingApi, { params: { id: deckId } });
      keep(res);
      toast.success(t('rate-removed', { defaultValue: 'Rating removed' }));
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('rate-failed', { defaultValue: 'Could not save your rating' }));
    }
  }

  return (
    <fieldset className="mt-3 min-w-0">
      <legend className="t-label mb-1">{t('rate-title', { defaultValue: 'Rate this deck' })}</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {STARS.map((n) => (
          <label key={n} className="inline-flex min-h-9 items-center gap-2 t-body pointer-coarse:min-h-11">
            <input
              type="radio"
              name={name}
              value={n}
              checked={view.stars === n}
              onChange={() => void rate(n)}
              className="size-4 shrink-0 accent-site-text pointer-coarse:size-5"
            />
            {t('stars-n', { count: n, defaultValue_one: '{{count}} star', defaultValue: '{{count}} stars' })}
          </label>
        ))}
        {view.stars !== null && (
          <Button type="button" variant="ghost" onClick={() => void remove()}>
            {t('rate-remove', { defaultValue: 'Remove my rating' })}
          </Button>
        )}
      </div>
    </fieldset>
  );
}
