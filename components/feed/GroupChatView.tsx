'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, ArrowLeft, Send, Users, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from './UserAvatar';

interface Sender {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}
interface Msg {
  id: string;
  content: string;
  createdAt: string;
  sender: Sender;
}
interface Group {
  id: string;
  name: string;
  isOwner: boolean;
  members: Sender[];
  messages: Msg[];
}

export function GroupChatView({ id, currentUserId }: { id: string; currentUserId: string }) {
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAtRef = useRef<string | null>(null);

  const setMsgs = useCallback((msgs: Msg[]) => {
    setMessages(msgs);
    if (msgs.length) lastAtRef.current = msgs[msgs.length - 1].createdAt;
  }, []);

  // Append new messages, de-duping by id (SSE and the optimistic send/poll
  // fallback can both deliver the same message) and advancing the cursor.
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

  // Live updates: prefer SSE for instant delivery, fall back to `?after=`
  // polling when EventSource is unavailable or the stream can't connect.
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
      es.onerror = () => {
        // EventSource auto-reconnects; meanwhile fall back to polling and
        // reconcile anything missed during the gap.
        connected = false;
        startPolling();
        poll();
      };
      // If the stream hasn't opened shortly (e.g. a buffering proxy), poll.
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
  }, [id, notFound, loading, appendMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    try {
      const res = await fetch(`/api/group-chats/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const data = await res.json();
        appendMessages([data.message]);
      }
    } finally {
      setSending(false);
    }
  }

  async function leave() {
    if (!confirm('Leave this group?')) return;
    const res = await fetch(`/api/group-chats/${encodeURIComponent(id)}/leave`, { method: 'POST', credentials: 'include' });
    if (res.ok) navigate({ to: '/groups' });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }
  if (notFound || !group) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
        <p className="font-medium text-site-text">Group not found</p>
        <Link to="/groups">
          <Button variant="outline">Back to groups</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Link to="/groups" className="text-site-text-dim hover:text-site-text">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-site-accent/12 text-site-accent">
          <Users className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-site-text">{group.name}</p>
          <p className="truncate text-xs text-site-text-dim">{group.members.length} members</p>
        </div>
        <button onClick={leave} className="text-site-text-dim hover:text-site-danger" title="Leave group" aria-label="Leave group">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => {
          const mine = m.sender.id === currentUserId;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {!mine && <UserAvatar user={m.sender} />}
              <div className="max-w-[78%]">
                {!mine && <p className="mb-0.5 px-1 text-[11px] text-site-text-dim">{m.sender.name || m.sender.handle || 'Member'}</p>}
                <div className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-site-accent text-(--site-accent-fg)' : 'bg-site-surface text-site-text'}`}>
                  {m.content}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-site-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message…"
            rows={1}
            maxLength={2000}
            className="max-h-32 flex-1 resize-none rounded-xl border border-site-border bg-site-surface px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
          />
          <Button variant="accent" size="sm" disabled={!input.trim() || sending} onClick={send} className="h-9">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
