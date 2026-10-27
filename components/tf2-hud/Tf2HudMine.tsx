/**
 * Your HUDs: the ones saved to your account, plus drafts on this device.
 */
'use client';

import { Link } from '@tanstack/react-router';
import { Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Tf2Header from '@/components/tf2-hud/Tf2Header';
import { SignInRequiredDialog } from '@/components/shared/SignInRequiredDialog';
import { useSession } from '@/components/Providers';
import { useSentinel } from '@/hooks/useSentinel';
import { api } from '@/lib/tf2-hud/api';
import type { HudSummary } from '@/lib/tf2-hud/api-types';
import { deleteDraft, listDrafts, type DraftSummary } from '@/lib/tf2-hud/local-drafts';
import { ConfirmDialog } from './dialogs';
import HudCard from './HudCard';
import { EmptyNote, IconBtn } from './ui';

export default function Tf2HudMine() {
  const { t } = useTranslation('c-tf2-hud');
  const { data: session, isPending } = useSession();
  const [huds, setHuds] = useState<HudSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [removing, setRemoving] = useState<HudSummary | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    void listDrafts().then(setDrafts);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const load = useCallback(
    async (after: string | null) => {
      const mine = ++seq.current;
      try {
        const r = await api.list({
          mine: true,
          sort: 'new',
          q: debounced || undefined,
          cursor: after ?? undefined,
          limit: 24,
        });
        if (mine !== seq.current) return;
        setHuds((cur) => (after && cur ? [...cur, ...r.items] : r.items));
        setCursor(r.nextCursor);
      } catch {
        if (mine === seq.current) {
          setHuds((cur) => cur ?? []);
          setCursor(null);
        }
      }
    },
    [debounced],
  );
  useEffect(() => {
    if (session) void load(null);
  }, [session, load]);
  const more = useSentinel(() => void load(cursor), {
    enabled: cursor !== null,
    watch: huds?.length,
  });
  const shownDrafts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? drafts.filter((d) => d.meta.name.toLowerCase().includes(q)) : drafts;
  }, [drafts, query]);

  return (
    <div className="app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
      <Tf2Header
        title={t('my-huds', { defaultValue: 'My HUDs' })}
        backLabel="RMH TF2 HUD Editor"
        backHref="/tf2/hud-editor"
      />
      <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-8">
        {!isPending && !session ? (
          <SignInRequiredDialog
            open
            onClose={() => undefined}
            feature={t('feature-mine', { defaultValue: 'See your saved HUDs' })}
          />
        ) : null}

        <div className="relative">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-(--app-text-dim)"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search-my-huds', { defaultValue: 'Search your HUDs and drafts' })}
            aria-label={t('search-my-huds', { defaultValue: 'Search your HUDs and drafts' })}
            className="h-10 w-full rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) ps-9 pe-3 text-sm text-(--app-text) placeholder:text-(--app-text-dim)"
          />
        </div>

        <section aria-labelledby="mine-saved">
          <h2 id="mine-saved" className="tf2hud-panel-head mb-2">
            {t('saved-account-title', { defaultValue: 'Saved to your account' })}
          </h2>
          {huds === null ? (
            <EmptyNote>{t('loading', { defaultValue: 'Loading…' })}</EmptyNote>
          ) : huds.length === 0 ? (
            <EmptyNote>
              {t('none-saved', {
                defaultValue: 'Nothing saved yet. Use “Save & share” in the editor.',
              })}
            </EmptyNote>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {huds.map((h) => (
                <li key={h.id} className="contents">
                  <HudCard
                    hud={h}
                    actions={
                      <>
                        <IconBtn
                          icon={Trash2}
                          size="xs"
                          label={t('delete-hud', {
                            defaultValue: 'Delete {{name}}',
                            name: h.title,
                          })}
                          onClick={() => setRemoving(h)}
                        />
                        <Link
                          to="/tf2/hud-editor/editor"
                          search={{ hud: h.id }}
                          className="inline-flex h-7 items-center rounded-(--app-radius-sm) bg-(--app-accent) px-2 text-xs font-semibold text-(--app-accent-fg) hover:bg-(--app-accent-hover)"
                        >
                          {t('open', { defaultValue: 'Open' })}
                        </Link>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {cursor ? <div ref={more} aria-hidden className="h-10" /> : null}
        </section>

        <section aria-labelledby="mine-drafts">
          <h2 id="mine-drafts" className="tf2hud-panel-head mb-2">
            {t('local-drafts', { defaultValue: 'Drafts on this device' })}
          </h2>
          {shownDrafts.length === 0 ? (
            <EmptyNote>{t('no-drafts', { defaultValue: 'No local drafts.' })}</EmptyNote>
          ) : (
            <ul className="divide-y divide-(--app-border) rounded-(--app-radius) border border-(--app-border)">
              {shownDrafts.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                  <Link
                    to="/tf2/hud-editor/editor"
                    search={{ draft: d.id }}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {d.meta.name}
                  </Link>
                  <span className="shrink-0 text-xs text-(--app-text-dim)">
                    {new Date(d.updatedAt).toLocaleString()}
                  </span>
                  <IconBtn
                    icon={Trash2}
                    size="xs"
                    label={t('delete-draft', {
                      defaultValue: 'Delete draft {{name}}',
                      name: d.meta.name,
                    })}
                    onClick={() =>
                      void deleteDraft(d.id).then(() =>
                        setDrafts((c) => c.filter((x) => x.id !== d.id)),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('delete-hud-title', {
          defaultValue: 'Delete “{{name}}”?',
          name: removing?.title ?? '',
        })}
        description={t('delete-hud-body', {
          defaultValue:
            'This permanently deletes the HUD, its history and its share links. Forks other people made stay.',
        })}
        confirm={t('delete', { defaultValue: 'Delete' })}
        danger
        onConfirm={() => {
          if (!removing) return;
          const id = removing.id;
          void api
            .remove(id)
            .then(() => setHuds((c) => c?.filter((h) => h.id !== id) ?? c))
            .catch(() =>
              toast.error(t('delete-failed', { defaultValue: 'Could not delete that HUD.' })),
            );
        }}
      />
    </div>
  );
}
