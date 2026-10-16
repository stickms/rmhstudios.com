'use client';

import { useEffect, useState } from 'react';
import { Headphones, Radio, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { emit } from '@/lib/rmhmusic/socket';
import { C2S } from '@/lib/rmhmusic/events';

/** T4 — community radio controls: now playing, woot/meh, listeners and the DJ rotation. */
export default function RadioPanel() {
  const { t } = useTranslation('f-creative');
  const radio = useRmhMusicStore((s) => s.radio);
  const me = useRmhMusicStore((s) => s.room?.myUserId);
  const [myVote, setMyVote] = useState<'woot' | 'meh' | null>(null);
  const currentId = radio?.current?.id;
  // A new track starts everyone's vote over.
  useEffect(() => setMyVote(null), [currentId]);
  if (!radio) return null;

  const amDj = radio.djs.some((d) => d.userId === me);
  const myDj = radio.djs.find((d) => d.userId === me);
  const playing = radio.current;
  const isMine = playing?.djUserId === me;
  const vote = (v: 'woot' | 'meh') => {
    setMyVote(v);
    emit(C2S.RADIO_VOTE, { vote: v });
  };
  const btn =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40';

  return (
    <div
      className="fixed left-3 right-3 top-[calc(0.75rem+var(--safe-top))] z-30 mx-auto max-w-md rounded-xl p-3 md:left-auto md:right-4 md:mx-0"
      style={{
        background: 'color-mix(in srgb, var(--app-surface) 90%, transparent)',
        color: 'var(--app-text)',
      }}
    >
      <div
        className="flex items-center justify-between gap-2 text-xs"
        style={{ color: 'var(--app-text-muted)' }}
      >
        <span
          className="flex items-center gap-1.5 font-semibold"
          style={{ color: 'var(--app-text)' }}
        >
          <Radio className="h-3.5 w-3.5" aria-hidden />
          {t('radio-title', { defaultValue: 'Community radio' })}
        </span>
        <span className="flex items-center gap-1">
          <Headphones className="h-3.5 w-3.5" aria-hidden />
          {t('radio-listeners', { defaultValue: '{{n}} listening', n: radio.listeners })}
        </span>
      </div>

      <div className="mt-2 text-sm">
        {playing ? (
          <>
            <p className="truncate font-medium">{playing.track.title}</p>
            <p className="truncate text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {t('radio-dj-line', {
                defaultValue: '{{artist}} · DJ {{dj}}',
                artist: playing.track.artist,
                dj: playing.djName,
              })}
            </p>
          </>
        ) : (
          <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
            {t('radio-silent', {
              defaultValue: 'The decks are empty. Join the rotation and queue a track.',
            })}
          </p>
        )}
      </div>

      {playing && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={isMine}
            aria-pressed={myVote === 'woot'}
            onClick={() => vote('woot')}
            className={btn}
            style={{
              background: myVote === 'woot' ? 'var(--app-accent)' : 'var(--app-bg)',
              color: myVote === 'woot' ? 'var(--app-bg)' : 'var(--app-text)',
            }}
          >
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
            {t('radio-woot', { defaultValue: 'Woot {{n}}', n: radio.woots })}
          </button>
          <button
            type="button"
            disabled={isMine}
            aria-pressed={myVote === 'meh'}
            onClick={() => vote('meh')}
            className={btn}
            style={{
              background: myVote === 'meh' ? 'var(--app-accent)' : 'var(--app-bg)',
              color: myVote === 'meh' ? 'var(--app-bg)' : 'var(--app-text)',
            }}
          >
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
            {t('radio-meh', { defaultValue: 'Meh {{n}}', n: radio.mehs })}
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
          {amDj
            ? myDj?.queued
              ? t('radio-queued', { defaultValue: 'Your track is queued. Search to swap it.' })
              : t('radio-pick', { defaultValue: 'Search and pick a track for your turn.' })
            : t('radio-dj-hint', { defaultValue: 'DJs queue one track per turn.' })}
        </p>
        <button
          type="button"
          onClick={() => emit(amDj ? C2S.RADIO_DJ_LEAVE : C2S.RADIO_DJ_JOIN)}
          className={btn}
          style={{ background: 'var(--app-bg)', color: 'var(--app-text)' }}
        >
          {amDj
            ? t('radio-dj-leave', { defaultValue: 'Leave rotation' })
            : t('radio-dj-join', { defaultValue: 'Join rotation' })}
        </button>
      </div>

      {radio.djs.length > 0 && (
        <ol className="mt-2 space-y-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
          {radio.djs.map((d, i) => (
            <li key={d.userId} className="flex justify-between">
              <span>
                {i + 1}. {d.userName}
              </span>
              <span>
                {d.queued
                  ? t('radio-ready', { defaultValue: 'ready' })
                  : t('radio-waiting', { defaultValue: 'picking' })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
