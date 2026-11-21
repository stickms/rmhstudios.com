/**
 * SaveQueueDialog — "Save as playlist" on the room queue. Asks for a name,
 * creates a playlist and fills it with the queue in one bulk add. The playlist
 * module's own caps apply (playlists per member, items per playlist); the
 * server answers with what it added, which is what the dialog reports.
 */

import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { toast } from '@/lib/shared/app-toast';
import {
  addPlaylistItemsBulkApi,
  createPlaylistApi,
  deletePlaylistApi,
} from '@/lib/playlists/playlists.contract';
import { queueToPlaylistRows, type QueueItemLike } from '@/lib/rmhtube/playlist-queue';

interface SaveQueueDialogProps {
  queue: readonly QueueItemLike[];
  onClose: () => void;
}

interface Saved {
  name: string;
  added: number;
}

export default function SaveQueueDialog({ queue, onClose }: SaveQueueDialogProps) {
  const { t } = useTranslation('rmhtube-playlists');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Saved | null>(null);
  // A stable callback ref runs once, when the field mounts: the dialog opens with the cursor in the name field.
  const focusOnMount = useCallback((el: HTMLInputElement | null) => el?.focus(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('save-name-required', { defaultValue: 'Give the playlist a name.' }));
      return;
    }
    const rows = queueToPlaylistRows(queue);
    if (rows.length === 0) return;
    setBusy(true);
    setError('');
    let createdId: string | null = null;
    try {
      const created = await api(createPlaylistApi, { body: { name: trimmed, kind: 'video' } });
      createdId = created.id;
      const res = await api(addPlaylistItemsBulkApi, {
        params: { id: created.id },
        body: { items: rows },
      });
      setSaved({ name: trimmed, added: res.added });
      toast.success(
        t('save-success', {
          defaultValue_one: 'Saved {{count}} video to "{{name}}".',
          defaultValue: 'Saved {{count}} videos to "{{name}}".',
          count: res.added,
          name: trimmed,
        }),
      );
    } catch (err) {
      // A playlist that was made but could not be filled is not left behind empty.
      if (createdId) await api(deletePlaylistApi, { params: { id: createdId } }).catch(() => undefined);
      setError(serverError(err) ?? t('save-failed', { defaultValue: "Couldn't save the playlist. Try again." }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('save-close', { defaultValue: 'Close' })}
        className="absolute inset-0 app-scrim cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-queue-title"
        className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-app app-glass p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="save-queue-title" className="text-lg font-semibold">
            {t('save-title', { defaultValue: 'Save queue as playlist' })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('save-close', { defaultValue: 'Close' })}
            className="rounded-app-sm p-1 transition-colors text-app-text-muted hover:text-app-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {saved ? (
          <div className="space-y-4">
            <p className="text-sm text-app-text">
              {t('save-done', {
                defaultValue_one: '"{{name}}" has {{count}} video.',
                defaultValue: '"{{name}}" has {{count}} videos.',
                count: saved.added,
                name: saved.name,
              })}
            </p>
            <div className="flex items-center justify-between gap-3">
              <a
                href="/library?view=playlists"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline text-app-accent hover:text-app-accent-hover"
              >
                {t('save-open', { defaultValue: 'Open your playlists' })}
              </a>
              <button
                type="button"
                onClick={onClose}
                className="rounded-app-sm bg-app-accent px-4 py-2 text-sm font-semibold text-app-accent-fg transition-colors hover:bg-app-accent-hover"
              >
                {t('save-done-button', { defaultValue: 'Done' })}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-app-text-muted">
              {t('save-count', {
                defaultValue_one: '{{count}} video in the queue will be saved, in order.',
                defaultValue: '{{count}} videos in the queue will be saved, in order.',
                count: queueToPlaylistRows(queue).length,
              })}
            </p>
            <div>
              <label htmlFor="save-queue-name" className="mb-1 block text-sm font-medium text-app-text-muted">
                {t('save-name-label', { defaultValue: 'Playlist name' })}
              </label>
              <input
                ref={focusOnMount}
                id="save-queue-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                maxLength={100}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'save-queue-error' : undefined}
                className="w-full rounded-app-sm border border-app-border bg-app-bg px-4 py-2.5 text-app-text outline-none placeholder:text-app-text-dim focus:ring-1 focus:ring-app-accent"
              />
              {error && (
                <p id="save-queue-error" role="alert" className="mt-1 text-xs text-app-danger">
                  {error}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={busy || queue.length === 0}
              className="w-full rounded-app-sm bg-app-accent py-2.5 font-semibold text-app-accent-fg transition-colors hover:bg-app-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? t('save-saving', { defaultValue: 'Saving…' })
                : t('save-submit', { defaultValue: 'Save playlist' })}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
