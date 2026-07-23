'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Star, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import type { ResolvedUser } from '@/lib/user-display';

const MAX_CIRCLE = 150;

/**
 * CircleManager (§11) — pick close friends from the people you follow. Silent
 * (no one is notified) and never publicly visible. Full-set replace on save.
 */
export function CircleManager() {
  const { t } = useTranslation('c-circle');
  const [candidates, setCandidates] = useState<ResolvedUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/circle')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { members: ResolvedUser[]; candidates: ResolvedUser[] } | null) => {
        if (cancelled || !data) return;
        setCandidates(data.candidates);
        setSelected(new Set(data.members.map((m) => m.id)));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (u) =>
        (u.name ?? '').toLowerCase().includes(q) ||
        (u.handle ?? '').toLowerCase().includes(q) ||
        (u.username ?? '').toLowerCase().includes(q),
    );
  }, [candidates, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= MAX_CIRCLE) {
          toast.error(t('limit', { defaultValue: `Up to ${MAX_CIRCLE} close friends` }));
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/circle', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      if (!res.ok) throw new Error('save failed');
      toast.success(t('saved', { defaultValue: 'Close friends updated' }));
    } catch {
      toast.error(t('error', { defaultValue: "Couldn't save your circle" }));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-site-text-muted">
        {t('intro', {
          defaultValue:
            'Pick close friends from the people you follow. No one is told they were added.',
        })}
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-site-text-dim" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search', { defaultValue: 'Search people you follow' })}
          aria-label={t('search', { defaultValue: 'Search people you follow' })}
          className="ps-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Star}
          title={t('none-title', { defaultValue: 'No one to add yet' })}
          description={t('none-desc', { defaultValue: 'Follow people to add them here.' })}
        />
      ) : (
        <ul className="divide-y divide-site-border">
          {filtered.map((u) => {
            const checked = selected.has(u.id);
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => toggle(u.id)}
                  aria-pressed={checked}
                  className="flex w-full items-center gap-3 py-2.5 text-start"
                >
                  <UserAvatar src={u.image ?? undefined} alt={u.name ?? 'User'} size={40} fallbackName={u.name ?? undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-site-text">{u.name ?? u.handle}</span>
                    {u.handle ? <span className="block truncate text-xs text-site-text-muted">@{u.handle}</span> : null}
                  </span>
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border',
                      checked
                        ? 'border-site-accent bg-site-accent text-site-accent-fg'
                        : 'border-site-border',
                    )}
                    aria-hidden
                  >
                    {checked ? <Star className="h-3.5 w-3.5 fill-current" /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-site-border bg-site-surface py-3">
        <span className="text-sm text-site-text-muted">
          {selected.size}/{MAX_CIRCLE}
        </span>
        <Button variant="accent" onClick={save} loading={saving}>
          {t('save', { defaultValue: 'Save' })}
        </Button>
      </div>
    </div>
  );
}
