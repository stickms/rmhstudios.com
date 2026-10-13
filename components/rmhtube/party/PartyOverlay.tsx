'use client';

/** Timed comments (F1) and the loaded commentary track (T5), drawn over the video. */
import { useEffect, useState } from 'react';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { mediaKey } from '@/lib/rmhtube/party';
import { api, roomPosition, usePartyStore, type TimedComment } from '@/lib/rmhtube/party-store';

const SHOW_FOR_SEC = 6;
const COMMENTARY_FOR_SEC = 8;

export default function PartyOverlay() {
  const url = useRmhTubeStore((s) =>
    s.room?.currentItem?.live ? null : (s.room?.currentItem?.url ?? null),
  );
  const showTimed = usePartyStore((s) => s.showTimed);
  const commentsUrl = usePartyStore((s) => s.commentsUrl);
  const comments = usePartyStore((s) => s.comments);
  const track = usePartyStore((s) => s.track);
  const [active, setActive] = useState<TimedComment[]>([]);
  const [line, setLine] = useState<string | null>(null);

  const key = url ? mediaKey(url) : null;

  // Load this video's comments once per URL.
  useEffect(() => {
    if (!key || !showTimed || usePartyStore.getState().commentsUrl === key) return;
    let cancelled = false;
    api<{ comments: TimedComment[] }>(`/api/rmhtube/timed-comments?url=${encodeURIComponent(key)}`)
      .then((r) => !cancelled && usePartyStore.getState().setComments(key, r.comments))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, showTimed]);

  // A track belongs to one video.
  useEffect(() => {
    const t = usePartyStore.getState().track;
    if (t && t.url !== key) usePartyStore.getState().setTrack(null);
  }, [key]);

  useEffect(() => {
    const id = setInterval(() => {
      const pos = roomPosition();
      const list = showTimed && commentsUrl === key ? comments : [];
      const next = list.filter((c) => c.atSec <= pos && pos < c.atSec + SHOW_FOR_SEC).slice(-4);
      setActive((prev) =>
        prev.length === next.length && prev.every((p, i) => p.id === next[i]!.id) ? prev : next,
      );
      let text: string | null = null;
      if (track && track.url === key) {
        for (const l of track.lines)
          if (l.t <= pos && pos < l.t + COMMENTARY_FOR_SEC) text = l.text;
      }
      setLine(text);
    }, 500);
    return () => clearInterval(id);
  }, [key, showTimed, commentsUrl, comments, track]);

  if (active.length === 0 && !line) return null;
  return (
    <div className="pointer-events-none absolute inset-x-4 top-4 bottom-2 z-10 flex flex-col justify-between overflow-hidden">
      <ul className="flex flex-col items-end gap-1" aria-live="off">
        {active.map((c) => (
          <li
            key={c.id}
            className="max-w-[70%] truncate rounded-(--app-radius-sm) bg-(--app-scrim) px-2 py-0.5 text-xs text-(--app-text)"
          >
            <span className="text-(--app-text-muted)">{c.author}: </span>
            {c.body}
          </li>
        ))}
      </ul>
      {line && (
        <p className="mx-auto max-w-[80%] rounded-(--app-radius-sm) bg-(--app-scrim) px-3 py-1 text-center text-sm text-(--app-text)">
          {line}
        </p>
      )}
    </div>
  );
}
