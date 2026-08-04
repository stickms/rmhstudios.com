/**
 * Massive March — spatial text.
 *
 * Everything here has already been through the audibility rule on the server. A
 * line that arrives with `muffle: 0.5` was heard through a hill; one that was
 * fully blocked never arrived at all, and there is deliberately no indication
 * that somebody said something you could not hear — because in the world, there
 * would not be.
 *
 * The garbling is done server-side and is deterministic per message, so two
 * people standing together see the same holes and can compare notes about what
 * the missing words probably were. That is a conversation the design wants to
 * happen (§8.4).
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, Megaphone } from 'lucide-react';
import { CHAT_MAX_LENGTH } from '@/lib/massive-march/constants';
import { input } from '@/lib/massive-march/input';
import { mm } from '@/lib/massive-march/net/client';
import { avatarColor } from '@/lib/massive-march/palette';
import { useMmStore } from '@/lib/massive-march/store';
import { BOARD, INK } from '../ui';

/** Lines older than this fade out of the passive log. */
const LINGER_MS = 22_000;

export function ChatLog() {
  const chat = useMmStore((s) => s.chat);
  const open = useMmStore((s) => s.chatOpen);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const visible = useMemo(
    () => (open ? chat.slice(-14) : chat.filter((line) => now - line.at < LINGER_MS).slice(-8)),
    [chat, now, open],
  );

  if (visible.length === 0) return null;

  return (
    <ul
      className="pointer-events-none flex max-w-[min(30rem,74vw)] flex-col gap-1"
      aria-live="polite"
      aria-atomic="false"
    >
      {visible.map((line) => {
        const age = now - line.at;
        const fade = open ? 1 : Math.max(0.25, 1 - Math.max(0, age - LINGER_MS * 0.7) / (LINGER_MS * 0.3));
        return (
          <li
            key={line.id}
            className="w-fit border-2 px-2 py-1 text-sm leading-snug"
            style={{
              background: 'rgba(20,18,16,0.7)',
              borderColor: 'rgba(247,243,232,0.22)',
              color: BOARD,
              borderRadius: 3,
              opacity: fade,
            }}
          >
            <span className="mr-1.5 inline-flex items-center gap-1 font-black">
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-full"
                style={{ background: avatarColor(line.fromSlot) }}
              />
              {line.name}
              {line.channel === 'radio' ? (
                <Radio aria-label="over the radio" className="size-3 opacity-70" />
              ) : null}
              {line.channel === 'megaphone' ? (
                <Megaphone aria-label="through a megaphone" className="size-3 opacity-70" />
              ) : null}
            </span>
            <span
              style={{
                // Distance and walls take words away, and what is left arrives
                // looking like it did: dimmer, and harder to be sure of.
                opacity: 1 - line.muffle * 0.45,
                fontStyle: line.muffle > 0.3 ? 'italic' : undefined,
              }}
            >
              {line.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ChatInput() {
  const { t } = useTranslation('c-massive-march');
  const setChatOpen = useMmStore((s) => s.setChatOpen);
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // While a field has focus, movement keys are letters. The controller reads
    // this flag rather than the DOM so it never has to guess.
    input.typing = true;
    field.current?.focus();
    return () => {
      input.typing = false;
    };
  }, []);

  function send() {
    const trimmed = text.trim();
    if (trimmed) mm.chat(trimmed);
    setText('');
    setChatOpen(false);
  }

  return (
    <form
      className="pointer-events-auto flex w-[min(30rem,80vw)] gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <input
        ref={field}
        value={text}
        maxLength={CHAT_MAX_LENGTH}
        placeholder={t('chat-placeholder', { defaultValue: 'Say something out loud…' })}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setChatOpen(false);
          }
        }}
        className="flex-1 border-[3px] px-3 py-2 text-sm outline-none"
        style={{ background: BOARD, borderColor: INK, color: INK, borderRadius: 3 }}
        aria-label={t('chat-label', { defaultValue: 'Message' })}
      />
    </form>
  );
}
