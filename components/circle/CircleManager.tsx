import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { setCircleApi } from '@/lib/circle.contract';
import { circleQuery } from '@/lib/circle.queries';
import { toast } from 'sonner';
import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { SettingsSection } from '@/components/settings/SettingsSection';
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
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, isPending: loading } = useQuery(circleQuery());
  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  // The member set is the server's until the owner edits it.
  const [edited, setEdited] = useState<Set<string> | null>(null);
  const selected = useMemo(
    () => edited ?? new Set((data?.members ?? []).map((m) => m.id)),
    [edited, data],
  );

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
    setEdited((prev) => {
      const base = prev ?? selected;
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= MAX_CIRCLE) {
          toast.error(t('limit', { max: MAX_CIRCLE, defaultValue: 'Up to {{max}} close friends' }));
          return base;
        }
        next.add(id);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api(setCircleApi, { body: { userIds: Array.from(selected) } });
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
    <SettingsSection
      description={t('intro', {
        defaultValue:
          'Pick close friends from the people you follow. No one is told they were added.',
      })}
    >
      <SearchField
        value={query}
        onValueChange={setQuery}
        placeholder={t('search', { defaultValue: 'Search people you follow' })}
        aria-label={t('search', { defaultValue: 'Search people you follow' })}
      />

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
                  className="flex min-h-11 w-full items-center gap-3 py-2 text-start"
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

      <div className="flex items-center justify-between gap-3 border-t border-site-border pt-3">
        <span className="text-sm text-site-text-muted">
          {selected.size}/{MAX_CIRCLE}
        </span>
        <Button variant="default" onClick={save} loading={saving}>
          {t('save', { defaultValue: 'Save' })}
        </Button>
      </div>
    </SettingsSection>
  );
}
