'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bookmark, BookmarkPlus, Bell, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useClipboard } from '@/hooks/useClipboard';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import type { SavedSearchView } from '@/lib/search/saved';

/** The search operators shown as copyable examples. */
const OPERATOR_EXAMPLES = ['from:@user', 'has:media', 'before:2026-01-01', 'after:2025-01-01'] as const;

/**
 * SavedSearches (§18) — save the current query (operators included) and re-run
 * or alert on saved ones. Shown above the results on /search.
 */
export function SavedSearches({ currentQuery }: { currentQuery: string }) {
  const { t } = useTranslation('search');
  const [saved, setSaved] = useState<SavedSearchView[] | null>(null);
  const [showTips, setShowTips] = useState(false);
  const { copy } = useClipboard();

  async function copyOperator(op: string) {
    if (await copy(op)) {
      toast.success(t('operator-copied', { defaultValue: 'Copied {{operator}}', operator: op }));
    }
  }

  useEffect(() => {
    fetch('/api/search/saved')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { saved: SavedSearchView[] } | null) => setSaved(d?.saved ?? []))
      .catch(() => setSaved([]));
  }, []);

  const q = currentQuery.trim();
  const alreadySaved = !!saved?.some((s) => s.query === q);

  async function saveCurrent() {
    if (!q) return;
    try {
      const res = await fetch('/api/search/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error();
      const { saved: row } = (await res.json()) as { saved: SavedSearchView };
      setSaved((prev) => [row, ...(prev ?? [])]);
      toast.success(t('saved', { defaultValue: 'Search saved' }));
    } catch {
      toast.error(t('error', { defaultValue: "Couldn't save the search" }));
    }
  }

  async function remove(id: string) {
    setSaved((prev) => prev?.filter((s) => s.id !== id) ?? null);
    await fetch(`/api/search/saved/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async function toggleAlert(s: SavedSearchView) {
    const next = !s.alerts;
    setSaved((prev) => prev?.map((x) => (x.id === s.id ? { ...x, alerts: next } : x)) ?? null);
    await fetch(`/api/search/saved/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alerts: next }),
    }).catch(() => {});
  }

  if (saved === null) return null;
  if (saved.length === 0 && !q) return null;

  return (
    <div className="px-4 pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="site-section-label flex items-center gap-2">
          <Bookmark className="size-4" aria-hidden />
          {t('saved-searches', { defaultValue: 'Saved searches' })}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowTips((v) => !v)}
            aria-expanded={showTips}
          >
            {t('operators', { defaultValue: 'Operators' })}
          </Button>
          {q && !alreadySaved ? (
            <Button variant="ghost" size="xs" onClick={saveCurrent}>
              <BookmarkPlus aria-hidden />
              {t('save', { defaultValue: 'Save' })}
            </Button>
          ) : null}
        </div>
      </div>

      {showTips ? (
        <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-site-text-muted">
          {OPERATOR_EXAMPLES.map((op, i) => (
            <span key={op} className="inline-flex items-center gap-2">
              {i > 0 ? <span aria-hidden>·</span> : null}
              <button
                type="button"
                onClick={() => void copyOperator(op)}
                aria-label={t('operator-copy', { defaultValue: 'Copy {{operator}}', operator: op })}
                title={t('operator-copy', { defaultValue: 'Copy {{operator}}', operator: op })}
                className="font-mono underline-offset-2 hover:text-site-text hover:underline"
              >
                {op}
              </button>
            </span>
          ))}
        </p>
      ) : null}

      {saved.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {saved.map((s) => (
            <li
              key={s.id}
              className="glass-fill inline-flex items-center gap-2 rounded-full py-1 ps-3 pe-1 text-sm"
            >
              <a
                href={`/explore?q=${encodeURIComponent(s.query)}`}
                className="max-w-44 truncate text-site-text hover:underline"
              >
                {s.query}
              </a>
              <IconButton
                icon={Bell}
                size="icon-xs"
                variant="ghost"
                onClick={() => toggleAlert(s)}
                className={cn(s.alerts && 'text-site-accent')}
                label={
                  s.alerts
                    ? t('alerts-on', { defaultValue: 'Alerts on' })
                    : t('alerts-off', { defaultValue: 'Alerts off' })
                }
              />
              <IconButton
                icon={X}
                size="icon-xs"
                variant="ghost"
                onClick={() => remove(s.id)}
                label={t('remove', { defaultValue: 'Remove' })}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
