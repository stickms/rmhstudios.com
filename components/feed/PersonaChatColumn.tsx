'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Loader2, Bot, Send, ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Msg {
  role: string;
  content: string;
}
interface Persona {
  id: string;
  name: string;
  tagline: string | null;
  greeting: string | null;
  emoji: string | null;
  avatarUrl?: string | null;
  chatCount: number;
  isOwner: boolean;
  owner: { name: string | null; handle: string | null };
}

export function PersonaChatColumn({ id }: { id: string }) {
  const { t } = useTranslation('feed');
  const [persona, setPersona] = useState<Persona | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/personas/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setPersona(data.persona);
      setMessages(data.messages ?? []);
      setSignedIn(!!data.signedIn);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setSending(true);
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(id)}/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: `(${data.error ?? t('chat-error', { defaultValue: 'Something went wrong' })})` }]);
      }
    } finally {
      setSending(false);
    }
  }

  async function del() {
    if (!confirm(t('delete-persona-confirm', { defaultValue: 'Delete this persona?' }))) return;
    const res = await fetch(`/api/personas/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) window.location.href = '/personas';
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }
  if (notFound || !persona) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
        <p className="font-medium text-site-text">{t('persona-not-found', { defaultValue: 'Persona not found' })}</p>
        <Link to="/personas">
          <Button variant="outline">{t('browse-personas', { defaultValue: 'Browse personas' })}</Button>
        </Link>
      </div>
    );
  }

  const greetingShown = messages.length === 0 && persona.greeting;

  return (
    <div className="flex h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Link to="/personas" className="text-site-text-dim hover:text-site-text">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-site-accent/12 text-lg">
          {persona.avatarUrl ? (
            <img src={persona.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            persona.emoji || <Bot className="h-4 w-4 text-site-accent" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-site-text">{persona.name}</p>
          {persona.tagline && <p className="truncate text-xs text-site-text-dim">{persona.tagline}</p>}
        </div>
        {persona.isOwner && (
          <button onClick={del} className="text-site-text-dim hover:text-site-danger" title={t('delete-persona', { defaultValue: 'Delete persona' })} aria-label={t('delete-persona', { defaultValue: 'Delete persona' })}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {greetingShown && (
          <Bubble role="assistant" emoji={persona.emoji} avatarUrl={persona.avatarUrl}>
            {persona.greeting}
          </Bubble>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} emoji={persona.emoji} avatarUrl={persona.avatarUrl}>
            {m.content}
          </Bubble>
        ))}
        {sending && (
          <Bubble role="assistant" emoji={persona.emoji} avatarUrl={persona.avatarUrl}>
            <span className="inline-flex items-center gap-1 text-site-text-dim">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('typing', { defaultValue: 'typing…' })}
            </span>
          </Bubble>
        )}
      </div>

      <div className="border-t border-site-border p-3">
        {signedIn ? (
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
              placeholder={t('message-placeholder', { name: persona.name, defaultValue: 'Message {{name}}…' })}
              rows={1}
              maxLength={1000}
              className="max-h-32 flex-1 resize-none rounded-xl border border-site-border bg-site-surface px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
            />
            <Button variant="accent" size="sm" disabled={!input.trim() || sending} onClick={send} className="h-9 gap-1">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="py-2 text-center text-sm text-site-text-muted">
            <Link
              to="/login"
              search={{ callbackURL: `/personas/${id}` }}
              className="font-semibold text-site-accent hover:underline"
            >
              {t('sign-in', { defaultValue: 'Sign in' })}
            </Link>{' '}
            {t('sign-in-to-chat', { name: persona.name, defaultValue: 'to chat with {{name}}.' })}
          </p>
        )}
      </div>
    </div>
  );
}

function Bubble({ role, emoji, avatarUrl, children }: { role: string; emoji: string | null; avatarUrl?: string | null; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-site-accent/12 text-sm">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            emoji || <Bot className="h-3.5 w-3.5 text-site-accent" />
          )}
        </div>
      )}
      <div
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
          isUser ? 'bg-site-accent text-(--site-accent-fg)' : 'bg-site-surface text-site-text'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
