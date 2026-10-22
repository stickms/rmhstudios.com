'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/rmhtube/toast-store';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { api } from '@/lib/rmhtube/party-store';
import { btn, btnPrimary, input, muted } from './ui';

interface Item {
  id: string;
  url: string;
  title: string;
}

/** The hub allows 20 queue adds a minute; stay under it. */
const ADD_ALL_CAP = 15;

export default function LaterTab() {
  const { t } = useTranslation('f-watch');
  const [items, setItems] = useState<Item[] | null>(null);
  const [url, setUrl] = useState('');
  const current = useRmhTubeStore((s) => s.room?.currentItem ?? null);
  const isHost = useRmhTubeStore((s) => s.room?.hostUserId === s.room?.myUserId);

  useEffect(() => {
    api<{ items: Item[] }>('/api/rmhtube/watch-later')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);

  const save = async (u: string, title?: string) => {
    try {
      const r = await api<{ item: Item }>('/api/rmhtube/watch-later', {
        method: 'POST',
        body: JSON.stringify({ url: u, title }),
      });
      setItems((cur) => (cur?.some((i) => i.id === r.item.id) ? cur : [...(cur ?? []), r.item]));
      setUrl('');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('save-failed', { defaultValue: 'Could not save' }),
      );
    }
  };

  const remove = async (id: string) => {
    setItems((cur) => cur?.filter((i) => i.id !== id) ?? null);
    await api(`/api/rmhtube/watch-later?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
      () => {},
    );
  };

  const queue = (i: Item) => emit(C2S.QUEUE_ADD, { url: i.url, title: i.title });
  const addAll = () => {
    (items ?? []).slice(0, ADD_ALL_CAP).forEach((i, n) => setTimeout(() => queue(i), n * 250));
    toast.success(t('added-all', { defaultValue: 'Adding to the room queue…' }));
  };

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) void save(url.trim());
        }}
      >
        <input
          className={input}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('later-url', { defaultValue: 'Paste a video URL' })}
          aria-label={t('later-url', { defaultValue: 'Paste a video URL' })}
        />
        <button
          type="submit"
          className={btn}
          title={t('later-add', { defaultValue: 'Save for later' })}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </form>
      {current && (
        <button type="button" className={btn} onClick={() => void save(current.url, current.title)}>
          {t('later-save-current', { defaultValue: 'Save what is playing' })}
        </button>
      )}
      {items === null ? (
        <p className={muted}>{t('loading', { defaultValue: 'Loading…' })}</p>
      ) : items.length === 0 ? (
        <p className={muted}>{t('later-empty', { defaultValue: 'Nothing saved yet.' })}</p>
      ) : (
        <>
          {isHost && (
            <button type="button" className={btnPrimary} onClick={addAll}>
              {t('later-add-all', { defaultValue: 'Add all to this room’s queue' })}
            </button>
          )}
          <ul className="space-y-1">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate" title={i.url}>
                  {i.title}
                </span>
                <button type="button" className={btn} onClick={() => queue(i)}>
                  {t('later-queue', { defaultValue: 'Queue' })}
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-(--app-text-muted) hover:text-(--app-danger)"
                  onClick={() => void remove(i.id)}
                  title={t('remove', { defaultValue: 'Remove' })}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
