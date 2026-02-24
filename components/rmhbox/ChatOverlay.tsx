/**
 * ChatOverlay — Simple chat panel with message list and input field.
 *
 * Auto-scrolls to the bottom when new messages arrive.
 * On mobile: collapsible via a toggle header, constrained to max height.
 * On desktop: always expanded, fills available height.
 *
 * Props:
 *   messages: ChatMessage[] — Array of chat messages
 *   onSend: (content: string) => void — Callback to send a message
 */
'use client';

import { useRef, useEffect, useState, useCallback, type FormEvent } from 'react';
import { Send, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import type { ChatMessage } from '@/lib/rmhbox/types';

interface ChatOverlayProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
}

export default function ChatOverlay({ messages, onSend }: ChatOverlayProps) {
  const [input, setInput] = useState('');
  const [minimized, setMinimized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, minimized]);

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
    <div className="flex flex-col rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) lg:min-h-0 lg:flex-1">
      {/* Mobile toggle header */}
      <button
        onClick={() => setMinimized(!minimized)}
        className={`flex items-center justify-between px-3 py-2 lg:hidden shrink-0 ${minimized ? '' : 'border-b border-(--rmhbox-border)'}`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-(--rmhbox-text)">
          <MessageSquare className="h-4 w-4" />
          Chat
          {minimized && messages.length > 0 && (
            <span className="rounded-full bg-(--rmhbox-accent)/20 px-1.5 text-xs text-(--rmhbox-accent)">
              {messages.length}
            </span>
          )}
        </div>
        {minimized ? (
          <ChevronUp className="h-4 w-4 text-(--rmhbox-text-muted)" />
        ) : (
          <ChevronDown className="h-4 w-4 text-(--rmhbox-text-muted)" />
        )}
      </button>

      {/* Collapsible content — hidden on mobile when minimized */}
      <div className={`flex min-h-0 flex-1 flex-col max-lg:max-h-64 ${minimized ? 'hidden lg:flex' : ''}`}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {messages.map((msg) => (
            <div key={msg.id} className={msg.type === 'system' ? 'text-center' : ''}>
              {msg.type === 'system' ? (
                <span className="text-xs italic text-(--rmhbox-text-muted)">{msg.content}</span>
              ) : (
                <p className="text-sm text-(--rmhbox-text)">
                  <span className="font-semibold text-(--rmhbox-accent)">{msg.userName}</span>{' '}
                  {msg.content}
                </p>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-(--rmhbox-border) p-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              maxLength={200}
              className="flex-1 rounded-lg bg-(--rmhbox-bg) px-3 py-1.5 text-sm text-(--rmhbox-text) placeholder:text-(--rmhbox-text-muted) outline-none focus:ring-1 focus:ring-(--rmhbox-accent)"
            />
            <button
              type="submit"
              className="rounded-lg bg-(--rmhbox-accent) p-2 text-white transition-colors hover:bg-(--rmhbox-accent-hover)"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {input.length > 150 && (
            <p className="mt-1 text-right text-xs text-(--rmhbox-text-muted)">
              {input.length}/200
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
