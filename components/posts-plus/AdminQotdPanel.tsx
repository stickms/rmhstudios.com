'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { MAX_QOTD_LENGTH, utcDayKey } from '@/lib/posts-plus/constants';

interface Row {
  id: string;
  text: string;
  dayKey: string | null;
  createdAt: string;
}
interface Data {
  queue: Row[];
  recent: Row[];
  today: { dayKey: string; text: string; source: 'curated' | 'builtin' };
}

/**
 * /admin/qotd - the question-of-the-day prompt queue (X4). Prompts run oldest
 * first, one per UTC day; an optional date pins a prompt to that day instead.
 * When the queue is empty the built-in rotation covers the day.
 */
export function AdminQotdPanel() {
  const { t } = useTranslation('f-posts-plus');
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState('');
  const [dayKey, setDayKey] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/qotd', { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Data);
    } catch {
      toast.error(t('admin-load-failed', { defaultValue: 'Could not load the prompt queue' }));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/qotd', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), ...(dayKey ? { dayKey } : {}) }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(
          err?.error ?? t('admin-add-failed', { defaultValue: 'Could not add the prompt' }),
        );
        return;
      }
      setText('');
      setDayKey('');
      toast.success(t('admin-added', { defaultValue: 'Prompt added' }));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: Row) => {
    const res = await fetch(`/api/admin/qotd/${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(
        err?.error ?? t('admin-remove-failed', { defaultValue: 'Could not remove the prompt' }),
      );
      return;
    }
    await load();
  };

  const today = utcDayKey();

  return (
    <PageLayout
      title={t('admin-title', { defaultValue: 'Question of the day' })}
      description={t('admin-desc', {
        defaultValue:
          'Prompts run oldest first, one per UTC day. With an empty queue the built-in list covers the day.',
      })}
      backTo="/admin"
    >
      <div className="space-y-6 px-4 pt-2 pb-12">
        {data && (
          <section className="glass-fill rounded-site p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              {t('admin-today', { defaultValue: 'Running today' })}
              {data.today.source === 'builtin' && (
                <span className="ms-2 normal-case text-site-warning">
                  {t('admin-builtin', { defaultValue: '(built-in list - the queue is empty)' })}
                </span>
              )}
            </p>
            <p className="mt-1 text-site-text">{data.today.text}</p>
          </section>
        )}

        <form
          className="glass-pane space-y-3 rounded-site p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label className="block text-sm text-site-text-muted">
            <span className="mb-1 block">{t('admin-new', { defaultValue: 'New prompt' })}</span>
            <Textarea
              value={text}
              rows={2}
              maxLength={MAX_QOTD_LENGTH}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('admin-placeholder', {
                defaultValue: 'What is the best game you played this year?',
              })}
            />
          </label>
          <label className="block text-sm text-site-text-muted">
            <span className="mb-1 block">
              {t('admin-day', { defaultValue: 'Pin to a day (optional)' })}
            </span>
            <Input
              type="date"
              min={today}
              value={dayKey}
              onChange={(e) => setDayKey(e.target.value)}
            />
          </label>
          <Button type="submit" variant="accent" loading={busy} disabled={text.trim().length < 8}>
            {t('admin-add', { defaultValue: 'Add prompt' })}
          </Button>
        </form>

        {!data ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <section aria-labelledby="qotd-queue">
              <h2 id="qotd-queue" className="mb-2 text-sm font-semibold text-site-text">
                {t('admin-queue', { defaultValue: 'Queue and scheduled' })}
              </h2>
              {data.queue.length === 0 ? (
                <EmptyState
                  title={t('admin-queue-empty', { defaultValue: 'Nothing queued' })}
                  description={t('admin-queue-empty-hint', {
                    defaultValue: 'The built-in rotation will run until you add a prompt.',
                  })}
                />
              ) : (
                <ul className="space-y-2">
                  {data.queue.map((row) => (
                    <li
                      key={row.id}
                      className="glass-fill flex items-center gap-3 rounded-site px-4 py-3"
                    >
                      <span className="w-24 shrink-0 text-xs text-site-text-dim">
                        {row.dayKey ?? t('admin-next-free', { defaultValue: 'Next free day' })}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-site-text">{row.text}</span>
                      <IconButton
                        icon={Trash2}
                        variant="ghost"
                        size="icon-sm"
                        label={t('admin-remove', { defaultValue: 'Remove prompt' })}
                        onClick={() => void remove(row)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.recent.length > 0 && (
              <section aria-labelledby="qotd-recent">
                <h2 id="qotd-recent" className="mb-2 text-sm font-semibold text-site-text">
                  {t('admin-recent', { defaultValue: 'Recently run' })}
                </h2>
                <ul className="space-y-2">
                  {data.recent.map((row) => (
                    <li
                      key={row.id}
                      className="glass-fill flex items-center gap-3 rounded-site px-4 py-3"
                    >
                      <span className="w-24 shrink-0 text-xs text-site-text-dim">{row.dayKey}</span>
                      <span className="min-w-0 flex-1 text-sm text-site-text-muted">
                        {row.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
