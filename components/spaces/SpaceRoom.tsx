'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Radio, Send, Pin, PinOff, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { authClient } from '@/lib/auth-client';
import { ensureTrailingSlash } from '@/lib/url';
import { cn } from '@/lib/utils';
import { SPACE_C2S, SPACE_S2C } from '@/lib/spaces/events';
import type { SpacePinned, SpaceStatus, SpaceView } from '@/lib/spaces/types';

interface LiveMessage {
  id: string;
  name: string | null;
  image: string | null;
  body: string;
}

interface AudienceMember {
  userId: string;
  name: string | null;
  image: string | null;
}

interface Burst {
  key: string;
  emoji: string;
  left: number;
}

const REACTIONS = ['❤️', '🔥', '👏', '😂', '🎉', '😮'];

function Avatar({ name, image, size = 28 }: { name: string | null; image: string | null; size?: number }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-site-surface-hover text-xs font-semibold text-site-text-muted"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  );
}

function PinnedPanel({ pinned }: { pinned: SpacePinned }) {
  const { t } = useTranslation('site');
  const href =
    pinned.kind === 'url'
      ? pinned.ref
      : pinned.kind === 'post'
        ? `/post/${pinned.ref}`
        : pinned.kind === 'music_room'
          ? `/rmhmusic/${pinned.ref}`
          : `/rmhtube/${pinned.ref}`;
  const label =
    pinned.kind === 'url'
      ? t('space-pinned-link', { defaultValue: 'Pinned link' })
      : pinned.kind === 'post'
        ? t('space-pinned-post', { defaultValue: 'Pinned post' })
        : pinned.kind === 'music_room'
          ? t('space-pinned-music', { defaultValue: 'Listening room' })
          : t('space-pinned-tube', { defaultValue: 'Watch party' });
  return (
    <div className="mx-4 mt-3 rounded-site border border-site-border bg-site-surface p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-accent">
        <Pin className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <a
        href={href}
        className="break-words text-sm text-site-text underline-offset-2 hover:underline"
        {...(pinned.kind === 'url' ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
      >
        {pinned.ref}
      </a>
    </div>
  );
}

export function SpaceRoom({ initialSpace }: { initialSpace: SpaceView }) {
  const { t } = useTranslation('site');
  const { data: session } = useSession();
  const reduced = useReducedMotion();

  const viewerId = session?.user?.id ?? null;
  const isHost = viewerId != null && viewerId === initialSpace.hostId;

  const [status, setStatus] = useState<SpaceStatus>(initialSpace.status);
  const [pinned, setPinned] = useState<SpacePinned | null>(initialSpace.pinned);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [audience, setAudience] = useState<AudienceMember[]>([]);
  const [audienceCount, setAudienceCount] = useState<number | null>(initialSpace.audienceCount ?? null);
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState('');
  const [pinDraft, setPinDraft] = useState('');
  const [bursts, setBursts] = useState<Burst[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const pushBurst = useCallback(
    (emoji: string) => {
      if (reduced) return; // respect reduced motion — skip floating bursts
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setBursts((prev) => [...prev.slice(-24), { key, emoji, left: 10 + Math.random() * 80 }]);
      window.setTimeout(() => setBursts((prev) => prev.filter((b) => b.key !== key)), 1800);
    },
    [reduced],
  );

  // ─── Live socket connection (skipped for ended spaces) ───
  useEffect(() => {
    if (status === 'ENDED') return;
    const base = import.meta.env.VITE_SOCKET_URL;
    if (!base) return;

    const socket = io(ensureTrailingSlash(base), {
      path: '/socket/',
      auth: (cb) => {
        authClient
          .getSession()
          .then((s) => cb({ token: s?.data?.session?.token }))
          .catch(() => cb({}));
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit(SPACE_C2S.JOIN, { spaceId: initialSpace.id });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on(SPACE_S2C.STATE, (s: { audience?: AudienceMember[]; audienceCount?: number; pinned?: SpacePinned | null; status?: SpaceStatus }) => {
      if (Array.isArray(s.audience)) setAudience(s.audience);
      if (typeof s.audienceCount === 'number') setAudienceCount(s.audienceCount);
      setPinned(s.pinned ?? null);
      if (s.status) setStatus(s.status);
    });
    socket.on(SPACE_S2C.MESSAGE, (m: LiveMessage) => {
      setMessages((prev) => [...prev.slice(-199), m]);
    });
    socket.on(SPACE_S2C.REACTION, (r: { emoji?: string }) => {
      if (r?.emoji) pushBurst(r.emoji);
    });
    socket.on(SPACE_S2C.PINNED, (p: { pinned?: SpacePinned | null }) => setPinned(p?.pinned ?? null));
    socket.on(SPACE_S2C.ENDED, () => {
      setStatus('ENDED');
      toast(t('space-ended', { defaultValue: 'This Space has ended' }));
    });
    socket.on(SPACE_S2C.ERROR, (e: { message?: string }) => {
      if (e?.message) toast.error(e.message);
    });

    return () => {
      socket.emit(SPACE_C2S.LEAVE, { spaceId: initialSpace.id });
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [initialSpace.id, status, pushBurst, t]);

  // Keep the chat pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const sendMessage = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    if (!viewerId) {
      toast.error(t('space-sign-in-to-chat', { defaultValue: 'Sign in to chat' }));
      return;
    }
    socketRef.current?.emit(SPACE_C2S.CHAT, { spaceId: initialSpace.id, body });
    setDraft('');
  }, [draft, viewerId, initialSpace.id, t]);

  const react = useCallback(
    (emoji: string) => {
      if (!viewerId) return;
      socketRef.current?.emit(SPACE_C2S.REACT, { spaceId: initialSpace.id, emoji });
      pushBurst(emoji);
    },
    [viewerId, initialSpace.id, pushBurst],
  );

  const goLive = useCallback(async () => {
    try {
      const res = await fetch(`/api/spaces/${initialSpace.id}/start`, { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Failed to start');
      }
      setStatus('LIVE');
      toast.success(t('space-now-live', { defaultValue: 'You are live' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start');
    }
  }, [initialSpace.id, t]);

  const endSpace = useCallback(() => {
    socketRef.current?.emit(SPACE_C2S.END, { spaceId: initialSpace.id });
    setStatus('ENDED');
  }, [initialSpace.id]);

  const submitPin = useCallback(() => {
    const ref = pinDraft.trim();
    if (!ref) return;
    socketRef.current?.emit(SPACE_C2S.PIN, { spaceId: initialSpace.id, pinned: { kind: 'url', ref } });
    setPinDraft('');
  }, [pinDraft, initialSpace.id]);

  const unpin = useCallback(() => {
    socketRef.current?.emit(SPACE_C2S.PIN, { spaceId: initialSpace.id, pinned: null });
  }, [initialSpace.id]);

  const transcript = useMemo(
    () =>
      (initialSpace.transcript ?? []).map((m) => ({
        id: m.id,
        name: m.author.name,
        image: m.author.image,
        body: m.body,
      })),
    [initialSpace.transcript],
  );

  const statusBadge = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        status === 'LIVE' && 'bg-site-danger/15 text-site-danger',
        status === 'SCHEDULED' && 'bg-site-surface-hover text-site-text-muted',
        status === 'ENDED' && 'bg-site-surface-hover text-site-text-dim',
      )}
    >
      {status === 'LIVE' && <span className="h-2 w-2 animate-pulse rounded-full bg-site-danger" aria-hidden />}
      {status === 'LIVE'
        ? t('space-status-live', { defaultValue: 'Live' })
        : status === 'SCHEDULED'
          ? t('space-status-scheduled', { defaultValue: 'Scheduled' })
          : t('space-status-ended', { defaultValue: 'Ended' })}
    </span>
  );

  const hostActions = isHost ? (
    <>
      {status === 'SCHEDULED' && (
        <Button size="sm" variant="accent" onClick={goLive}>
          {t('space-go-live', { defaultValue: 'Go live' })}
        </Button>
      )}
      {status === 'LIVE' && (
        <Button size="sm" variant="outline" onClick={endSpace}>
          {t('space-end', { defaultValue: 'End' })}
        </Button>
      )}
    </>
  ) : null;

  const isEnded = status === 'ENDED';

  return (
    <div className="relative flex min-h-[calc(100dvh-var(--dock-height,0px))] flex-col">
      <ColumnHeader
        icon={Radio}
        title={initialSpace.title}
        actions={
          <div className="flex items-center gap-2">
            {statusBadge}
            {hostActions}
          </div>
        }
      />

      {pinned && <PinnedPanel pinned={pinned} />}

      {/* Host pin controls (live only) */}
      {isHost && status === 'LIVE' && (
        <div className="mx-4 mt-3 flex items-center gap-2">
          <input
            value={pinDraft}
            onChange={(e) => setPinDraft(e.target.value)}
            placeholder={t('space-pin-placeholder', { defaultValue: 'Pin a link (URL)…' })}
            className="min-w-0 flex-1 rounded-site border border-site-border bg-site-surface px-3 py-1.5 text-sm text-site-text placeholder:text-site-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
          />
          <Button size="sm" variant="ghost" onClick={submitPin} aria-label={t('space-pin', { defaultValue: 'Pin' })}>
            <Pin className="h-4 w-4" aria-hidden />
          </Button>
          {pinned && (
            <Button size="sm" variant="ghost" onClick={unpin} aria-label={t('space-unpin', { defaultValue: 'Unpin' })}>
              <PinOff className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      )}

      {/* Audience strip */}
      <div className="flex items-center gap-2 px-4 py-3">
        <Users className="h-4 w-4 text-site-text-muted" aria-hidden />
        <span className="text-sm text-site-text-muted">
          {audienceCount ?? audience.length}
        </span>
        <div className="flex -space-x-2">
          {audience.slice(0, 8).map((m) => (
            <span key={m.userId} className="ring-2 ring-site-bg rounded-full">
              <Avatar name={m.name} image={m.image} />
            </span>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-2" aria-live="polite">
        {isEnded ? (
          initialSpace.recordChat ? (
            transcript.length > 0 ? (
              transcript.map((m) => <MessageRow key={m.id} name={m.name} image={m.image} body={m.body} />)
            ) : (
              <p className="py-10 text-center text-sm text-site-text-dim">
                {t('space-no-transcript', { defaultValue: 'No messages were recorded.' })}
              </p>
            )
          ) : (
            <p className="py-10 text-center text-sm text-site-text-dim">
              {t('space-chat-not-recorded', { defaultValue: "This Space's chat wasn't recorded." })}
            </p>
          )
        ) : messages.length > 0 ? (
          messages.map((m) => <MessageRow key={m.id} name={m.name} image={m.image} body={m.body} />)
        ) : (
          <p className="py-10 text-center text-sm text-site-text-dim">
            {status === 'SCHEDULED'
              ? t('space-not-started', { defaultValue: 'This Space has not started yet.' })
              : t('space-say-hi', { defaultValue: 'Be the first to say something.' })}
          </p>
        )}
      </div>

      {/* Floating reaction bursts */}
      {!reduced && bursts.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 h-40 overflow-hidden" aria-hidden>
          {bursts.map((b) => (
            <span key={b.key} className="space-burst absolute text-2xl" style={{ left: `${b.left}%` }}>
              {b.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Composer + reactions (live only) */}
      {status === 'LIVE' && (
        <div className="border-t border-site-border bg-site-bg/80 px-4 py-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => react(emoji)}
                className="rounded-full border border-site-border px-2 py-1 text-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
                aria-label={t('space-react-with', { defaultValue: 'React' })}
              >
                {emoji}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              disabled={!connected}
              placeholder={
                viewerId
                  ? t('space-message-placeholder', { defaultValue: 'Say something…' })
                  : t('space-sign-in-to-chat', { defaultValue: 'Sign in to chat' })
              }
              className="min-w-0 flex-1 rounded-site border border-site-border bg-site-surface px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
            />
            <Button type="submit" size="sm" variant="accent" disabled={!draft.trim() || !viewerId} aria-label={t('space-send', { defaultValue: 'Send' })}>
              <Send className="h-4 w-4" aria-hidden />
            </Button>
          </form>
        </div>
      )}

      <style>{`
        .space-burst {
          bottom: 0;
          animation: space-burst-rise 1.8s ease-out forwards;
        }
        @keyframes space-burst-rise {
          0% { transform: translateY(0) scale(0.8); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translateY(-140px) scale(1.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function MessageRow({ name, image, body }: { name: string | null; image: string | null; body: string }) {
  return (
    <div className="flex items-start gap-2">
      <Avatar name={name} image={image} />
      <div className="min-w-0">
        <span className="mr-1.5 text-sm font-semibold text-site-text">{name ?? 'Player'}</span>
        <span className="break-words text-sm text-site-text-muted">{body}</span>
      </div>
    </div>
  );
}
