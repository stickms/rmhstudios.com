'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, MessageCircle } from 'lucide-react';
import { useRmhMusicStore, getChatEntries } from '@/lib/rmhmusic/store';
import { emit } from '@/lib/rmhmusic/socket';
import { C2S } from '@/lib/rmhmusic/events';
import { formatRelativeTime } from '@/lib/rmhmusic/utils';
import MemberList from './MemberList';
import { useTranslation } from 'react-i18next';

export default function ChatPanel() {
  const store = useRmhMusicStore();
  const { isChatOpen, room } = store;
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { t } = useTranslation("c-rmhmusic");
  const entries = getChatEntries(store);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  function sendMessage() {
    const content = message.trim();
    if (!content) return;
    emit(C2S.ROOM_CHAT, { content });
    setMessage('');
  }

  return (
    <AnimatePresence>
      {isChatOpen && room && (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed right-0 top-0 bottom-[73px] w-80 z-40 flex flex-col overflow-hidden backdrop-blur-xl border-l"
          style={{ background: 'color-mix(in srgb, var(--site-bg) 90%, transparent)', borderColor: 'color-mix(in srgb, var(--site-text) 10%, transparent)' }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'color-mix(in srgb, var(--site-text) 10%, transparent)' }}>
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" style={{ color: 'var(--site-accent)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--site-text)' }}>{room.name}</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--site-surface)', color: 'var(--site-text-muted)' }}>
              {room.code}
            </span>
          </div>

          {/* Members */}
          <MemberList />

          {/* Chat messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {entries.map((entry) => {
              if ('type' in entry && entry.type === 'system') {
                return (
                  <p key={entry.id} className="text-xs text-center py-1" style={{ color: 'var(--site-text-dim)' }}>
                    {entry.content}
                  </p>
                );
              }
              const msg = entry as any;
              const isMe = msg.userId === room.myUserId;
              return (
                <div key={msg.id} className="flex flex-col">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold" style={{ color: isMe ? 'var(--site-accent)' : 'var(--site-text)' }}>
                      {msg.userName}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--site-text-dim)' }}>
                      {formatRelativeTime(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--site-text)' }}>{msg.content}</p>
                </div>
              );
            })}
          </div>

          {/* Input */}
          <div className="p-3 border-t" style={{ borderColor: 'color-mix(in srgb, var(--site-text) 10%, transparent)' }}>
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder={t("say-something", { defaultValue: "Say something..." })}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--site-surface)', color: 'var(--site-text)' }}
                maxLength={300}
              />
              <button
                onClick={sendMessage}
                disabled={!message.trim()}
                className="p-2 rounded-lg transition-opacity disabled:opacity-30"
                style={{ color: 'var(--site-accent)' }}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
