/**
 * The loadout half of the workshop: public loadouts to browse, filter by class,
 * open, or copy into the builder.
 */
'use client';

import { Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TfTabs, type TfTab } from '@/components/tf2-hud/TfTabs';
import { SelectField } from '@/components/tf2-hud/ui';
import { useSentinel } from '@/hooks/useSentinel';
import { loadoutApi } from '@/lib/tf2-loadout/api';
import type { LoadoutSummary } from '@/lib/tf2-loadout/api-types';
import { TF_CLASSES, type TfClass } from '@/lib/tf2-loadout/catalog-types';
import { useCatalog } from '@/lib/tf2-loadout/use-catalog';
import LoadoutCard from './LoadoutCard';
import { CLASS_DEFAULT } from './labels';

type Sort = 'new' | 'top';

export default function LoadoutWorkshopList() {
  const { t } = useTranslation('c-tf2-hud');
  const cat = useCatalog();
  const [sort, setSort] = useState<Sort>('top');
  const [tfClass, setTfClass] = useState<TfClass | ''>('');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<LoadoutSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const seq = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const load = useCallback(
    async (after: string | null) => {
      const mine = ++seq.current;
      setState('loading');
      try {
        const res = await loadoutApi.list({
          sort,
          tfClass: tfClass || undefined,
          q: debounced || undefined,
          cursor: after ?? undefined,
          limit: 24,
        });
        if (mine !== seq.current) return;
        setItems((cur) => (after ? [...cur, ...res.items] : res.items));
        setCursor(res.nextCursor);
        setState('ready');
      } catch {
        if (mine === seq.current) setState('error');
      }
    },
    [sort, tfClass, debounced],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const more = useSentinel(() => void load(cursor), {
    enabled: cursor !== null && state === 'ready',
    watch: items.length,
  });

  const tabs: TfTab[] = [
    { id: 'top', label: t('sort-top', { defaultValue: 'Top' }) },
    { id: 'new', label: t('sort-new', { defaultValue: 'Newest' }) },
  ];
  const idx = cat.status === 'ready' ? cat.index : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 py-6">
        <div className="min-w-0 sm:max-w-xs">
          <TfTabs
            tabs={tabs}
            value={sort}
            size="sm"
            onChange={(id) => setSort(id as Sort)}
            aria-label={t('sort', { defaultValue: 'Sort' })}
          />
        </div>
        <SelectField
          value={tfClass}
          onChange={(e) => setTfClass(e.target.value as TfClass | '')}
          aria-label={t('class', { defaultValue: 'Class' })}
          className="h-10 w-40"
        >
          <option value="">{t('all-classes', { defaultValue: 'All classes' })}</option>
          {TF_CLASSES.map((c) => (
            <option key={c} value={c}>
              {t(`class-${c}`, { defaultValue: CLASS_DEFAULT[c] })}
            </option>
          ))}
        </SelectField>
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-(--app-text-dim)"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search-loadouts', { defaultValue: 'Search loadouts' })}
            aria-label={t('search-loadouts', { defaultValue: 'Search loadouts' })}
            className="h-10 w-full rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) ps-9 pe-3 text-sm text-(--app-text) placeholder:text-(--app-text-dim)"
          />
        </div>
        <Link
          to="/tf2/loadout"
          search={{}}
          className="inline-flex h-10 items-center rounded-(--app-radius-sm) bg-(--app-accent) px-4 text-sm font-semibold text-(--app-accent-fg) hover:bg-(--app-accent-hover)"
        >
          {t('new-loadout-long', { defaultValue: 'New loadout' })}
        </Link>
      </div>

      {state === 'error' ? (
        <p role="alert" className="py-12 text-center text-sm text-(--app-danger)">
          {t('workshop-error', { defaultValue: 'Could not load the workshop.' })}{' '}
          <button type="button" className="underline" onClick={() => void load(null)}>
            {t('retry', { defaultValue: 'Retry' })}
          </button>
        </p>
      ) : items.length === 0 && state === 'ready' ? (
        <p className="py-12 text-center text-sm text-(--app-text-muted)">
          {debounced || tfClass
            ? t('loadouts-no-match', { defaultValue: 'No loadouts match.' })
            : t('loadouts-empty', {
                defaultValue: 'No public loadouts yet — publish the first one!',
              })}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy={state === 'loading'}>
          {items.map((l) => (
            <li key={l.id} className="contents">
              <LoadoutCard
                loadout={l}
                idx={idx}
                actions={
                  <Link
                    to="/tf2/loadout/l/$slug"
                    params={{ slug: l.slug }}
                    className="inline-flex h-7 items-center rounded-(--app-radius-sm) border border-(--app-border-bright) px-2 text-xs font-semibold text-(--app-text) hover:bg-(--app-surface-hover)"
                  >
                    {t('open', { defaultValue: 'Open' })}
                  </Link>
                }
              />
            </li>
          ))}
          {state === 'loading'
            ? Array.from({ length: items.length ? 3 : 6 }, (_, i) => (
                <li
                  key={`sk${i}`}
                  className="h-48 animate-pulse rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle)"
                  aria-hidden
                />
              ))
            : null}
        </ul>
      )}

      {cursor ? <div ref={more} aria-hidden className="h-10" /> : null}
    </>
  );
}
