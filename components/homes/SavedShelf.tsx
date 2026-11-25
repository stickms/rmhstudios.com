/**
 * The Saved tab of `/homes/manage` (s12 10): your saved listings as rows, each with your private note and a Compare
 * tick. Up to four can be ticked (the fifth is disabled); "Compare" opens `/homes/compare?ids=…`. Unsaving a home
 * that has a note asks first, because the note goes with it.
 */
import { useCallback, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { apiQuery } from '@/lib/contract/client';
import { listMyHomeListingsApi } from '@/lib/homes/homes.contract';
import { compareIdsParam, MAX_COMPARE } from '@/lib/homes/compare';
import { cn } from '@/lib/utils';
import { FavoriteNote } from './FavoriteNote';
import { ListingCard } from './ListingCard';

export function SavedShelf() {
  const { t } = useTranslation('homes-compare');
  const confirm = useConfirm();
  const query = useQuery(apiQuery(listMyHomeListingsApi, { query: { scope: 'favorites' } }));
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [notes, setNotes] = useState<Readonly<Record<string, string | null>>>({});
  const [picked, setPicked] = useState<readonly string[]>([]);
  const arrival = useArrival(!query.isPending);

  const listings = useMemo(() => (query.data?.listings ?? []).filter((l) => !removed.has(l.id)), [query.data, removed]);
  const noteOf = useCallback(
    (id: string, saved: string | null | undefined) => (id in notes ? notes[id] : saved) ?? null,
    [notes],
  );

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) =>
      on ? (prev.includes(id) || prev.length >= MAX_COMPARE ? prev : [...prev, id]) : prev.filter((x) => x !== id),
    );

  if (query.isPending) {
    return (
      <div aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3 border-b border-site-border py-3.5">
            <Skeleton className="aspect-[4/3] w-32 shrink-0 rounded-site" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        className={arrival}
        title={t('saved-error', { defaultValue: 'Could not load your saved homes' })}
        action={
          <Button variant="default" onClick={() => void query.refetch()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        }
      />
    );
  }

  if (listings.length === 0) {
    return (
      <EmptyState
        className={arrival}
        icon={Bookmark}
        title={t('saved-empty-title', { defaultValue: 'No saved listings yet' })}
        description={t('saved-empty-desc', { defaultValue: 'Tap the heart on any listing to save it here.' })}
      />
    );
  }

  const visiblePicked = picked.filter((id) => listings.some((l) => l.id === id));
  const full = visiblePicked.length >= MAX_COMPARE;

  return (
    <div className={cn('w-full', arrival)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-site-border pb-3">
        <p className="t-meta min-w-0 flex-1" role="status">
          {visiblePicked.length < 2
            ? t('compare-hint', {
                defaultValue: 'Tick two to {{max}} homes to compare them side by side.',
                max: MAX_COMPARE,
              })
            : t('compare-count', {
                defaultValue: '{{count}} of {{max}} ticked',
                count: visiblePicked.length,
                max: MAX_COMPARE,
              })}
        </p>
        {visiblePicked.length >= 2 ? (
          <Button asChild>
            <Link to="/homes/compare" search={{ ids: compareIdsParam(visiblePicked) }}>
              {t('compare-go', { defaultValue: 'Compare' })}
            </Link>
          </Button>
        ) : (
          <Button disabled>{t('compare-go', { defaultValue: 'Compare' })}</Button>
        )}
      </div>
      <div data-slot="homes-list" data-layout="rows">
        {listings.map((l) => {
          const checked = visiblePicked.includes(l.id);
          const note = noteOf(l.id, l.note);
          return (
            <ListingCard
              key={l.id}
              listing={l}
              layout="row"
              showStatus
              onHover={() => {}}
              onFavoriteChange={(id, favorited) => {
                if (!favorited) setRemoved((prev) => new Set(prev).add(id));
              }}
              confirmUnsave={async () =>
                note == null ||
                (await confirm({
                  title: t('unsave-title', { defaultValue: 'Remove this saved home?' }),
                  description: t('unsave-desc', {
                    defaultValue: 'Your note on it is deleted with it.',
                  }),
                  confirmLabel: t('unsave-confirm', { defaultValue: 'Remove and delete note' }),
                  danger: true,
                }))
              }
              footer={
                <div className="mt-2 flex flex-col gap-2">
                  <label className="t-body inline-flex min-h-9 items-center gap-2 pointer-coarse:min-h-11">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && full}
                      onChange={(e) => toggle(l.id, e.target.checked)}
                      className="size-4 shrink-0 accent-site-text pointer-coarse:size-5"
                    />
                    <span>
                      {t('compare-tick', { defaultValue: 'Compare' })}
                      <span className="sr-only">{` — ${l.title}`}</span>
                    </span>
                  </label>
                  <FavoriteNote
                    listingId={l.id}
                    note={note}
                    onChange={(next) => setNotes((prev) => ({ ...prev, [l.id]: next }))}
                  />
                </div>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
