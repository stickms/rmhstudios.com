/**
 * Keyboard and gamepad navigation for the HUD's menus. Menu items are real
 * buttons (`[data-menu-item]`), so Tab, Enter and Space work as they always
 * do; this adds the arrow keys and the gamepad's d-pad / A / B, which arrive
 * as `menu_*` impulses from the input layer through the HUD store.
 */
'use client';

import { useEffect, type RefObject } from 'react';
import type { ImpulseAction } from '@/lib/tf2-game/client/input/actions';
import { useHudContext } from './use-hud';

const items = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>('[data-menu-item]')].filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );

/** Moves focus by `step` among the menu's items, wrapping. */
export function moveFocus(root: HTMLElement, step: number): void {
  const list = items(root);
  if (!list.length) return;
  const i = list.indexOf(document.activeElement as HTMLElement);
  const next = i < 0 ? (step > 0 ? 0 : list.length - 1) : (i + step + list.length) % list.length;
  list[next]?.focus();
}

/**
 * While `active`, focuses the first item (or `initial`) and maps the menu
 * impulses and arrow keys onto focus moves; `menu_back` / Escape call `onBack`.
 */
export function useMenuNav(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onBack: () => void,
  opts: { grid?: boolean; focusFirst?: boolean } = {},
): void {
  const { store } = useHudContext();
  const { grid = false, focusFirst = true } = opts;
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    if (focusFirst) {
      const current = root.querySelector<HTMLElement>('[data-menu-item][data-current="true"]');
      (current ?? items(root)[0])?.focus({ preventScroll: true });
    }
    const handle = (action: ImpulseAction | string): boolean => {
      switch (action) {
        case 'menu_down':
        case 'ArrowDown':
          moveFocus(root, 1);
          return true;
        case 'menu_up':
        case 'ArrowUp':
          moveFocus(root, -1);
          return true;
        case 'menu_right':
        case 'ArrowRight':
          if (!grid) return false;
          moveFocus(root, 1);
          return true;
        case 'menu_left':
        case 'ArrowLeft':
          if (!grid) return false;
          moveFocus(root, -1);
          return true;
        case 'menu_accept': {
          const el = document.activeElement as HTMLElement | null;
          if (el && root.contains(el)) el.click();
          return true;
        }
        case 'menu_back':
          onBack();
          return true;
        default:
          return false;
      }
    };
    const offImpulse = store.onImpulse((a) => {
      handle(a);
    });
    const onKey = (e: KeyboardEvent) => {
      if (!root.contains(document.activeElement)) return;
      if (handle(e.key)) e.preventDefault();
    };
    root.addEventListener('keydown', onKey);
    return () => {
      offImpulse();
      root.removeEventListener('keydown', onKey);
    };
  }, [ref, active, onBack, store, grid, focusFirst]);
}
