/**
 * `/homes/compare?ids=a,b,c` — up to four of your saved homes side by side (s12 10).
 *
 * The choice lives in the URL as one comma-separated parameter, so a comparison survives a reload and a tab switch.
 * Only your own saved listings load; an id that is not in your saved homes is dropped with one line. The place that
 * distances are measured to, the unit and your budget (the affordability profile) stay on this device.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { CompareTable } from '@/components/homes/CompareTable';
import { LocationSearch, type HomesPlace } from '@/components/homes/LocationSearch';
import { apiQuery } from '@/lib/contract/client';
import { loadIncomeProfile, DEFAULT_INCOME_PROFILE, type IncomeProfile } from '@/lib/homes/affordability';
import { buildComparison, compareIdsParam, parseCompareIds, MAX_COMPARE } from '@/lib/homes/compare';
import { compareHomeFavoritesApi } from '@/lib/homes/compare.contract';
import {
  DEFAULT_COMPARE_PREFS,
  readComparePrefs,
  writeComparePrefs,
  type ComparePrefs,
} from '@/lib/homes/compare-place';
import type { DistanceUnit } from '@/lib/homes/distance';
import { cn } from '@/lib/utils';

interface CompareSearch {
  ids?: string;
}

export const Route = createFileRoute('/_site/homes/compare')({
  head: () => ({
    meta: [{ title: 'RMHHomes — Compare saved homes' }, { name: 'robots', content: 'noindex' }],
  }),
  validateSearch: (search: Record<string, unknown>): CompareSearch =>
    typeof search.ids === 'string' && search.ids.length > 0 ? { ids: search.ids.slice(0, 1000) } : {},
  component: HomesComparePage,
});

function HomesComparePage() {
  const { t } = useTranslation('homes-compare');
  const { data: session, isPending } = useSession();
  const { ids: idsParam } = Route.useSearch();
  const navigate = useNavigate();
  const refusalText = useRefusalText();

  const parsed = useMemo(() => parseCompareIds(idsParam), [idsParam]);

  // Device-only choices are read after mount so the server and first client render agree.
  const [prefs, setPrefs] = useState<ComparePrefs>(DEFAULT_COMPARE_PREFS);
  const [profile, setProfile] = useState<IncomeProfile>(DEFAULT_INCOME_PROFILE);
  const [placeQuery, setPlaceQuery] = useState('');
  useEffect(() => {
    const stored = readComparePrefs();
    setPrefs(stored);
    setPlaceQuery(stored.place?.label ?? '');
    setProfile(loadIncomeProfile());
  }, []);

  const query = useQuery({
    ...apiQuery(compareHomeFavoritesApi, { query: { ids: parsed.ids.join(',') } }),
    enabled: Boolean(session) && parsed.ids.length > 0,
    retry: false,
  });
  const arrival = useArrival(!query.isPending || parsed.ids.length === 0);

  const choosePlace = useCallback(
    (place: HomesPlace) => {
      const next: ComparePrefs = { ...prefs, place: { label: place.label, lat: place.lat, lng: place.lng } };
      setPrefs(next);
      writeComparePrefs(next);
    },
    [prefs],
  );
  const clearPlace = useCallback(() => {
    const next: ComparePrefs = { ...prefs, place: null };
    setPrefs(next);
    setPlaceQuery('');
    writeComparePrefs(next);
  }, [prefs]);
  const chooseUnit = useCallback(
    (unit: string) => {
      const next: ComparePrefs = { ...prefs, unit: unit === 'km' ? 'km' : 'mi' };
      setPrefs(next);
      writeComparePrefs(next);
    },
    [prefs],
  );
  const removeColumn = useCallback(
    (id: string) => {
      const rest = parsed.ids.filter((x) => x !== id);
      void navigate({
        to: '/homes/compare',
        search: rest.length > 0 ? { ids: compareIdsParam(rest) } : {},
        replace: true,
      });
    },
    [navigate, parsed.ids],
  );

  const model = useMemo(
    () =>
      query.data
        ? buildComparison({
            listings: query.data.listings,
            changes: query.data.changes,
            notes: query.data.notes,
            place: prefs.place,
            profile,
          })
        : null,
    [query.data, prefs.place, profile],
  );

  const title = t('page-title', { defaultValue: 'Compare saved homes' });
  const back = {
    backTo: '/homes/manage',
    backLabel: t('back-to-saved', { defaultValue: 'Back to saved homes' }),
  } as const;

  if (isPending) {
    return (
      <PageLayout title={title} wide {...back}>
        <div className="grid place-items-center py-24 text-site-text-muted">
          <Spinner />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title={title} wide {...back}>
        <SignedOutPrompt
          callbackURL={`/homes/compare${idsParam ? `?ids=${encodeURIComponent(idsParam)}` : ''}`}
          title={t('signed-out', { defaultValue: 'Sign in to compare your saved homes.' })}
        />
      </PageLayout>
    );
  }

  const unitTabs: TabItem[] = [
    { id: 'mi', label: t('unit-mi', { defaultValue: 'Miles' }) },
    { id: 'km', label: t('unit-km', { defaultValue: 'Kilometres' }) },
  ];

  const toSaved = (
    <Button asChild>
      <Link to="/homes/manage" search={{ tab: 'saved' }}>
        {t('choose-homes', { defaultValue: 'Choose saved homes' })}
      </Link>
    </Button>
  );

  let body;
  if (parsed.ids.length === 0) {
    body = (
      <EmptyState
        className={arrival}
        title={t('empty-title', { defaultValue: 'Nothing to compare yet' })}
        description={t('empty-desc', {
          defaultValue: 'Tick up to {{max}} homes on your Saved tab, then choose Compare.',
          max: MAX_COMPARE,
        })}
        action={toSaved}
      />
    );
  } else if (query.isPending) {
    body = <Skeleton className="h-72 w-full" aria-busy="true" />;
  } else if (query.isError) {
    body = (
      <EmptyState
        className={arrival}
        title={refusalText.maybe(query.error) ?? t('error-title', { defaultValue: 'Could not load your comparison' })}
        action={
          parsed.tooMany ? (
            toSaved
          ) : (
            <Button variant="default" onClick={() => void query.refetch()}>
              {t('retry', { defaultValue: 'Try again' })}
            </Button>
          )
        }
      />
    );
  } else if (model && model.columns.length === 0) {
    body = (
      <EmptyState
        className={arrival}
        title={t('none-saved-title', { defaultValue: 'None of these are in your saved homes' })}
        description={t('none-saved-desc', { defaultValue: 'Save a home first, then compare it here.' })}
        action={toSaved}
      />
    );
  } else if (model) {
    const missing = query.data?.missing ?? 0;
    body = (
      <div className={cn('w-full', arrival)}>
        {missing > 0 && (
          <p className="t-meta mb-3" role="status">
            {t('missing', {
              defaultValue_one: '{{count}} listing is not in your saved homes',
              defaultValue_other: '{{count}} listings are not in your saved homes',
              defaultValue: '{{count}} listings are not in your saved homes',
              count: missing,
            })}
          </p>
        )}
        <CompareTable
          model={model}
          unit={prefs.unit as DistanceUnit}
          placeLabel={prefs.place?.label}
          onRemove={removeColumn}
        />
      </div>
    );
  }

  return (
    <PageLayout title={title} wide {...back}>
      <div className="mb-4 flex flex-col gap-3 border-b border-site-border pb-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="t-label mb-1.5">{t('place-label', { defaultValue: 'Measure distance to' })}</p>
          <LocationSearch
            value={placeQuery}
            onQueryChange={(q) => {
              setPlaceQuery(q);
              if (q === '' && prefs.place) clearPlace();
            }}
            onSelect={choosePlace}
            placeholder={t('place-placeholder', { defaultValue: 'Work, school or an address' })}
          />
          <p className="t-meta mt-1">
            {t('place-hint', {
              defaultValue: 'Straight-line distance, not travel time. The place stays on this device.',
            })}
          </p>
        </div>
        {/* The strip sizes to its two tabs, so the place field keeps the rest of the row on wide screens. */}
        <div className="shrink-0">
          <Tabs
            tabs={unitTabs}
            value={prefs.unit}
            onChange={chooseUnit}
            size="sm"
            aria-label={t('unit-label', { defaultValue: 'Distance unit' })}
          />
        </div>
      </div>
      {body}
    </PageLayout>
  );
}
