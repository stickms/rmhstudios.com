'use client';

/**
 * Gabriel's Horn — table talk.
 *
 * Not decoration. The claims are structured numbers, but the *persuasion* is
 * not — "he always says fourteen", "I swear it's a nine" — and a bluffing game
 * with no channel for that is a game of coin flips. Kept deliberately small:
 * one line in, a short scrollback out.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { CHAT_MAX_LENGTH } from '@/lib/gabriels-horn/constants';
import { hornNet } from '@/lib/gabriels-horn/net/client';
import { useHornStore } from '@/lib/gabriels-horn/store';
import { HornButton } from './ui';

export function TableChat() {
  const { t } = useTranslation('c-gabriels-horn');
  const chat = useHornStore((s) => s.chat);
  const selfSocketId = useHornStore((s) => s.selfSocketId);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [chat.length]);

  return (
    <div className="flex flex-col gap-2">
      <ol className="app-scroll-y max-h-32 space-y-1 text-xs">
        {chat.length === 0 ? (
          <li className="text-(--app-text-dim)">
            {t('chat-empty', { defaultValue: 'Say something. Lying is allowed.' })}
          </li>
        ) : (
          chat.map((message, index) => (
            <li key={message.id} ref={index === chat.length - 1 ? endRef : undefined}>
              <span
                className={
                  message.socketId === selfSocketId
                    ? 'font-semibold text-(--app-accent)'
                    : 'font-semibold text-(--app-text)'
                }
              >
                {message.name}
              </span>
              <span className="text-(--app-text-muted)">: {message.text}</span>
            </li>
          ))
        )}
      </ol>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const clean = text.trim();
          if (!clean) return;
          hornNet.chat(clean);
          setText('');
        }}
      >
        <label className="sr-only" htmlFor="gh-chat">
          {t('chat-label', { defaultValue: 'Message the table' })}
        </label>
        <input
          id="gh-chat"
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('chat-placeholder', { defaultValue: 'Talk to the table…' })}
          autoComplete="off"
          className="min-w-0 grow rounded-[var(--app-radius-sm)] border border-(--app-border) bg-(--app-bg-subtle) px-3 py-1.5 text-sm text-(--app-text) placeholder:text-(--app-text-dim) focus-visible:border-(--app-accent)"
        />
        <HornButton
          type="submit"
          size="sm"
          disabled={!text.trim()}
          aria-label={t('chat-send', { defaultValue: 'Send' })}
        >
          <Send className="size-3.5" aria-hidden="true" />
        </HornButton>
      </form>
    </div>
  );
}
