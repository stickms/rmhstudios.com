/**
 * The workshop: public HUDs to browse, open, or fork into the editor.
 */
'use client';

import { Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppHeader from '@/components/shared/AppHeader';
import { TfTabs, type TfTab } from './TfTabs';
import { api } from '@/lib/tf2-hud/api';
import type { HudSummary } from '@/lib/tf2-hud/api-types';
import HudCard from './HudCard';
import { Btn } from './ui';

type Sort = 'new' | 'top' | 'forks';

export default function Tf2HudWorkshop() {
  const { t } = useTranslation('c-tf2-hud');
  const [sort, setSort] = useState<Sort>('top');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<HudSummary[]>([]);
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
        const res = await api.list({
          sort,
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
    [sort, debounced],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const tabs: TfTab[] = [
    { id: 'top', label: t('sort-top', { defaultValue: 'Top' }) },
    { id: 'new', label: t('sort-new', { defaultValue: 'Newest' }) },
    { id: 'forks', label: t('sort-forks', { defaultValue: 'Most forked' }) },
  ];

  return (
    <div className="app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
      <AppHeader
        title={t('workshop', { defaultValue: 'HUD Workshop' })}
        backLabel="RMH TF2 HUD Editor"
        backHref="/tf2-hud"
      />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16">
        <div className="flex flex-wrap items-center gap-3 py-6">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <TfTabs
              tabs={tabs}
              value={sort}
              size="sm"
              onChange={(id) => setSort(id as Sort)}
              aria-label={t('sort', { defaultValue: 'Sort' })}
            />
          </div>
          <div className="relative min-w-48 flex-1">
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-(--app-text-dim)"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search-huds', { defaultValue: 'Search HUDs or tags' })}
              aria-label={t('search-huds', { defaultValue: 'Search HUDs or tags' })}
              className="h-10 w-full rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) ps-9 pe-3 text-sm text-(--app-text) placeholder:text-(--app-text-dim)"
            />
          </div>
          <Link
            to="/tf2-hud/editor"
            search={{}}
            className="inline-flex h-10 items-center rounded-(--app-radius-sm) bg-(--app-accent) px-4 text-sm font-semibold text-(--app-accent-fg) hover:bg-(--app-accent-hover)"
          >
            {t('new-hud', { defaultValue: 'New HUD' })}
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
            {debounced
              ? t('workshop-no-match', { defaultValue: 'No HUDs match “{{q}}”.', q: debounced })
              : t('workshop-empty', {
                  defaultValue: 'No public HUDs yet — publish the first one!',
                })}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy={state === 'loading'}>
            {items.map((h) => (
              <li key={h.id} className="contents">
                <HudCard
                  hud={h}
                  actions={
                    <Link
                      to="/tf2-hud/editor"
                      search={{ fork: h.id }}
                      className="inline-flex h-7 items-center rounded-(--app-radius-sm) border border-(--app-border-bright) px-2 text-xs font-semibold text-(--app-text) hover:bg-(--app-surface-hover)"
                    >
                      {t('edit-copy', { defaultValue: 'Edit a copy' })}
                    </Link>
                  }
                />
              </li>
            ))}
            {state === 'loading'
              ? Array.from({ length: items.length ? 3 : 6 }, (_, i) => (
                  <li
                    key={`sk${i}`}
                    className="h-40 animate-pulse rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle)"
                    aria-hidden
                  />
                ))
              : null}
          </ul>
        )}

        {cursor && state === 'ready' ? (
          <div className="mt-6 text-center">
            <Btn onClick={() => void load(cursor)}>
              {t('load-more', { defaultValue: 'Load more' })}
            </Btn>
          </div>
        ) : null}
      </main>
    </div>
  );
}
