/**
 * PlaylistPicker — the "From a playlist" tab of the Add media dialog: the
 * member's own and shared video playlists as a labelled listbox. Choosing one
 * hands its id to the caller, which sends one `QUEUE_ADD_PLAYLIST` to the hub;
 * the hub re-checks access itself, so this list is a convenience, not the gate.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiQuery } from '@/lib/contract/client';
import { listPlaylistsApi } from '@/lib/playlists/playlists.contract';
import { noticeKind } from '@/lib/rmhtube/playlist-queue';
import { useRmhTubeStore } from '@/lib/rmhtube/store';

interface PickerPlaylist {
  id: string;
  name: string;
  itemCount: number;
}

interface PlaylistPickerProps {
  onPick: (playlistId: string) => void;
}

export default function PlaylistPicker({ onPick }: PlaylistPickerProps) {
  const { t } = useTranslation('rmhtube-playlists');
  const list = useQuery({ ...apiQuery(listPlaylistsApi), retry: false });
  const playlists: PickerPlaylist[] | null = list.data ? (list.data.playlists ?? []) : null;
  const failed = list.isError;

  if (failed) {
    return (
      <div className="space-y-2 py-4" role="alert">
        <p className="text-sm text-app-danger">
          {t('picker-error', { defaultValue: "Couldn't load your playlists." })}
        </p>
        <button
          type="button"
          onClick={() => void list.refetch()}
          className="text-xs underline text-app-text-muted hover:text-app-text"
        >
          {t('picker-retry', { defaultValue: 'Try again' })}
        </button>
      </div>
    );
  }

  if (!playlists) {
    return (
      <div className="space-y-2" aria-busy="true">
        <p className="sr-only" role="status">
          {t('picker-loading', { defaultValue: 'Loading your playlists' })}
        </p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 rounded-app-sm bg-app-bg border border-app-border" />
        ))}
      </div>
    );
  }

  if (playlists.length === 0) {
    return (
      <p className="py-6 text-sm text-center text-app-text-dim">
        {t('picker-empty', {
          defaultValue: 'You have no playlists yet. Save the queue as a playlist to start one.',
        })}
      </p>
    );
  }

  return (
    <ul
      role="listbox"
      aria-label={t('picker-label', { defaultValue: 'Your playlists' })}
      className="max-h-64 space-y-1 overflow-y-auto"
    >
      {playlists.map((p) => {
        const empty = p.itemCount === 0;
        return (
          <li key={p.id} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={false}
              disabled={empty}
              onClick={() => onPick(p.id)}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-app-sm border border-app-border bg-app-bg px-3 py-2 text-left transition-colors hover:bg-app-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="min-w-0 truncate text-sm text-app-text">{p.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-app-text-dim">
                {t('picker-item-count', {
                  defaultValue_one: '{{count}} video',
                  defaultValue: '{{count}} videos',
                  count: p.itemCount,
                })}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What the last playlist add did for this member, in a polite live region above
 * the queue. It clears itself, and when the queue panel goes away.
 */
export function PlaylistResultNotice() {
  const { t } = useTranslation('rmhtube-playlists');
  const result = useRmhTubeStore((s) => s.playlistResult);
  const clear = useRmhTubeStore((s) => s.setPlaylistResult);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => clear(null), 8000);
    return () => clearTimeout(timer);
  }, [result, clear]);
  useEffect(() => () => clear(null), [clear]);

  let text = '';
  if (result) {
    const kind = noticeKind(result);
    if (kind === 'all') {
      text = t('result-added', {
        defaultValue_one: 'Added {{count}} video.',
        defaultValue: 'Added {{count}} videos.',
        count: result.added,
      });
    } else if (kind === 'partial-full') {
      text = t('result-partial-full', {
        defaultValue: 'Added {{added}} of {{total}}: the queue is full.',
        added: result.added,
        total: result.total,
      });
    } else if (kind === 'none-full') {
      text = t('result-none-full', { defaultValue: 'Nothing added: the queue is full.' });
    } else {
      text = t('result-none-playable', { defaultValue: 'Nothing could be added from that playlist.' });
    }
    if (result.skipped > 0) {
      text += ` ${t('result-skipped', {
        defaultValue_one: '{{count}} could not be played here.',
        defaultValue: '{{count}} could not be played here.',
        count: result.skipped,
      })}`;
    }
  }

  return (
    <div role="status" aria-live="polite">
      {text && (
        <p className="border-b border-app-border px-3 py-2 text-xs text-app-text-muted">{text}</p>
      )}
    </div>
  );
}
