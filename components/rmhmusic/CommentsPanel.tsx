'use client';

/**
 * RMH Music — timestamped comments on the current track.
 *
 * Comments are pinned to a position (ms) in a track keyed by its Spotify URI.
 * Bodies render as plain React text only. A timestamp chip seeks the player.
 */

import { useCallback, useEffect, useState } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { MessageSquareText, Loader2, Send, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { usePreviewPlayer } from '@/lib/rmhmusic/spotify-player';
import { emit } from '@/lib/rmhmusic/socket';
import { C2S } from '@/lib/rmhmusic/events';
import {
  COMMENT_MAX_LENGTH,
  currentPositionMs,
  formatCommentTime,
  sortByPosition,
  type TrackCommentView,
} from '@/lib/rmhmusic/track-comments';

const BORDER = 'color-mix(in srgb, var(--app-text) 10%, transparent)';

export default function CommentsPanel() {
  const { t } = useTranslation('c-rmhmusic');
  const isOpen = useRmhMusicStore((s) => s.isCommentsOpen);
  const room = useRmhMusicStore((s) => s.room);
  const trackUri = useRmhMusicStore((s) => s.currentTrack?.spotifyUri ?? null);
  const { seek } = usePreviewPlayer();

  const [comments, setComments] = useState<TrackCommentView[]>([]);
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !trackUri) {
      setComments([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/rmhmusic/track-comments?trackUri=${encodeURIComponent(trackUri)}`, {
      credentials: 'include',
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('load');
        const data = await res.json();
        setComments(sortByPosition<TrackCommentView>(data.comments ?? []));
        setSignedIn(!!data.signedIn);
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') setError(t('comments-load-failed', { defaultValue: "Couldn't load comments." }));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [isOpen, trackUri, t]);

  const post = useCallback(async () => {
    const body = text.trim();
    if (!body || !trackUri || posting) return;
    const st = useRmhMusicStore.getState();
    const positionMs = Math.round(currentPositionMs(st.playback, st.currentTrack?.durationMs));
    setPosting(true);
    setError(null);
    try {
      const res = await fetch('/api/rmhmusic/track-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trackUri, positionMs, body }),
      });
      if (res.status === 429) {
        setError(t('comments-limit', { defaultValue: 'Comment limit reached for this track.' }));
        return;
      }
      if (!res.ok) throw new Error('post');
      const data = await res.json();
      setComments((prev) => sortByPosition([...prev, data.comment as TrackCommentView]));
      setText('');
    } catch {
      setError(t('comments-post-failed', { defaultValue: "Couldn't post your comment." }));
    } finally {
      setPosting(false);
    }
  }, [text, trackUri, posting, t]);

  const remove = useCallback(
    async (id: string) => {
      const before = comments;
      setComments((prev) => prev.filter((c) => c.id !== id));
      try {
        const res = await fetch(`/api/rmhmusic/track-comments?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) throw new Error('delete');
      } catch {
        setComments(before);
        setError(t('comments-delete-failed', { defaultValue: "Couldn't delete that comment." }));
      }
    },
    [comments, t],
  );

  const jumpTo = useCallback(
    (positionMs: number) => {
      seek(positionMs);
      useRmhMusicStore.getState().setPlayback({ positionMs, updatedAt: Date.now() });
      if (room && room.hostUserId === room.myUserId) emit(C2S.MUSIC_SEEK, { positionMs });
    },
    [seek, room],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed right-0 top-0 bottom-[calc(174px+var(--safe-bottom))] min-[360px]:bottom-[calc(134px+var(--safe-bottom))] sm:bottom-[calc(86px+var(--safe-bottom))] z-40 flex w-80 max-w-full flex-col overflow-hidden pt-[var(--safe-top)] backdrop-blur-xl border-l"
          style={{ background: 'color-mix(in srgb, var(--app-bg) 90%, transparent)', borderColor: BORDER }}
        >
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: BORDER }}>
            <MessageSquareText className="w-4 h-4" aria-hidden style={{ color: 'var(--app-accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('track-comments', { defaultValue: 'Comments' })}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1" aria-live="polite">
            {!trackUri ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--app-text-muted)' }}>
                {t('comments-no-track', { defaultValue: 'Play a track to see its comments.' })}
              </p>
            ) : loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden style={{ color: 'var(--app-accent)' }} />
                <span className="sr-only">{t('comments-loading', { defaultValue: 'Loading comments' })}</span>
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--app-text-muted)' }}>
                {t('comments-empty', { defaultValue: 'No comments yet. Pin the first one to this moment.' })}
              </p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => jumpTo(c.positionMs)}
                    className="min-h-11 min-w-12 shrink-0 rounded-(--app-radius-sm) px-2 text-xs font-medium tabular-nums"
                    style={{ background: 'color-mix(in srgb, var(--app-accent) 15%, transparent)', color: 'var(--app-accent)' }}
                    aria-label={t('comments-seek', { defaultValue: 'Jump to {{time}}', time: formatCommentTime(c.positionMs) })}
                  >
                    {formatCommentTime(c.positionMs)}
                  </button>
                  <div className="min-w-0 flex-1 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: c.mine ? 'var(--app-accent)' : 'var(--app-text)' }}>
                      {c.author}
                    </span>
                    <p className="text-sm break-words" style={{ color: 'var(--app-text)' }}>{c.body}</p>
                  </div>
                  {c.mine && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-(--app-radius-sm)"
                      style={{ color: 'var(--app-text-muted)' }}
                      aria-label={t('comments-delete', { defaultValue: 'Delete comment' })}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t" style={{ borderColor: BORDER }}>
            {error && (
              <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>{error}</p>
            )}
            {!signedIn ? (
              <p className="text-sm text-center" style={{ color: 'var(--app-text-muted)' }}>
                <a href="/login" className="underline" style={{ color: 'var(--app-accent)' }}>
                  {t('comments-sign-in', { defaultValue: 'Sign in to comment' })}
                </a>
              </p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && post()}
                  placeholder={t('comments-placeholder', { defaultValue: 'Comment at this moment...' })}
                  aria-label={t('comments-placeholder', { defaultValue: 'Comment at this moment...' })}
                  disabled={!trackUri}
                  maxLength={COMMENT_MAX_LENGTH}
                  className="min-h-11 flex-1 min-w-0 px-3 rounded-(--app-radius-sm) text-sm outline-none"
                  style={{ background: 'var(--app-surface)', color: 'var(--app-text)' }}
                />
                <button
                  type="button"
                  onClick={post}
                  disabled={!text.trim() || !trackUri || posting}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-(--app-radius-sm) transition-opacity disabled:opacity-30"
                  style={{ color: 'var(--app-accent)' }}
                  aria-label={t('comments-post', { defaultValue: 'Post comment' })}
                >
                  <Send className="w-4 h-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
