'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { History, Trash2, Play } from 'lucide-react';

import { cn, timeAgoShort } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { IconButton } from '@/components/ui/icon-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { HorizontalScroller } from '@/components/ui/horizontal-scroller';
import {
  HISTORY_ENTITY_TYPES,
  progressRatio,
  shouldResume,
  type HistoryEntityType,
} from '@/lib/history/constants';
import type { HistoryView } from '@/lib/history/history.server';

interface HistoryData {
  items: HistoryView[];
  nextCursor: string | null;
  paused: boolean;
}

export function HistoryList({ initial }: { initial: HistoryData }) {
  const { t } = useTranslation('c-history');
  const confirm = useConfirm();
  const [items, setItems] = useState<HistoryView[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [paused, setPaused] = useState(initial.paused);
  const [filter, setFilter] = useState<HistoryEntityType | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const load = useCallback(
    async (f: HistoryEntityType | 'all', append = false, cur?: string | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (f !== 'all') params.set('type', f);
        if (append && cur) params.set('cursor', cur);
        const res = await fetch(`/api/history?${params.toString()}`);
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as HistoryData;
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
      } catch {
        toast.error(t('load-error', { defaultValue: "Couldn't load your history" }));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!mounted) {
      setMounted(true);
      return;
    }
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function togglePause(next: boolean) {
    setPaused(next);
    try {
      await fetch('/api/history', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: next }),
      });
    } catch {
      setPaused(!next);
      toast.error(t('save-error', { defaultValue: "Couldn't update the setting" }));
    }
  }

  async function clearAll() {
    const ok = await confirm({
      title: t('clear-title', { defaultValue: 'Clear all history?' }),
      description: t('clear-desc', { defaultValue: 'This cannot be undone.' }),
      danger: true,
    });
    if (!ok) return;
    setItems([]);
    setCursor(null);
    try {
      await fetch('/api/history', { method: 'DELETE' });
      toast.success(t('cleared', { defaultValue: 'History cleared' }));
    } catch {
      toast.error(t('save-error', { defaultValue: "Couldn't update the setting" }));
    }
  }

  async function removeOne(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
    } catch {
      /* best-effort */
    }
  }

  const chip = (value: HistoryEntityType | 'all', label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={cn(
        'shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors',
        filter === value
          ? 'bg-site-accent text-site-accent-fg'
          : 'glass-fill text-site-text-muted hover:border-site-border-bright',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="px-4 pt-4 pb-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-site-text-muted">
          <Switch checked={paused} onCheckedChange={togglePause} />
          {t('pause', { defaultValue: 'Pause history' })}
        </label>
        <Button variant="ghost" size="sm" onClick={clearAll} className="text-site-danger">
          <Trash2 className="h-4 w-4" aria-hidden />
          {t('clear-all', { defaultValue: 'Clear all' })}
        </Button>
      </div>

      <HorizontalScroller
        aria-label={t('filter-history', { defaultValue: 'Filter history' })}
        className="mb-4"
        surface="pill"
      >
        {chip('all', t('all', { defaultValue: 'All' }))}
        {HISTORY_ENTITY_TYPES.map((type) => chip(type, t(`type-${type}`, { defaultValue: type })))}
      </HorizontalScroller>

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={History}
          title={t('empty-title', { defaultValue: 'No history yet' })}
          description={t('empty-desc', {
            defaultValue: 'Things you watch, play, and read show up here.',
          })}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <HistoryRow item={item} onRemove={() => removeOne(item.id)} />
            </li>
          ))}
        </ul>
      )}

      {cursor ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => load(filter, true, cursor)} loading={loading}>
            {t('load-more', { defaultValue: 'Load more' })}
          </Button>
        </div>
      ) : loading ? (
        <div className="mt-4 flex justify-center">
          <Spinner />
        </div>
      ) : null}
    </div>
  );
}

function HistoryRow({ item, onRemove }: { item: HistoryView; onRemove: () => void }) {
  const { t } = useTranslation('c-history');
  const ratio = progressRatio(item.position, item.duration);
  const resumable = shouldResume(item.position, item.duration);

  const inner = (
    <>
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt=""
          className="h-12 w-16 shrink-0 rounded-site-sm object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-site-sm bg-site-surface text-xs uppercase text-site-text-dim">
          {item.entityType.slice(0, 4)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {resumable ? <Play className="h-3 w-3 shrink-0 text-site-accent" aria-hidden /> : null}
          <span className="truncate text-sm font-medium text-site-text">{item.title}</span>
        </span>
        {item.subtitle ? (
          <span className="block truncate text-xs text-site-text-muted">{item.subtitle}</span>
        ) : null}
        {ratio != null ? (
          <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-site-surface-active">
            <span
              className="block h-full rounded-full bg-site-accent"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-xs text-site-text-dim">{timeAgoShort(item.updatedAt)}</span>
    </>
  );

  return (
    <Card interactive className="flex-row items-center gap-3 px-4 py-3">
      {item.href ? (
        <a href={item.href} className="flex min-w-0 flex-1 items-center gap-3">
          {inner}
        </a>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{inner}</span>
      )}
      <IconButton
        icon={Trash2}
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        label={t('remove', { defaultValue: 'Remove' })}
      />
    </Card>
  );
}
