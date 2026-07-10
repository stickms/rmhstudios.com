'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface RideChatMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

interface RideChatProps {
  messages: RideChatMessage[];
  currentUserId: string;
  onSend: (content: string) => Promise<void> | void;
  disabled?: boolean;
  otherName?: string;
}

export function RideChat({ messages, currentUserId, onSend, disabled, otherName }: RideChatProps) {
  const { t } = useTranslation('c-rideshare');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the view pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await onSend(content);
      setInput('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-site-border bg-site-surface/80">
      <div className="flex items-center gap-2 border-b border-site-border px-4 py-2.5">
        <MessageCircle className="h-4 w-4 text-site-accent" />
        <span className="text-sm font-semibold text-site-text">
          {otherName ? t("chat-with-name", { defaultValue: "Chat with {{name}}", name: otherName }) : t("chat", { defaultValue: "Chat" })}
        </span>
      </div>

      <div ref={scrollRef} className="max-h-56 min-h-32 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-site-text-muted">
            {disabled ? t("chat-unavailable-msg", { defaultValue: "Chat is unavailable." }) : t("chat-empty-hint", { defaultValue: "Say hi 👋 — messages are private to this trip." })}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                    mine
                      ? 'rounded-br-sm bg-site-accent text-(--site-accent-fg)'
                      : 'rounded-bl-sm bg-site-surface-hover text-site-text'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-site-border p-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          maxLength={500}
          placeholder={disabled ? t("chat-unavailable", { defaultValue: "Chat unavailable" }) : t("type-message", { defaultValue: "Type a message…" })}
          className="min-w-0 flex-1 rounded-lg border border-site-border bg-site-surface px-3 py-2.5 text-base text-site-text outline-none transition-colors placeholder:text-site-text-dim focus:border-site-accent/60 disabled:opacity-50 sm:py-2 sm:text-sm"
        />
        <button
          type="submit"
          disabled={disabled || sending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-site-accent text-(--site-accent-fg) transition-colors hover:bg-(--site-accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t("send-message", { defaultValue: "Send message" })}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
