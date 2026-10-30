/**
 * Keeps a running game from being closed by accident. TF2's default crouch is
 * Ctrl, so crouching while pressing W to move is exactly the browser's
 * close-tab shortcut.
 *
 * - In fullscreen, Chromium browsers let a page claim browser shortcuts with
 *   the Keyboard Lock API; we lock the keyboard and cancel the tab/window
 *   shortcuts, so Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Q and Ctrl+R reach the game as
 *   ordinary keys. (Holding Esc still leaves fullscreen, by browser design.)
 * - Everywhere else no page can cancel those shortcuts, so while a match runs
 *   the browser asks "Leave site?" before closing or reloading the tab.
 */
'use client';

import { useEffect } from 'react';

interface KeyboardLock {
  lock?: (codes?: string[]) => Promise<void>;
  unlock?: () => void;
}

/** Tab/window shortcuts a game key combination can trigger by accident. */
const GUARDED_KEYS = new Set(['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'KeyR']);

export function useCloseGuard(active: boolean): void {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older Chromium needs returnValue set to show the prompt.
      e.returnValue = '';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && GUARDED_KEYS.has(e.code)) e.preventDefault();
    };

    const syncLock = () => {
      if (!keyboard?.lock) return;
      if (document.fullscreenElement) keyboard.lock().catch(() => {});
      else keyboard.unlock?.();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    document.addEventListener('fullscreenchange', syncLock);
    syncLock();
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      document.removeEventListener('fullscreenchange', syncLock);
      keyboard?.unlock?.();
    };
  }, [active]);
}
