/**
 * ChatPanel — Real-time chat messages with input field.
 */
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { CHAT_MAX_LENGTH } from '@/lib/rmhtube/constants';

export default function ChatPanel() {
  const room = useRmhTubeStore((s) => s.room);
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Only auto-scroll if user is near the bottom
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [room?.chat.length]);

  const handleSend = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const content = message.trim();
    if (!content) return;
    emit(C2S.ROOM_CHAT, { content });
    setMessage('');
  }, [message]);

  if (!room) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-(--rmhtube-border)">
        <h3 className="text-sm font-semibold text-(--rmhtube-text-muted)">Chat</h3>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {room.chat.length === 0 ? (
          <p className="text-xs text-center py-4 text-(--rmhtube-text-dim)">
            No messages yet
          </p>
        ) : (
          room.chat.map((msg) => (
            <div key={msg.id} className="text-sm">
              <span
                className={`font-semibold ${
                  msg.userId === room.hostUserId
                    ? 'text-(--rmhtube-accent)'
                    : 'text-(--rmhtube-info)'
                }`}
              >
                {msg.userName}
              </span>
              <span className="text-(--rmhtube-text) ml-1.5">{msg.content}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 p-3 border-t border-(--rmhtube-border)">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Type a message..."
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm border border-(--rmhtube-border) bg-(--rmhtube-bg) text-(--rmhtube-text) placeholder:text-(--rmhtube-text-dim) outline-none focus:ring-1 focus:ring-(--rmhtube-accent)"
        />
        <button
          type="submit"
          disabled={!message.trim()}
          className="shrink-0 rounded-lg px-3 py-2 transition-colors disabled:opacity-50 bg-(--rmhtube-accent) text-white hover:bg-(--rmhtube-accent-hover)"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
