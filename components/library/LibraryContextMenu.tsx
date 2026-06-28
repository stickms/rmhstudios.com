'use client';

/**
 * LibraryContextMenu — a small, dependency-free right-click menu used by the
 * library to manage books and collections. It replaces the old always-visible
 * "Edit" / "Manage" toolbars: owners/admins right-click an item and get the same
 * actions in a stylized popup. Closes on selection, Escape, outside click,
 * scroll, or resize, and clamps itself inside the viewport.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type MenuPos = { x: number; y: number };

export type MenuItem =
  | {
      type?: 'item';
      icon?: ReactNode;
      label: string;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
      active?: boolean;
    }
  | { type: 'separator' }
  | { type: 'label'; label: string };

/** Open-state + position helper for a single trigger. */
export function useContextMenu() {
  const [pos, setPos] = useState<MenuPos | null>(null);
  return {
    pos,
    openAt: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setPos({ x: e.clientX, y: e.clientY });
    },
    close: () => setPos(null),
  };
}

export function LibraryContextMenu({
  pos,
  onClose,
  items,
  label,
}: {
  pos: MenuPos | null;
  onClose: () => void;
  items: MenuItem[];
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<MenuPos>(pos ?? { x: 0, y: 0 });

  useEffect(() => {
    if (pos) setCoords(pos);
  }, [pos]);

  // Keep the menu fully on-screen.
  useLayoutEffect(() => {
    if (!pos || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(pos.x, window.innerWidth - r.width - 8));
    const y = Math.max(8, Math.min(pos.y, window.innerHeight - r.height - 8));
    if (x !== coords.x || y !== coords.y) setCoords({ x, y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [pos, onClose]);

  if (!pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      className="lib-ctx"
      role="menu"
      aria-label={label}
      style={{ left: coords.x, top: coords.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') return <div key={i} className="lib-ctx__sep" role="separator" />;
        if (item.type === 'label') return <div key={i} className="lib-ctx__label">{item.label}</div>;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`lib-ctx__item${item.danger ? ' is-danger' : ''}${item.active ? ' is-active' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.icon && <span className="lib-ctx__icon" aria-hidden="true">{item.icon}</span>}
            <span className="lib-ctx__text">{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
