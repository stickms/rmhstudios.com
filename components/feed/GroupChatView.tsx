'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, ArrowLeft, Send, Users, LogOut, ImagePlus, ImagePlay, X, BarChart3, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from './UserAvatar';
import { MentionTextarea } from './MentionTextarea';
import { GifPicker } from './GifPicker';
import { PostImageGrid } from './PostImageGrid';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import { ReactionMenu } from '@/components/shared/ReactionMenu';
import { ReactionChips } from '@/components/shared/ReactionChips';
import { groupReactions, type ReactionRow } from '@/lib/social/reactions';

interface Sender {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}
interface Poll {
  question: string;
  options: { text: string; votes: number }[];
  totalVotes: number;
  myVote: number | null;
}
interface Msg {
  id: string;
  content: string;
  createdAt: string;
  sender: Sender;
  gifUrl?: string | null;
  imageUrls?: string[];
  poll?: Poll | null;
  reactions?: ReactionRow[];
}
interface Group {
  id: string;
  name: string;
  isOwner: boolean;
  members: Sender[];
  messages: Msg[];
}

const MAX_IMAGES = 4;

export function GroupChatView({ id, currentUserId }: { id: string; currentUserId: string }) {
  const { t } = useTranslation("feed");
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [pollDraft, setPollDraft] = useState<{ question: string; options: string[] } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [reactionMenu, setReactionMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Shared long-press timer for opening the reaction menu on touch devices.
  const touchTimer = useRef<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLDivElement>(null);
  const lastAtRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const insertEmoji = useEmojiInsert(inputRef, input, setInput);

  // Close the attach (+) menu on outside click.
  useEffect(() => {
    if (!attachOpen) return;
    const onDown = (e: MouseEvent) => {
      if (attachRef.current && !attachRef.current.contains(e.target as Node)) setAttachOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [attachOpen]);

  const setMsgs = useCallback((msgs: Msg[]) => {
    setMessages(msgs);
    if (msgs.length) lastAtRef.current = msgs[msgs.length - 1].createdAt;
  }, []);

  const appendMessages = useCallback((incoming: Msg[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const have = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !have.has(m.id));
      if (!fresh.length) return prev;
      const next = [...prev, ...fresh];
      lastAtRef.current = next[next.length - 1].createdAt;
      return next;
    });
  }, []);

  // Patch a single message in place (used for live poll-vote updates).
  const patchMessage = useCallback((messageId: string, patch: Partial<Msg>) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...patch } : m)));
  }, []);

  // Toggle the viewer's reaction row on a message (optimistic on raw rows).
  const applyRowToggle = useCallback((messageId: string, emoji: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const rows = m.reactions ?? [];
        const mine = rows.some((r) => r.emoji === emoji && r.userId === currentUserId);
        return {
          ...m,
          reactions: mine
            ? rows.filter((r) => !(r.emoji === emoji && r.userId === currentUserId))
            : [...rows, { emoji, userId: currentUserId }],
        };
      }),
    );
  }, [currentUserId]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    applyRowToggle(messageId, emoji);
    try {
      const res = await fetch(`/api/group-chats/${encodeURIComponent(id)}/react`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji }),
      });
      if (!res.ok) throw new Error('react failed');
    } catch {
      // Roll back the optimistic toggle (toggling again is its own inverse).
      applyRowToggle(messageId, emoji);
    }
  }, [id, applyRowToggle]);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/group-chats/${encodeURIComponent(id)}`, { credentials: 'include' });
      if (!active) return;
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setGroup(data.group);
        setMsgs(data.group.messages ?? []);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id, setMsgs]);

  // Live updates: prefer SSE, fall back to `?after=` polling.
  useEffect(() => {
    if (notFound || loading) return;

    let es: EventSource | null = null;
    let connected = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (!lastAtRef.current) return;
      try {
        const res = await fetch(
          `/api/group-chats/${encodeURIComponent(id)}/messages?after=${encodeURIComponent(lastAtRef.current)}`,
          { credentials: 'include' }
        );
        if (res.ok) {
          const data = await res.json();
          appendMessages(data.messages ?? []);
        }
      } catch {
        /* ignore transient poll errors */
      }
    };

    const startPolling = () => {
      if (!pollTimer) pollTimer = setInterval(poll, 5000);
    };
    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    if (typeof EventSource !== 'undefined') {
      es = new EventSource(`/api/group-chats/${encodeURIComponent(id)}/stream`, { withCredentials: true });
      es.addEventListener('open', () => {
        connected = true;
        stopPolling();
      });
      es.addEventListener('message', (e) => {
        try {
          appendMessages([JSON.parse((e as MessageEvent).data) as Msg]);
        } catch {
          /* ignore malformed event */
        }
      });
      es.addEventListener('reaction', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as {
            type: 'reaction';
            messageId: string;
            reactions: ReactionRow[];
          };
          patchMessage(payload.messageId, { reactions: payload.reactions });
        } catch {
          /* ignore malformed event */
        }
      });
      es.onerror = () => {
        connected = false;
        startPolling();
        poll();
      };
      connectTimer = setTimeout(() => {
        if (!connected) startPolling();
      }, 3000);
    } else {
      startPolling();
    }

    return () => {
      es?.close();
      stopPolling();
      if (connectTimer) clearTimeout(connectTimer);
    };
  }, [id, notFound, loading, appendMessages, patchMessage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Chat members get priority in @-mention autocomplete.
  const memberSuggestions = useMemo(
    () =>
      (group?.members ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        image: m.image,
        handle: m.handle,
        username: m.handle,
      })),
    [group?.members],
  );

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - imageUrls.length;
    if (remaining <= 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).slice(0, remaining).forEach((f) => form.append('images', f));
      const res = await fetch('/api/rmharks/image', { method: 'POST', body: form });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.urls)) setImageUrls((prev) => [...prev, ...data.urls].slice(0, MAX_IMAGES));
      }
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  async function send() {
    const text = input.trim();
    const poll =
      pollDraft && pollDraft.question.trim() && pollDraft.options.filter((o) => o.trim()).length >= 2
        ? { question: pollDraft.question.trim(), options: pollDraft.options.map((o) => o.trim()).filter(Boolean) }
        : null;
    const hasMedia = !!gifUrl || imageUrls.length > 0;
    if ((!text && !hasMedia && !poll) || sending) return;

    setSending(true);
    const pendingGif = gifUrl;
    const pendingImages = imageUrls;
    setInput('');
    setGifUrl(null);
    setImageUrls([]);
    setPollDraft(null);
    try {
      const res = await fetch(`/api/group-chats/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(text ? { content: text } : {}),
          ...(pendingGif ? { gifUrl: pendingGif } : {}),
          ...(pendingImages.length ? { imageUrls: pendingImages } : {}),
          ...(poll ? { poll } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        appendMessages([data.message]);
      } else {
        // Restore the draft on failure.
        setInput(text);
        setGifUrl(pendingGif);
        setImageUrls(pendingImages);
      }
    } finally {
      setSending(false);
    }
  }

  async function vote(messageId: string, optionIdx: number) {
    // Optimistic: reflect the choice immediately.
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.poll) return m;
        const prevVote = m.poll.myVote;
        if (prevVote === optionIdx) return m;
        const options = m.poll.options.map((o, i) => {
          let votes = o.votes;
          if (i === optionIdx) votes += 1;
          if (i === prevVote) votes -= 1;
          return { ...o, votes };
        });
        const totalVotes = prevVote === null ? m.poll.totalVotes + 1 : m.poll.totalVotes;
        return { ...m, poll: { ...m.poll, options, totalVotes, myVote: optionIdx } };
      }),
    );
    try {
      const res = await fetch(`/api/group-chats/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/vote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIdx }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.poll) patchMessage(messageId, { poll: data.poll });
      }
    } catch {
      /* keep optimistic state */
    }
  }

  async function leave() {
    if (!confirm(t("leave-group-confirm", { defaultValue: "Leave this group?" }))) return;
    const res = await fetch(`/api/group-chats/${encodeURIComponent(id)}/leave`, { method: 'POST', credentials: 'include' });
    if (res.ok) navigate({ to: '/messages', search: { tab: 'groups' } });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (notFound || !group) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
        <p className="font-medium text-site-text">{t("group-not-found", { defaultValue: "Group not found" })}</p>
        <Link to="/messages" search={{ tab: 'groups' }}>
          <Button variant="outline">{t("back-to-groups", { defaultValue: "Back to groups" })}</Button>
        </Link>
      </div>
    );
  }

  const canSend = (input.trim() || gifUrl || imageUrls.length > 0 || pollDraft) && !sending;

  return (
    <div className="flex h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Link to="/messages" search={{ tab: 'groups' }} className="text-site-text-dim hover:text-site-text">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-site-accent/12 text-site-accent">
          <Users className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-site-text">{group.name}</p>
          <p className="truncate text-xs text-site-text-dim">{t("member-count", { count: group.members.length, defaultValue: "{{count}} members" })}</p>
        </div>
        <button onClick={leave} className="text-site-text-dim hover:text-site-danger" title={t("leave-group", { defaultValue: "Leave group" })} aria-label={t("leave-group", { defaultValue: "Leave group" })}>
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => {
          const mine = m.sender.id === currentUserId;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {/* Show the sender's avatar on every message — including your own
                  (right-aligned), matching the 1:1 chat layout. */}
              <UserAvatar user={m.sender} />
              <div
                className="max-w-[78%]"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setReactionMenu({ x: e.clientX, y: e.clientY, messageId: m.id });
                }}
                onTouchStart={(e) => {
                  const t2 = e.touches[0];
                  touchTimer.current = window.setTimeout(
                    () => setReactionMenu({ x: t2.clientX, y: t2.clientY, messageId: m.id }),
                    500,
                  );
                }}
                onTouchMove={() => {
                  if (touchTimer.current) {
                    clearTimeout(touchTimer.current);
                    touchTimer.current = null;
                  }
                }}
                onTouchEnd={() => {
                  if (touchTimer.current) {
                    clearTimeout(touchTimer.current);
                    touchTimer.current = null;
                  }
                }}
              >
                {!mine && <p className="mb-0.5 px-1 text-[11px] text-site-text-dim">{m.sender.name || m.sender.handle || t("member-fallback", { defaultValue: "Member" })}</p>}
                {m.content && (
                  // Received bubbles use a high-contrast light fill so they read
                  // clearly against the black chat background; sent bubbles keep
                  // the accent colour. (`bg-site-text` is theme-adaptive.)
                  <div className={`whitespace-pre-wrap break-words rounded-site px-3 py-2 text-sm ${mine ? 'bg-site-accent text-(--site-accent-fg)' : 'bg-site-text text-site-bg'}`}>
                    {m.content}
                  </div>
                )}
                {m.imageUrls && m.imageUrls.length > 0 && (
                  <PostImageGrid urls={m.imageUrls} className="mt-1.5 overflow-hidden rounded-site-sm" />
                )}
                {m.gifUrl && (
                  <img src={m.gifUrl} alt="" className="mt-1.5 max-h-60 w-auto rounded-site-sm" loading="lazy" />
                )}
                {m.poll && <PollView poll={m.poll} onVote={(idx) => vote(m.id, idx)} t={t} />}
                {(m.reactions?.length ?? 0) > 0 && (
                  <ReactionChips
                    reactions={groupReactions(m.reactions ?? [], currentUserId)}
                    onToggle={(emoji) => toggleReaction(m.id, emoji)}
                    className={`mt-1 ${mine ? 'justify-end' : ''}`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* GIF picker */}
      {showGifPicker && (
        <div className="border-t border-site-border p-2">
          <GifPicker onSelect={(url) => { setGifUrl(url); setShowGifPicker(false); }} onClose={() => setShowGifPicker(false)} />
        </div>
      )}

      {/* Poll composer */}
      {pollDraft && (
        <PollComposer
          draft={pollDraft}
          onChange={setPollDraft}
          onCancel={() => setPollDraft(null)}
          t={t}
        />
      )}

      {/* Pending media preview */}
      {(imageUrls.length > 0 || gifUrl) && (
        <div className="flex flex-wrap gap-2 border-t border-site-border px-3 pt-2">
          {imageUrls.map((url) => (
            <div key={url} className="relative">
              <img src={url} alt="" className="h-20 w-20 rounded-site-sm object-cover" />
              <button
                type="button"
                onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-black/70 p-0.5 text-white"
                aria-label={t('remove', { defaultValue: 'Remove' })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {gifUrl && (
            <div className="relative">
              <img src={gifUrl} alt="" className="h-20 w-auto rounded-site-sm" />
              <button
                type="button"
                onClick={() => setGifUrl(null)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-black/70 p-0.5 text-white"
                aria-label={t('remove', { defaultValue: 'Remove' })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-site-border p-3">
        <div className="flex items-end gap-2">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleImageFiles(e.target.files)}
          />
          {/* Attach (+) menu — image, GIF, poll. Mirrors the rmhark composer. */}
          <div className="relative" ref={attachRef}>
            <button
              type="button"
              onClick={() => setAttachOpen((v) => !v)}
              aria-label={t('add-to-message', { defaultValue: 'Add to message' })}
              aria-expanded={attachOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full text-site-text-dim hover:bg-site-accent/10 hover:text-site-accent disabled:opacity-40"
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
            </button>
            {attachOpen && (
              <div className="absolute bottom-full left-0 z-30 mb-1 w-40 rounded-site border border-site-border bg-site-bg py-1 shadow-xl">
                <button
                  type="button"
                  disabled={imageUrls.length >= MAX_IMAGES}
                  onClick={() => { setAttachOpen(false); imageInputRef.current?.click(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-site-text hover:bg-site-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ImagePlus className="h-4 w-4 text-site-text-dim" /> {t('menu-add-image', { defaultValue: 'Add Image' })}
                </button>
                <button
                  type="button"
                  onClick={() => { setAttachOpen(false); setShowGifPicker((v) => !v); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-site-text hover:bg-site-surface"
                >
                  <ImagePlay className="h-4 w-4 text-site-text-dim" /> {t('menu-add-gif', { defaultValue: 'Add GIF' })}
                </button>
                <button
                  type="button"
                  onClick={() => { setAttachOpen(false); setPollDraft((p) => (p ? null : { question: '', options: ['', ''] })); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-site-text hover:bg-site-surface"
                >
                  <BarChart3 className="h-4 w-4 text-site-text-dim" /> {t('menu-create-poll', { defaultValue: 'Create Poll' })}
                </button>
              </div>
            )}
          </div>
          <EmojiPickerButton direction="up" onSelect={insertEmoji} />
          <div className="flex-1 min-w-0">
            <MentionTextarea
              ref={inputRef}
              value={input}
              onChange={setInput}
              priorityUsers={memberSuggestions}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={t("message-placeholder", { name: group.name, defaultValue: "Message…" })}
              rows={1}
              maxLength={2000}
              className="max-h-32 w-full resize-none rounded-site border border-site-border bg-site-surface px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
          </div>
          <Button variant="accent" size="sm" disabled={!canSend} onClick={send} className="h-9">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {reactionMenu && (
        <ReactionMenu
          x={reactionMenu.x}
          y={reactionMenu.y}
          onSelect={(emoji) => toggleReaction(reactionMenu.messageId, emoji)}
          onClose={() => setReactionMenu(null)}
        />
      )}
    </div>
  );
}

type TFn = ReturnType<typeof useTranslation>['t'];

function PollView({ poll, onVote, t }: { poll: Poll; onVote: (idx: number) => void; t: TFn }) {
  const voted = poll.myVote !== null;
  return (
    <div className="mt-1.5 w-64 max-w-full rounded-site border border-site-border bg-site-surface p-3">
      <p className="mb-2 text-sm font-semibold text-site-text">{poll.question}</p>
      <div className="flex flex-col gap-1.5">
        {poll.options.map((o, i) => {
          const pct = poll.totalVotes > 0 ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
          const chosen = poll.myVote === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onVote(i)}
              className={`relative overflow-hidden rounded-site-sm border px-3 py-1.5 text-left text-sm transition-colors ${chosen ? 'border-site-accent' : 'border-site-border hover:border-site-accent/60'}`}
            >
              {voted && (
                <span
                  className="absolute inset-y-0 left-0 bg-site-accent-dim"
                  style={{ width: `${pct}%` }}
                  aria-hidden="true"
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className={`truncate ${chosen ? 'font-semibold text-site-text' : 'text-site-text'}`}>{o.text}</span>
                {voted && <span className="shrink-0 text-xs text-site-text-dim">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-site-text-dim">
        {t('poll-votes', { count: poll.totalVotes, defaultValue: '{{count}} votes' })}
      </p>
    </div>
  );
}

function PollComposer({
  draft,
  onChange,
  onCancel,
  t,
}: {
  draft: { question: string; options: string[] };
  onChange: (d: { question: string; options: string[] }) => void;
  onCancel: () => void;
  t: TFn;
}) {
  const setOption = (i: number, val: string) => {
    const options = [...draft.options];
    options[i] = val;
    onChange({ ...draft, options });
  };
  return (
    <div className="border-t border-site-border bg-site-surface/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('poll', { defaultValue: 'Poll' })}</span>
        <button type="button" onClick={onCancel} className="text-site-text-dim hover:text-site-text" aria-label={t('cancel-button', { defaultValue: 'Cancel' })}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        value={draft.question}
        onChange={(e) => onChange({ ...draft, question: e.target.value })}
        maxLength={300}
        placeholder={t('poll-question-placeholder', { defaultValue: 'Ask a question…' })}
        className="mb-2 w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
      />
      <div className="flex flex-col gap-1.5">
        {draft.options.map((o, i) => (
          <input
            key={i}
            value={o}
            onChange={(e) => setOption(i, e.target.value)}
            maxLength={100}
            placeholder={t('poll-option-placeholder', { index: i + 1, defaultValue: 'Option {{index}}' })}
            className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-1.5 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
          />
        ))}
      </div>
      {draft.options.length < 6 && (
        <button
          type="button"
          onClick={() => onChange({ ...draft, options: [...draft.options, ''] })}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-site-accent hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> {t('add-option', { defaultValue: 'Add option' })}
        </button>
      )}
    </div>
  );
}
