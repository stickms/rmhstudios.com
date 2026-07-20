'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ListPlus, Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ListView } from '@/lib/lists/constants';

type ListRow = ListView & { containsTarget?: boolean };

/**
 * AddToListSheet (§3) — add/remove a target account from the caller's lists.
 * Loads membership state lazily on open.
 */
export function AddToListSheet({ targetUserId }: { targetUserId: string }) {
  const { t } = useTranslation('c-lists');
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    if (lists) return;
    try {
      const res = await fetch(`/api/lists?member=${encodeURIComponent(targetUserId)}`);
      if (!res.ok) throw new Error('load failed');
      const data = (await res.json()) as { lists: ListRow[] };
      setLists(data.lists);
    } catch {
      toast.error(t('load-error', { defaultValue: "Couldn't load your lists" }));
    }
  }

  async function toggle(list: ListRow) {
    const adding = !list.containsTarget;
    setPending(list.id);
    try {
      const res = await fetch(`/api/lists/${list.id}/members`, {
        method: adding ? 'PUT' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId }),
      });
      if (!res.ok) throw new Error('toggle failed');
      setLists(
        (prev) =>
          prev?.map((l) =>
            l.id === list.id
              ? { ...l, containsTarget: adding, memberCount: l.memberCount + (adding ? 1 : -1) }
              : l,
          ) ?? null,
      );
    } catch {
      toast.error(t('error', { defaultValue: "Couldn't update the list" }));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={load}>
        <ListPlus className="h-4 w-4" aria-hidden />
        {t('add-to-list', { defaultValue: 'Add to list' })}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('add-to-list', { defaultValue: 'Add to list' })}</SheetTitle>
          </SheetHeader>

          {lists === null ? (
            <p className="py-6 text-center text-sm text-site-text-muted">
              {t('loading', { defaultValue: 'Loading…' })}
            </p>
          ) : lists.length === 0 ? (
            <p className="py-6 text-center text-sm text-site-text-muted">
              {t('no-lists', { defaultValue: 'Create a list first from the Lists page.' })}
            </p>
          ) : (
            <ul className="divide-y divide-site-border">
              {lists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => toggle(l)}
                    disabled={pending === l.id}
                    aria-pressed={!!l.containsTarget}
                    className="flex w-full items-center justify-between gap-3 py-3 text-start"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-site-text">{l.name}</span>
                      <span className="block text-xs text-site-text-muted">{l.memberCount}</span>
                    </span>
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border',
                        l.containsTarget
                          ? 'border-site-accent bg-site-accent text-site-accent-fg'
                          : 'border-site-border',
                      )}
                      aria-hidden
                    >
                      {l.containsTarget ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
