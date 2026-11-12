import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Bookmark, FolderPlus, Trash2, FileX } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import type { HydratedSave, SaveFolderView } from '@/lib/saves/types';
import { RemindersList } from '@/components/reminders/RemindersList';
import { SaveNoteEditor } from '@/components/posts-plus/SaveNoteEditor';
import { SaveNoteSearch } from '@/components/posts-plus/SaveNoteSearch';
import { api } from '@/lib/contract/client';
import { createSaveFolderApi, listSavesApi, unsaveItemApi } from '@/lib/saves/saves.contract';

interface HubData {
  items: HydratedSave[];
  nextCursor: string | null;
  folders: SaveFolderView[];
}

type FolderFilter = 'all' | 'default' | string;

/** Not a folder: the pending-reminders view (U7). Folder ids are cuids, so this can't collide. */
const REMINDERS = '__reminders';

export function SavesHub({ initial }: { initial: HubData }) {
  const { t } = useTranslation('c-saves');
  const [folders, setFolders] = useState<SaveFolderView[]>(initial.folders);
  const [filter, setFilter] = useState<FolderFilter>('all');
  const [items, setItems] = useState<HydratedSave[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [q, setQ] = useState(''); // X9: search the owner's private notes

  const load = useCallback(
    async (f: FolderFilter, append = false, cur?: string | null) => {
      setLoading(true);
      try {
        const data = await api(listSavesApi, {
          query: {
            ...(f !== 'all' ? { folder: f } : {}),
            ...(append && cur ? { cursor: cur } : {}),
            ...(q.trim() ? { q: q.trim() } : {}),
          },
          retries: 0,
        });
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
        setFolders(data.folders);
      } catch {
        toast.error(t('load-error', { defaultValue: "Couldn't load your saves" }));
      } finally {
        setLoading(false);
      }
    },
    [t, q],
  );

  // Refetch when the active folder changes (skip the first render — SSR data).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!mounted) {
      setMounted(true);
      return;
    }
    if (filter === REMINDERS) return;
    // Typing in the notes search waits for a pause; a folder change loads at once.
    const id = window.setTimeout(() => void load(filter), q ? 300 : 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, q]);

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    try {
      const { folder } = await api(createSaveFolderApi, { body: { name } });
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
      await api(unsaveItemApi, {
        body: { entityType: save.entityType, entityId: save.entityId },
      });
    } catch {
      /* best-effort; the row reappears on next load if this failed */
    }
  }

  const filterTabs: TabItem[] = [
    { id: 'all', label: t('all', { defaultValue: 'All' }) },
    { id: 'default', label: t('unfiled', { defaultValue: 'Saved' }) },
    ...folders.map((f) => ({ id: f.id, label: f.name, count: f.count })),
    { id: REMINDERS, label: t('reminders', { defaultValue: 'Reminders' }) },
  ];

  return (
    <div className="px-4 pt-4 pb-12">
      {/* Folder filter — mutually exclusive, so it is a tab strip (Tabs
          scrolls with an edge fade when the folders outgrow the row). */}
      <div className="mb-4 flex items-center gap-2">
        <Tabs
          tabs={filterTabs}
          value={filter}
          onChange={setFilter}
          className="min-w-0 flex-1"
          aria-label={t('folders-label', { defaultValue: 'Saved item folders' })}
        />
        {creating ? (
          <span className="flex shrink-0 items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 40))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createFolder();
                if (e.key === 'Escape') setCreating(false);
              }}
              placeholder={t('folder-name', { defaultValue: 'Folder name' })}
              aria-label={t('folder-name', { defaultValue: 'Folder name' })}
              className="w-40"
              autoFocus
            />
            <Button size="sm" variant="default" onClick={createFolder}>
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

      {filter !== REMINDERS && <SaveNoteSearch value={q} onChange={setQ} />}

      {filter === REMINDERS ? (
        <RemindersList />
      ) : items.length === 0 && !loading ? (
        <EmptyState
          icon={Bookmark}
          title={t('empty-title', { defaultValue: 'Nothing saved here yet' })}
          description={t('empty-desc', {
            defaultValue: 'Save posts and builds to find them again later.',
          })}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((save) => (
            <li key={save.id}>
              <SavedRow save={save} onRemove={() => removeItem(save)} />
            </li>
          ))}
        </ul>
      )}

      {filter === REMINDERS ? null : cursor ? (
        <div className="mt-4 flex justify-center">
          <Button variant="default" onClick={() => load(filter, true, cursor)} loading={loading}>
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
      <Card className="flex-row items-center gap-3 px-4 py-3 sm:gap-3 sm:py-3">
        <FileX className="h-5 w-5 shrink-0 text-site-text-muted" aria-hidden />
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
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-site-sm bg-site-surface text-xs text-site-text-muted">
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
    <>
      <Card interactive className="flex-row items-center gap-3 px-4 py-3 sm:gap-3 sm:py-3">
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
      <div className="px-4 pt-1 pb-1">
        <SaveNoteEditor entityType={save.entityType} entityId={save.entityId} initial={save.note} />
      </div>
    </>
  );
}
