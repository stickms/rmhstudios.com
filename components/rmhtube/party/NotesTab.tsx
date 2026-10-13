'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { toast } from '@/lib/rmhtube/toast-store';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { api, roomPosition, usePartyStore, type TimedComment } from '@/lib/rmhtube/party-store';
import { mediaKey } from '@/lib/rmhtube/party';
import { formatDuration } from '@/lib/rmhtube/utils';
import { btnPrimary, input, muted } from './ui';

/** Timed comments (F1): write one at the current second; toggle them on or off. */
export default function NotesTab() {
  const { t } = useTranslation('f-watch');
  const item = useRmhTubeStore((s) => s.room?.currentItem ?? null);
  const showTimed = usePartyStore((s) => s.showTimed);
  const setShow = usePartyStore((s) => s.setShowTimed);
  const commentsUrl = usePartyStore((s) => s.commentsUrl);
  const comments = usePartyStore((s) => s.comments);
  const [body, setBody] = useState('');
  const key = item && !item.live ? mediaKey(item.url) : null;
  const mine = commentsUrl === key ? comments.filter((c) => c.mine) : [];

  // The overlay loads comments when shown; load here too if it is hidden.
  useEffect(() => {
    if (!key || usePartyStore.getState().commentsUrl === key) return;
    api<{ comments: TimedComment[] }>(`/api/rmhtube/timed-comments?url=${encodeURIComponent(key)}`)
      .then((r) => usePartyStore.getState().setComments(key, r.comments))
      .catch(() => {});
  }, [key]);

  if (!key)
    return (
      <p className={muted}>
        {t('notes-none', { defaultValue: 'Timed comments need a video with a timeline.' })}
      </p>
    );

  const post = async () => {
    const text = body.trim();
    if (!text) return;
    try {
      const r = await api<{ comment: TimedComment }>('/api/rmhtube/timed-comments', {
        method: 'POST',
        body: JSON.stringify({ url: key, atSec: Math.floor(roomPosition()), body: text }),
      });
      const s = usePartyStore.getState();
      s.setComments(
        key,
        [...s.comments, r.comment].sort((a, b) => a.atSec - b.atSec),
      );
      setBody('');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('save-failed', { defaultValue: 'Could not save' }),
      );
    }
  };

  const remove = async (id: string) => {
    const s = usePartyStore.getState();
    s.setComments(
      key,
      s.comments.filter((c) => c.id !== id),
    );
    await api(`/api/rmhtube/timed-comments?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => {});
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={showTimed} onChange={(e) => setShow(e.target.checked)} />
        {t('notes-show', { defaultValue: 'Show timed comments over the video' })}
      </label>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void post();
        }}
      >
        <input
          className={input}
          value={body}
          maxLength={200}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('notes-placeholder', { defaultValue: 'Comment at this moment' })}
          aria-label={t('notes-placeholder', { defaultValue: 'Comment at this moment' })}
        />
        <button type="submit" className={btnPrimary}>
          {t('notes-post', { defaultValue: 'Post' })}
        </button>
      </form>
      <p className={muted}>
        {t('notes-hint', {
          defaultValue:
            'Pinned to the playhead; later viewers of this video see it at that moment.',
        })}
      </p>
      <ul className="space-y-1">
        {mine.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="w-12 shrink-0 tabular-nums text-(--app-text-muted)">
              {formatDuration(c.atSec)}
            </span>
            <span className="min-w-0 flex-1 truncate">{c.body}</span>
            <button
              type="button"
              className="rounded p-1 text-(--app-text-muted) hover:text-(--app-danger)"
              onClick={() => void remove(c.id)}
              title={t('remove', { defaultValue: 'Remove' })}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
