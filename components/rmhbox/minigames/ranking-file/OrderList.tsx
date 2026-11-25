/**
 * OrderList — the five items of a Ranking File round, in the player's order.
 *
 * Reordering works three ways, none of which needs a pointer:
 *   - the move up / move down buttons on every row;
 *   - Alt+ArrowUp / Alt+ArrowDown with focus on a row's name (bound on this
 *     list only, so it never reaches the rest of the page);
 *   - dragging a row, for those who like to.
 * Every move is announced politely ("Jupiter, now 2 of 5") and keeps focus on
 * the item that moved.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface OrderListProps {
  /** The labels in the player's current order, first place first. */
  labels: readonly string[];
  onChange: (next: string[]) => void;
  /** After locking in, or for a spectator: the list is shown and cannot change. */
  disabled: boolean;
}

export default function OrderList({ labels, onChange, disabled }: OrderListProps) {
  const { t } = useTranslation('ranking-file');
  const [announcement, setAnnouncement] = useState('');
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const nameRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ label: string; target: 'name' | 'up' | 'down' } | null>(null);
  const moveRefs = useRef(new Map<string, HTMLButtonElement>());

  // After a move the row has a new place in the list: put focus back on the
  // control that had it, in the same commit, without a timer or a frame wait.
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const wanted =
      pending.target === 'name'
        ? nameRefs.current.get(pending.label)
        : moveRefs.current.get(`${pending.target}:${pending.label}`);
    // A move button is disabled once the item reaches an end: focus its name instead
    (wanted && !wanted.disabled ? wanted : nameRefs.current.get(pending.label))?.focus();
  }, [labels]);

  const moveTo = (from: number, to: number, focus: 'name' | 'up' | 'down') => {
    if (disabled || to < 0 || to >= labels.length || from === to) return;
    const next = [...labels];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    pendingFocus.current = { label: item, target: focus };
    setAnnouncement(
      t('moved-announce', {
        defaultValue: '{{label}}, now {{position}} of {{total}}',
        label: item,
        position: to + 1,
        total: labels.length,
      }),
    );
    onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveTo(index, index - 1, 'name');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveTo(index, index + 1, 'name');
    }
  };

  const buttonClass =
    'flex size-9 shrink-0 items-center justify-center rounded-app-sm border border-app-border bg-app-surface text-app-text transition-colors hover:bg-app-surface-hover disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:size-11';

  return (
    <div className="flex w-full flex-col gap-2">
      <ol
        aria-label={t('order-list-label', { defaultValue: 'Your order, first place at the top' })}
        className="flex w-full flex-col border-t border-app-border"
      >
        {labels.map((label, index) => (
          <li
            key={label}
            draggable={!disabled}
            onDragStart={() => setDragLabel(label)}
            onDragEnd={() => setDragLabel(null)}
            onDragOver={(event) => {
              if (!disabled && dragLabel) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const from = dragLabel ? labels.indexOf(dragLabel) : -1;
              setDragLabel(null);
              if (from >= 0) moveTo(from, index, 'name');
            }}
            className={`flex items-center gap-3 border-b border-app-border py-2 ${dragLabel === label ? 'opacity-60' : ''}`}
          >
            <span
              className="w-6 shrink-0 text-center font-mono text-sm text-app-text-muted tabular-nums"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            {/* The name is the focus target for Alt+Arrow; the key handler is on this row only. */}
            <button
              type="button"
              ref={(el) => {
                if (el) nameRefs.current.set(label, el);
                else nameRefs.current.delete(label);
              }}
              disabled={disabled}
              onKeyDown={(event) => onKeyDown(event, index)}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              aria-label={t('item-position', {
                defaultValue: '{{label}}, {{position}} of {{total}}',
                label,
                position: index + 1,
                total: labels.length,
              })}
              className="min-h-9 flex-1 rounded-app-sm px-2 text-start text-base font-medium text-app-text disabled:cursor-default"
            >
              {label}
            </button>
            <button
              type="button"
              ref={(el) => {
                if (el) moveRefs.current.set(`up:${label}`, el);
                else moveRefs.current.delete(`up:${label}`);
              }}
              disabled={disabled || index === 0}
              onClick={() => moveTo(index, index - 1, 'up')}
              aria-label={t('move-up', { defaultValue: 'Move {{label}} up', label })}
              className={buttonClass}
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              ref={(el) => {
                if (el) moveRefs.current.set(`down:${label}`, el);
                else moveRefs.current.delete(`down:${label}`);
              }}
              disabled={disabled || index === labels.length - 1}
              onClick={() => moveTo(index, index + 1, 'down')}
              aria-label={t('move-down', { defaultValue: 'Move {{label}} down', label })}
              className={buttonClass}
            >
              <ArrowDown className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      {!disabled && (
        <p className="text-xs text-app-text-muted">
          {t('keyboard-hint', {
            defaultValue: 'Focus an item and press Alt with the up or down arrow to move it, or use the buttons.',
          })}
        </p>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
