'use client';

/**
 * Pop-out windows (plan U10) — Document Picture-in-Picture, the floating
 * always-on-top window Chrome/Edge give a page (YouTube's mini-player, Meet's
 * floating tile). Unlike classic video PiP it holds arbitrary DOM, so a pop-out
 * can carry controls, a queue or chat, not just pixels.
 *
 * The window is filled with a React portal from the SAME tree, so stores,
 * sockets and the query cache are shared — there is no second app instance and
 * nothing to sync. Styles are carried over by linking the page's own (already
 * cached) stylesheets, plus the theme classes of the root the content came
 * from, so tokens resolve exactly as they do in the page.
 *
 * Feature-detected: browsers without the API keep their existing behaviour
 * (classic video PiP, or the in-page dock). Nothing here loads or runs until
 * `open()` is called.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

function api(): DocumentPictureInPicture | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture })
      .documentPictureInPicture ?? null
  );
}

export function supportsPopOut(): boolean {
  return api() !== null;
}

/** Link (or, for inline sheets, copy) every stylesheet the page has. */
function copyStyles(target: Document): void {
  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode as HTMLLinkElement | HTMLStyleElement | null;
    if (owner instanceof HTMLLinkElement && owner.href) {
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = owner.href;
      if (owner.media) link.media = owner.media;
      target.head.appendChild(link);
      continue;
    }
    try {
      const style = target.createElement('style');
      style.textContent = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n');
      target.head.appendChild(style);
    } catch {
      // Cross-origin sheet without CORS — nothing we may read; skip it.
    }
  }
}

/** Mirror `<html>`'s theme classes/attributes so `--site-*` tokens resolve. */
function copyRootTheme(target: Document): void {
  const src = document.documentElement;
  target.documentElement.className = src.className;
  for (const name of ['lang', 'dir', 'data-theme', 'style']) {
    const v = src.getAttribute(name);
    if (v !== null) target.documentElement.setAttribute(name, v);
  }
  target.body.className = document.body.className;
  target.body.style.margin = '0';
}

export interface PopOutHandle {
  /** The pop-out's window while it is open. */
  win: Window | null;
  supported: boolean;
  /** Must be called from a user gesture (the API requires one). */
  open: (size?: { width: number; height: number }) => Promise<boolean>;
  close: () => void;
}

export function usePopOut(): PopOutHandle {
  const [win, setWin] = useState<Window | null>(null);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(supportsPopOut()), []);

  const open = useCallback(async (size = { width: 420, height: 300 }) => {
    const pip = api();
    if (!pip) return false;
    try {
      const next = await pip.requestWindow(size);
      copyStyles(next.document);
      copyRootTheme(next.document);
      next.addEventListener('pagehide', () => setWin(null), { once: true });
      setWin(next);
      return true;
    } catch {
      return false; // no gesture, or the user/policy refused
    }
  }, []);

  const close = useCallback(() => {
    setWin((w) => {
      w?.close();
      return null;
    });
  }, []);

  // Closing the page closes its pop-out.
  useEffect(() => () => win?.close(), [win]);

  return { win, supported, open, close };
}

/**
 * Render `children` into the pop-out. `themeClassName` is applied to the
 * wrapper — pass the class list of the app root the content came from (e.g.
 * an `.app-theme` shell) so app-tier tokens resolve too.
 */
export function PopOutPortal({
  win,
  themeClassName,
  children,
}: {
  win: Window;
  themeClassName?: string;
  children: ReactNode;
}) {
  return createPortal(
    <div className={themeClassName} style={{ minHeight: '100vh' }}>
      {children}
    </div>,
    win.document.body,
  );
}
