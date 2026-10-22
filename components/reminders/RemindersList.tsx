'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlarmClock, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import type { ReminderView } from '@/lib/reminders/shared';

/**
 * Pending reminders, soonest first (plan U7). Rendered by the Saves hub.
 * The list is fetched after mount, so formatting times in the viewer's own
 * locale and zone cannot mismatch a server render.
 */
export function RemindersList() {
  const { t } = useTranslation('c-saves');
  const [items, setItems] = useState<ReminderView[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/reminders', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { reminders: [] }))
      .then((d: { reminders: ReminderView[] }) => {
        if (!cancelled) setItems(d.reminders ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function cancel(id: string) {
    const prev = items;
    setItems((list) => list?.filter((r) => r.id !== id) ?? null);
    const res = await fetch(`/api/reminders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => null);
    if (!res?.ok) {
      setItems(prev);
      toast.error(t('remind-cancel-error', { defaultValue: "Couldn't cancel the reminder" }));
    }
  }

  if (items === null) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={AlarmClock}
        title={t('reminders-empty-title', { defaultValue: 'No reminders' })}
        description={t('reminders-empty-desc', {
          defaultValue: 'Use "Remind me" on a post or notification to bring it back later.',
        })}
      />
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((r) => (
        <li key={r.id}>
          <Card interactive className="flex-row items-center gap-3 px-4 py-3">
            <a href={r.url} className="flex min-w-0 flex-1 items-center gap-3">
              <AlarmClock className="h-5 w-5 shrink-0 text-site-text-dim" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-site-text">{r.label}</span>
                <span className="block truncate text-xs text-site-text-muted">
                  {new Date(r.remindAt).toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {r.note ? ` · ${r.note}` : ''}
                </span>
              </span>
            </a>
            <IconButton
              icon={X}
              variant="ghost"
              size="icon-sm"
              onClick={() => void cancel(r.id)}
              label={t('remind-cancel', { defaultValue: 'Cancel reminder' })}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}
