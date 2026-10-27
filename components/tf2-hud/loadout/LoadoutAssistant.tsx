/**
 * The loadout assistant: describe a theme, ask for ideas, or say what you need to counter, and it
 * answers with a few words and items you can equip with one tap. Everything it suggests has been
 * checked against the catalog on the server; if the model cannot be reached the same panel answers
 * from item names (and says so). A phone gets a full-height sheet, a desktop a dialog.
 */
'use client';

import { Send, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, Modal, TextField } from '@/components/tf2-hud/ui';
import { ApiError } from '@/lib/tf2-hud/api';
import { loadoutApi } from '@/lib/tf2-loadout/api';
import { ASSISTANT_LIMITS, heuristicSuggest, type AiAction } from '@/lib/tf2-loadout/ai-core';
import type { LoadoutSlots, TfClass } from '@/lib/tf2-loadout/catalog-types';
import type { CatalogIndex } from '@/lib/tf2-loadout/use-catalog';
import ItemTile from './ItemTile';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  actions?: AiAction[];
  /** Which of `actions` (by index) have been equipped. */
  applied?: Set<number>;
}

export default function LoadoutAssistant({
  open,
  onOpenChange,
  sheet,
  cls,
  slots,
  idx,
  signedIn,
  onNeedSignIn,
  onApply,
  canUndo,
  onUndo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A full-height sheet (phones) instead of a dialog. */
  sheet: boolean;
  cls: TfClass;
  slots: LoadoutSlots;
  idx: CatalogIndex;
  signedIn: boolean;
  onNeedSignIn: () => void;
  /** Equip these; returns nothing — the builder says what it did. */
  onApply: (actions: AiAction[]) => void;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);

  const add = (m: Omit<Message, 'id'>) =>
    setMessages((cur) => [...cur, { ...m, id: nextId.current++ }]);

  const chips = [
    t('ai-chip-halloween', { defaultValue: 'A spooky Halloween look' }),
    t('ai-chip-counter', { defaultValue: 'A loadout that counters Spies' }),
    t('ai-chip-cosmetics', { defaultValue: 'Suggest a cosmetic set' }),
  ];

  const send = async (raw: string) => {
    const message = raw.trim().slice(0, ASSISTANT_LIMITS.message);
    if (!message || busy) return;
    if (!signedIn) {
      onNeedSignIn();
      return;
    }
    setText('');
    add({ role: 'user', text: message });
    setBusy(true);
    try {
      const res = await loadoutApi.ask({
        tfClass: cls,
        slots,
        message,
        history: messages
          .slice(-ASSISTANT_LIMITS.history)
          .map((m) => ({ role: m.role, content: m.text.slice(0, ASSISTANT_LIMITS.historyChars) })),
      });
      if ('unavailable' in res) {
        // The model could not be reached: answer from names, and say so.
        const fb = heuristicSuggest(idx.catalog, cls, message, slots);
        add(
          fb.actions.length
            ? {
                role: 'assistant',
                text: t('ai-fallback', {
                  defaultValue:
                    'The assistant is not available right now, so these are items whose names match your words:',
                }),
                actions: fb.actions,
                applied: new Set(),
              }
            : {
                role: 'assistant',
                text: t('ai-none', {
                  defaultValue:
                    'The assistant is not available right now and nothing matched your words. Try a colour, a theme or a weapon name.',
                }),
              },
        );
      } else {
        add({
          role: 'assistant',
          text: res.reply,
          actions: res.actions.length ? res.actions : undefined,
          applied: new Set(),
        });
      }
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 401) onNeedSignIn();
      add({
        role: 'assistant',
        text:
          status === 402
            ? t('ai-limit', { defaultValue: "You have used this month's AI allowance." })
            : status === 429
              ? t('ai-rate', { defaultValue: 'Too many requests. Wait a moment and try again.' })
              : t('ai-error', {
                  defaultValue: 'Something went wrong asking the assistant. Please try again.',
                }),
      });
    } finally {
      setBusy(false);
    }
  };

  const apply = (msgId: number, indices: number[]) => {
    const m = messages.find((x) => x.id === msgId);
    if (!m?.actions) return;
    onApply(indices.map((i) => m.actions![i]));
    setMessages((cur) =>
      cur.map((x) =>
        x.id === msgId ? { ...x, applied: new Set([...(x.applied ?? []), ...indices]) } : x,
      ),
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      sheet={sheet}
      wide
      title={t('ai-title', { defaultValue: 'Loadout assistant' })}
      description={t('ai-intro', {
        defaultValue:
          'Describe a theme, ask for ideas, or say what you need to counter. Suggestions can be equipped with one tap.',
      })}
      footer={
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <TextField
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={ASSISTANT_LIMITS.message}
            placeholder={t('ai-placeholder', { defaultValue: 'Ask for a theme, a counter, an idea…' })}
            aria-label={t('ai-placeholder', { defaultValue: 'Ask for a theme, a counter, an idea…' })}
            enterKeyHint="send"
            className="min-w-0 flex-1"
          />
          <Btn type="submit" variant="primary" icon={Send} disabled={busy || !text.trim()}>
            {t('ai-send', { defaultValue: 'Send' })}
          </Btn>
        </form>
      }
    >
      <div className="flex min-h-48 flex-col gap-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="flex items-center gap-2 text-sm text-(--app-text-muted)">
              <Sparkles className="size-4 shrink-0 text-(--app-accent)" aria-hidden />
              {t('ai-try', { defaultValue: 'Try one of these, or type your own:' })}
            </p>
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <Btn key={c} size="sm" onClick={() => void send(c)}>
                  {c}
                </Btn>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === 'user'
                ? 'ms-auto max-w-[85%] rounded-(--app-radius-sm) bg-(--app-accent)/15 px-3 py-2 text-sm'
                : 'max-w-full rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) px-3 py-2 text-sm'
            }
          >
            <p className="whitespace-pre-wrap break-words">{m.text}</p>
            {m.actions?.length ? (
              <div className="mt-2 flex flex-col gap-2">
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {m.actions.map((a, i) => {
                    const item = idx.item(a.item);
                    if (!item) return null;
                    const paint = a.paint !== undefined ? idx.paint(a.paint) : undefined;
                    const effect = a.effect !== undefined ? idx.effect(a.effect) : undefined;
                    const done = m.applied?.has(i);
                    return (
                      <li key={`${a.slot}-${a.item}`} className="flex min-w-0 flex-col gap-1">
                        <ItemTile item={item} paint={paint} />
                        <span className="truncate text-xs font-semibold" title={item.n}>
                          {item.n}
                        </span>
                        <span className="truncate text-[11px] text-(--app-text-dim)">
                          {[a.slot.replace(/(\d+)$/, ' $1'), paint?.n, effect?.n]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <Btn size="sm" disabled={done} onClick={() => apply(m.id, [i])}>
                          {done
                            ? t('ai-applied', { defaultValue: 'Equipped' })
                            : t('ai-equip', { defaultValue: 'Equip' })}
                        </Btn>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  <Btn
                    size="sm"
                    variant="primary"
                    disabled={m.actions.every((_, i) => m.applied?.has(i))}
                    onClick={() => apply(m.id, m.actions!.map((_, i) => i))}
                  >
                    {t('ai-equip-all', { defaultValue: 'Equip all' })}
                  </Btn>
                  {canUndo ? (
                    <Btn size="sm" variant="ghost" icon={Undo2} onClick={onUndo}>
                      {t('ai-undo', { defaultValue: 'Undo' })}
                    </Btn>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ))}

        {busy ? (
          <p role="status" className="text-sm text-(--app-text-dim)">
            {t('ai-thinking', { defaultValue: 'Thinking…' })}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>
    </Modal>
  );
}
