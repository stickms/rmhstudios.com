/**
 * ChatOverlay — Simple chat panel with message list and input field.
 *
 * Auto-scrolls to the bottom when new messages arrive.
 *
 * Props:
 *   messages: ChatMessage[] — Array of chat messages
 *   onSend: (content: string) => void — Callback to send a message
 */
'use client';

import { useRef, useEffect, useState, useCallback, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import type { ChatMessage } from '@/lib/rmhbox/types';

interface ChatOverlayProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
}

export default function ChatOverlay({ messages, onSend }: ChatOverlayProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed) return;
      onSend(trimmed);
      setInput('');
    },
    [input, onSend],
  );

  return (
    <div className="flex h-72 flex-col rounded-xl bg-[var(--rmhbox-surface)] border border-[var(--rmhbox-border)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.type === 'system' ? 'text-center' : ''}>
            {msg.type === 'system' ? (
              <span className="text-xs italic text-[var(--rmhbox-text-muted)]">{msg.content}</span>
            ) : (
              <p className="text-sm text-[var(--rmhbox-text)]">
                <span className="font-semibold text-[var(--rmhbox-accent)]">{msg.userName}</span>{' '}
                {msg.content}
              </p>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex border-t border-[var(--rmhbox-border)] p-2 gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          maxLength={200}
          className="flex-1 rounded-lg bg-[var(--rmhbox-bg)] px-3 py-1.5 text-sm text-[var(--rmhbox-text)] placeholder:text-[var(--rmhbox-text-muted)] outline-none focus:ring-1 focus:ring-[var(--rmhbox-accent)]"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--rmhbox-accent)] p-2 text-white transition-colors hover:bg-[var(--rmhbox-accent-hover)]"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
