'use client';

import {
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { GifPicker } from '@/components/feed/GifPicker';
import { parseRemind, resolveCommand, suggestCommands } from '@/lib/chat-plus/commands';
import type { ChatRef } from '@/lib/chat-plus/types';

/**
 * M4 — slash commands for a chat composer.
 *
 * The hook owns the autocomplete popover and the "run it instead of sending it"
 * decision; the host view only forwards three things: the draft and its setter,
 * the textarea ref (the popover anchors to it), and what to do with a message the
 * server created (`onPosted`) or a GIF the user picked (`onPickGif`).
 *
 * Which commands exist, and how their arguments parse, lives in
 * `lib/chat-plus/commands.ts` — the same module the server validates with.
 */
export function useSlashCommands({
  chat,
  draft,
  setDraft,
  inputRef,
  onPosted,
  onPickGif,
}: {
  chat: ChatRef;
  draft: string;
  setDraft: (v: string) => void;
  inputRef: RefObject<HTMLElement | null>;
  onPosted: (message: unknown) => void;
  onPickGif: (url: string) => void;
}): {
  /** Render next to the composer. */
  popover: ReactNode;
  /** Returns true when the key was consumed (arrows / Tab / Enter on a suggestion). */
  onKeyDown: (e: KeyboardEvent) => boolean;
  /** Returns true when `text` was a command and has been dealt with. */
  tryRun: (text: string) => Promise<boolean>;
} {
  const { t } = useTranslation('f-messaging');
  const [active, setActive] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [gifQuery, setGifQuery] = useState<string | null>(null);

  const suggestions = useMemo(() => suggestCommands(draft, chat.kind), [draft, chat.kind]);
  const open = suggestions.length > 0 && dismissedFor !== draft;
  const index = Math.min(active, Math.max(suggestions.length - 1, 0));

  const complete = useCallback(
    (name: string) => {
      setDraft(`/${name} `);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [inputRef, setDraft],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      if (!open) return false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((index + step + suggestions.length) % suggestions.length);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissedFor(draft);
        return true;
      }
      const chosen = suggestions[index];
      const typed = draft.slice(1).toLowerCase();
      // Tab always completes. Enter completes too — unless the name is already
      // fully typed (`/flip`), in which case Enter runs it.
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && chosen.name !== typed)) {
        e.preventDefault();
        complete(chosen.name);
        return true;
      }
      return false;
    },
    [open, index, suggestions, draft, complete],
  );

  const tryRun = useCallback(
    async (text: string): Promise<boolean> => {
      const resolved = resolveCommand(text, chat.kind);
      if (!resolved) return false;
      const { command, args } = resolved;

      if (command.name === 'gif') {
        setDraft('');
        setGifQuery(args);
        return true;
      }

      if (command.name === 'remind') {
        const parsed = parseRemind(args);
        if (!parsed.ok) {
          toast.error(
            t('remind-usage', {
              defaultValue: 'Use /remind 2h call back (or tonight, tomorrow, 1d, 1h30m)',
            }),
          );
          return true;
        }
        try {
          const res = await fetch('/api/reminders', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'page',
              targetId: `chat-${chat.kind}-${chat.id}-${Date.now()}`.slice(0, 128),
              label: parsed.value.text,
              url: chat.kind === 'dm' ? `/messages/${chat.id}` : `/groups/${chat.id}`,
              remindAt: parsed.value.remindAt.toISOString(),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast.error(
              data.error || t('remind-failed', { defaultValue: 'Could not set that reminder' }),
            );
            return true;
          }
          setDraft('');
          toast.success(
            t('remind-set', {
              when: parsed.value.remindAt.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
              defaultValue: 'Reminder set for {{when}}',
            }),
          );
        } catch {
          toast.error(t('remind-failed', { defaultValue: 'Could not set that reminder' }));
        }
        return true;
      }

      // Everything else is decided on the server.
      try {
        const res = await fetch(`/api/chats/${chat.kind}/${encodeURIComponent(chat.id)}/command`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // The draft stays, so a typo in `/poll` is one edit away from working.
          toast.error(
            data.error || t('command-failed', { defaultValue: 'That command did not work' }),
          );
          return true;
        }
        setDraft('');
        onPosted(data.message);
      } catch {
        toast.error(t('command-failed', { defaultValue: 'That command did not work' }));
      }
      return true;
    },
    [chat.id, chat.kind, onPosted, setDraft, t],
  );

  const popover = (
    <>
      <AnchoredMenu
        open={open}
        onClose={() => setDismissedFor(draft)}
        anchorRef={inputRef}
        side="top"
        align="start"
        role="listbox"
        focusOnOpen={false}
        label={t('slash-commands', { defaultValue: 'Commands' })}
        className="w-72 max-w-[calc(100vw-2rem)]"
      >
        {suggestions.map((c, i) => (
          <MenuItem
            key={c.name}
            role="option"
            aria-selected={i === index}
            onMouseDown={(e) => e.preventDefault()}
            onSelect={() => complete(c.name)}
            className={i === index ? 'bg-site-surface-hover' : undefined}
          >
            <span className="block">
              <span className="font-mono text-sm text-site-text">
                /{c.name}
                {c.usage ? ` ${c.usage}` : ''}
              </span>
              <span className="block truncate text-xs text-site-text-dim">
                {t(c.labelKey, { defaultValue: c.label })}
              </span>
            </span>
          </MenuItem>
        ))}
      </AnchoredMenu>
      {gifQuery !== null && (
        <div className="mb-2">
          <GifPicker
            initialQuery={gifQuery}
            onClose={() => setGifQuery(null)}
            onSelect={(url) => {
              onPickGif(url);
              setGifQuery(null);
            }}
          />
        </div>
      )}
    </>
  );

  return { popover, onKeyDown, tryRun };
}
