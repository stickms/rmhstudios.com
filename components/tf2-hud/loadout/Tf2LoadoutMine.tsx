/**
 * The signed-in user's saved loadouts: searchable by title or item name,
 * filterable by class, loading further pages as you scroll.
 */
'use client';

import { Link } from '@tanstack/react-router';
import { Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Tf2Header from '@/components/tf2-hud/Tf2Header';
import { SignInRequiredDialog } from '@/components/shared/SignInRequiredDialog';
import { useSession } from '@/components/Providers';
import { Btn, EmptyNote, IconBtn, Modal, SelectField } from '@/components/tf2-hud/ui';
import { useSentinel } from '@/hooks/useSentinel';
import { loadoutApi } from '@/lib/tf2-loadout/api';
import type { LoadoutSummary } from '@/lib/tf2-loadout/api-types';
import { TF_CLASSES, type TfClass } from '@/lib/tf2-loadout/catalog-types';
import { useCatalog } from '@/lib/tf2-loadout/use-catalog';
import LoadoutCard from './LoadoutCard';
import { CLASS_DEFAULT } from './labels';

export default function Tf2LoadoutMine() {
  const { t } = useTranslation('c-tf2-hud');
  const { data: session, isPending } = useSession();
  const cat = useCatalog();
  const [tfClass, setTfClass] = useState<TfClass | ''>('');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<LoadoutSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [removing, setRemoving] = useState<LoadoutSummary | null>(null);
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
          mine: true,
          sort: 'new',
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
    [tfClass, debounced],
  );

  useEffect(() => {
    if (session) void load(null);
  }, [load, session]);

  const more = useSentinel(() => void load(cursor), {
    enabled: cursor !== null && state === 'ready',
    watch: items.length,
  });

  const remove = async () => {
    if (!removing) return;
    try {
      await loadoutApi.remove(removing.id);
      setItems((cur) => cur.filter((l) => l.id !== removing.id));
      toast.success(t('loadout-deleted', { defaultValue: 'Loadout deleted.' }));
    } catch {
      toast.error(t('loadout-delete-failed', { defaultValue: 'Could not delete that loadout.' }));
    } finally {
      setRemoving(null);
    }
  };

  const idx = cat.status === 'ready' ? cat.index : null;

  return (
    <div className="app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
      <Tf2Header
        title={t('my-loadouts', { defaultValue: 'My loadouts' })}
        backLabel={t('loadout-builder', { defaultValue: 'Loadout Builder' })}
        backHref="/tf2/loadout"
      />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16">
        {!isPending && !session ? (
          <SignInRequiredDialog
            open
            onClose={() => undefined}
            feature={t('feature-mine-loadouts', { defaultValue: 'See your saved loadouts' })}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-3 py-6">
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
              placeholder={t('search-my-loadouts', {
                defaultValue: 'Search by title or item name',
              })}
              aria-label={t('search-my-loadouts', {
                defaultValue: 'Search by title or item name',
              })}
              className="h-10 w-full rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) ps-9 pe-3 text-sm text-(--app-text) placeholder:text-(--app-text-dim)"
            />
          </div>
        </div>

        {state === 'error' ? (
          <p role="alert" className="py-12 text-center text-sm text-(--app-danger)">
            {t('mine-error', { defaultValue: 'Could not load your loadouts.' })}{' '}
            <button type="button" className="underline" onClick={() => void load(null)}>
              {t('retry', { defaultValue: 'Retry' })}
            </button>
          </p>
        ) : items.length === 0 && state === 'ready' ? (
          <EmptyNote>
            {debounced || tfClass
              ? t('loadouts-no-match', { defaultValue: 'No loadouts match.' })
              : t('no-loadouts-saved', {
                  defaultValue: 'Nothing saved yet. Build a loadout and press “Save loadout”.',
                })}
          </EmptyNote>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy={state === 'loading'}>
            {items.map((l) => (
              <li key={l.id} className="contents">
                <LoadoutCard
                  loadout={l}
                  idx={idx}
                  actions={
                    <>
                      <IconBtn
                        icon={Trash2}
                        size="xs"
                        label={t('delete-loadout', {
                          defaultValue: 'Delete {{name}}',
                          name: l.title,
                        })}
                        onClick={() => setRemoving(l)}
                      />
                      <Link
                        to="/tf2/loadout"
                        search={{ id: l.id }}
                        className="inline-flex h-7 items-center rounded-(--app-radius-sm) bg-(--app-accent) px-2 text-xs font-semibold text-(--app-accent-fg) hover:bg-(--app-accent-hover)"
                      >
                        {t('edit', { defaultValue: 'Edit' })}
                      </Link>
                    </>
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
      </main>

      <Modal
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('delete-loadout-title', { defaultValue: 'Delete this loadout?' })}
        description={removing?.title}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setRemoving(null)}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Btn>
            <Btn variant="danger" onClick={() => void remove()}>
              {t('delete', { defaultValue: 'Delete' })}
            </Btn>
          </>
        }
      >
        <p className="text-sm text-(--app-text-muted)">
          {t('delete-loadout-body', {
            defaultValue: 'It will also disappear from the workshop and any shared links.',
          })}
        </p>
      </Modal>
    </div>
  );
}
