'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bookmark, FolderPlus, Trash2, FileX } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import type { HydratedSave, SaveFolderView } from '@/lib/saves/types';

interface HubData {
  items: HydratedSave[];
  nextCursor: string | null;
  folders: SaveFolderView[];
}

type FolderFilter = 'all' | 'default' | string;

export function SavesHub({ initial }: { initial: HubData }) {
  const { t } = useTranslation('c-saves');
  const [folders, setFolders] = useState<SaveFolderView[]>(initial.folders);
  const [filter, setFilter] = useState<FolderFilter>('all');
  const [items, setItems] = useState<HydratedSave[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(
    async (f: FolderFilter, append = false, cur?: string | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (f !== 'all') params.set('folder', f);
        if (append && cur) params.set('cursor', cur);
        const res = await fetch(`/api/saves?${params.toString()}`);
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as HubData;
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
        setFolders(data.folders);
      } catch {
        toast.error(t('load-error', { defaultValue: "Couldn't load your saves" }));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // Refetch when the active folder changes (skip the first render — SSR data).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!mounted) {
      setMounted(true);
      return;
    }
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/saves/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('create failed');
      const { folder } = (await res.json()) as { folder: SaveFolderView };
      setFolders((prev) => [...prev, folder]);
      setNewName('');
      setCreating(false);
      toast.success(t('folder-created', { defaultValue: 'Folder created' }));
    } catch {
      toast.error(t('folder-error', { defaultValue: "Couldn't create the folder" }));
    }
  }

  async function removeItem(save: HydratedSave) {
    setItems((prev) => prev.filter((i) => i.id !== save.id));
    try {
      await fetch('/api/saves', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: save.entityType, entityId: save.entityId }),
      });
    } catch {
      /* best-effort; the row reappears on next load if this failed */
    }
  }

  const chip = (value: FolderFilter, label: string, count?: number) => (
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
      {typeof count === 'number' ? <span className="ms-1 opacity-70">{count}</span> : null}
    </button>
  );

  return (
    <div className="px-4 pt-4 pb-12">
      {/* Folder filter row — scrolls horizontally on mobile. */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {chip('all', t('all', { defaultValue: 'All' }))}
        {chip('default', t('unfiled', { defaultValue: 'Saved' }))}
        {folders.map((f) => chip(f.id, f.name, f.count))}
        {creating ? (
          <span className="flex shrink-0 items-center gap-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 40))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createFolder();
                if (e.key === 'Escape') setCreating(false);
              }}
              placeholder={t('folder-name', { defaultValue: 'Folder name' })}
              aria-label={t('folder-name', { defaultValue: 'Folder name' })}
              className="h-8 w-36"
              autoFocus
            />
            <Button size="sm" variant="accent" onClick={createFolder}>
              {t('add', { defaultValue: 'Add' })}
            </Button>
          </span>
        ) : (
          <IconButton
            icon={FolderPlus}
            variant="ghost"
            size="icon-sm"
            onClick={() => setCreating(true)}
            label={t('new-folder', { defaultValue: 'New folder' })}
          />
        )}
      </div>

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={Bookmark}
          title={t('empty-title', { defaultValue: 'Nothing saved here yet' })}
          description={t('empty-desc', {
            defaultValue: 'Save posts and builds to find them again later.',
          })}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((save) => (
            <li key={save.id}>
              <SavedRow save={save} onRemove={() => removeItem(save)} />
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

function SavedRow({ save, onRemove }: { save: HydratedSave; onRemove: () => void }) {
  const { t } = useTranslation('c-saves');

  if (save.tombstone) {
    return (
      <Card className="flex-row items-center gap-3 px-4 py-3">
        <FileX className="h-5 w-5 shrink-0 text-site-text-dim" aria-hidden />
        <span className="flex-1 text-sm text-site-text-muted">
          {t('unavailable', { defaultValue: 'This item is no longer available' })}
        </span>
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

  const body = (
    <>
      {save.thumbnail ? (
        <img
          src={save.thumbnail}
          alt=""
          className="h-12 w-12 shrink-0 rounded-site-sm object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-site-sm bg-site-surface text-xs uppercase text-site-text-dim">
          {save.entityType.slice(0, 4)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-site-text">{save.title}</span>
        {save.subtitle ? (
          <span className="block truncate text-xs text-site-text-muted">{save.subtitle}</span>
        ) : null}
      </span>
    </>
  );

  return (
    <Card interactive className="flex-row items-center gap-3 px-4 py-3">
      {save.href ? (
        <a href={save.href} className="flex min-w-0 flex-1 items-center gap-3">
          {body}
        </a>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
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
