'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/rmhtube/toast-store';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { api, roomPosition, usePartyStore, type LoadedTrack } from '@/lib/rmhtube/party-store';
import { mediaKey, type CommentaryLine } from '@/lib/rmhtube/party';
import { formatDuration } from '@/lib/rmhtube/utils';
import { btn, btnPrimary, input, muted } from './ui';

interface TrackRow {
  id: string;
  title: string;
  author: string;
}

/** Commentary tracks (T5): load one to play alongside, or record your own. */
export default function TrackTab() {
  const { t } = useTranslation('f-watch');
  const item = useRmhTubeStore((s) => s.room?.currentItem ?? null);
  const loaded = usePartyStore((s) => s.track);
  const [tracks, setTracks] = useState<TrackRow[] | null>(null);
  const [recording, setRecording] = useState(false);
  const [lines, setLines] = useState<CommentaryLine[]>([]);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const key = item && !item.live ? mediaKey(item.url) : null;

  useEffect(() => {
    if (!key) return;
    setTracks(null);
    api<{ tracks: TrackRow[] }>(`/api/rmhtube/commentary?url=${encodeURIComponent(key)}`)
      .then((r) => setTracks(r.tracks))
      .catch(() => setTracks([]));
  }, [key]);

  if (!key)
    return (
      <p className={muted}>
        {t('track-none', { defaultValue: 'Commentary needs a video with a timeline.' })}
      </p>
    );

  const load = async (id: string) => {
    try {
      const r = await api<{ track: Omit<LoadedTrack, 'url'> }>(
        `/api/rmhtube/commentary?id=${encodeURIComponent(id)}`,
      );
      usePartyStore.getState().setTrack({ ...r.track, url: key });
    } catch {
      toast.error(t('track-load-failed', { defaultValue: 'Could not load that track' }));
    }
  };

  const save = async () => {
    try {
      const r = await api<{ track: { id: string; title: string } }>('/api/rmhtube/commentary', {
        method: 'POST',
        body: JSON.stringify({ url: key, title: title.trim(), lines }),
      });
      setTracks((cur) => [
        { ...r.track, author: t('track-you', { defaultValue: 'You' }) },
        ...(cur ?? []),
      ]);
      setRecording(false);
      setLines([]);
      setTitle('');
      toast.success(t('track-saved', { defaultValue: 'Commentary saved' }));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('save-failed', { defaultValue: 'Could not save' }),
      );
    }
  };

  return (
    <div className="space-y-4">
      <section className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-(--app-text-dim)">
          {t('track-play', { defaultValue: 'Play alongside' })}
        </h4>
        {tracks === null ? (
          <p className={muted}>{t('loading', { defaultValue: 'Loading…' })}</p>
        ) : tracks.length === 0 ? (
          <p className={muted}>
            {t('track-empty', { defaultValue: 'No commentary for this video yet.' })}
          </p>
        ) : (
          <ul className="space-y-1">
            {tracks.map((tr) => (
              <li key={tr.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {tr.title} <span className={muted}>· {tr.author}</span>
                </span>
                {loaded?.id === tr.id ? (
                  <button
                    type="button"
                    className={btn}
                    onClick={() => usePartyStore.getState().setTrack(null)}
                  >
                    {t('track-stop', { defaultValue: 'Stop' })}
                  </button>
                ) : (
                  <button type="button" className={btn} onClick={() => void load(tr.id)}>
                    {t('track-load', { defaultValue: 'Load' })}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-(--app-text-dim)">
          {t('track-record', { defaultValue: 'Record yours' })}
        </h4>
        {!recording ? (
          <button type="button" className={btn} onClick={() => setRecording(true)}>
            {t('track-start', { defaultValue: 'Start a track' })}
          </button>
        ) : (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const line = text.trim();
                if (!line) return;
                setLines((l) => [...l, { t: Math.round(roomPosition() * 10) / 10, text: line }]);
                setText('');
              }}
            >
              <input
                className={input}
                value={text}
                maxLength={200}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('track-line', { defaultValue: 'Say something at this moment' })}
                aria-label={t('track-line', { defaultValue: 'Say something at this moment' })}
              />
              <button type="submit" className={btn}>
                {t('track-add', { defaultValue: 'Add' })}
              </button>
            </form>
            <ul className="max-h-32 space-y-0.5 overflow-y-auto">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-12 shrink-0 tabular-nums text-(--app-text-muted)">
                    {formatDuration(l.t)}
                  </span>
                  <span className="truncate">{l.text}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                className={input}
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('track-title', { defaultValue: 'Track title' })}
                aria-label={t('track-title', { defaultValue: 'Track title' })}
              />
              <button
                type="button"
                className={btnPrimary}
                disabled={!title.trim() || lines.length === 0}
                onClick={() => void save()}
              >
                {t('track-save', { defaultValue: 'Save' })}
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => {
                  setRecording(false);
                  setLines([]);
                }}
              >
                {t('track-discard', { defaultValue: 'Discard' })}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
