'use client';

/**
 * A Windows 7 popup menu — right-click menus, the power and Ease of Access
 * menus on the logon screen, the Start menu's shut-down options.
 *
 * Real menu semantics: `role="menu"`, `menuitem` / `menuitemcheckbox`,
 * arrow keys and Home/End move, Enter/Space choose, Escape and an outside click
 * close and return focus to whatever opened it. It positions itself at the
 * given point and flips to stay inside the viewport.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export type MenuItem =
  | { separator: true }
  | {
      separator?: false;
      label: string;
      icon?: ReactNode;
      onSelect: () => void;
      disabled?: boolean;
      checked?: boolean;
      bold?: boolean;
      hint?: string;
    };

export function PopupMenu({
  at,
  items,
  onClose,
  label,
  placement = 'below',
}: {
  at: { x: number; y: number };
  items: MenuItem[];
  onClose: () => void;
  label: string;
  /** "above" opens upward from the point (taskbar / logon buttons). */
  placement?: 'below' | 'above';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const returnFocus = useRef<Element | null>(null);

  useLayoutEffect(() => {
    returnFocus.current = document.activeElement;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = at.x;
    let top = placement === 'above' ? at.y - r.height : at.y;
    if (left + r.width > window.innerWidth - 4) left = Math.max(4, window.innerWidth - r.width - 4);
    if (top + r.height > window.innerHeight - 4) top = Math.max(4, at.y - r.height);
    if (top < 4) top = 4;
    setPos({ left, top });
  }, [at.x, at.y, placement]);

  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')
      ?.focus();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onBlur = () => onClose();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', onBlur);
      (returnFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  const onKey = (e: React.KeyboardEvent) => {
    const all = [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        '[role^="menuitem"]:not([aria-disabled="true"])',
      ) ?? []),
    ];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      all[e.key === 'Home' ? 0 : all.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="ds ds-menu7"
      style={{
        left: pos?.left ?? at.x,
        top: pos?.top ?? at.y,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} role="separator" className="ds-menu7-sep" />
        ) : (
          <button
            key={item.label}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            aria-disabled={item.disabled || undefined}
            tabIndex={-1}
            className={cn('ds-menu7-item', item.bold && 'ds-menu7-item--bold')}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onSelect();
            }}
          >
            <span className="ds-menu7-icon" aria-hidden="true">
              {item.checked ? '✓' : item.icon}
            </span>
            <span className="ds-menu7-label">{item.label}</span>
            {item.hint && <span className="ds-menu7-hint">{item.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
