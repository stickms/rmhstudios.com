'use client';

/**
 * Verbs every part of the desktop shares: launch an app, open a file the way
 * Explorer would, show a message box.
 */

import { useEffect, useState } from 'react';
import { extOf, type VNode } from '@/lib/dunesday/vfs';
import { APPS } from './apps';
import { useOs, type AppId, type Win } from './store';

export const TASKBAR_H = 40;

/** The desktop area (viewport minus taskbar), for sizing new windows. */
function desktopSize() {
  if (typeof window === 'undefined') return { w: 1280, h: 760 };
  return { w: window.innerWidth, h: window.innerHeight - TASKBAR_H };
}

export function openApp(app: AppId, opts: { params?: Win['params']; title?: string } = {}): string {
  const def = APPS[app];
  const { w: dw, h: dh } = desktopSize();
  const w = Math.min(def.size.w, dw - 16);
  const h = Math.min(def.size.h, dh - 16);
  const s = useOs.getState();
  const offset = (s.windows.length % 6) * 26;
  return s.open(app, {
    ...opts,
    reuse: def.singleton !== false,
    rect: {
      w,
      h,
      x: Math.max(8, Math.round((dw - w) / 2) + offset - 60),
      y: Math.max(8, Math.round((dh - h) / 2) + offset - 40),
    },
  });
}

export function showMessage(input: {
  title?: string;
  text: string;
  icon?: 'info' | 'warning' | 'error' | 'question';
}): void {
  openApp('dialog', {
    params: { text: input.text, icon: input.icon ?? 'info', key: String(Date.now()) },
    title: input.title,
  });
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']);

export function isImage(node: VNode): boolean {
  return node.kind === 'file' && IMAGE_EXT.has(extOf(node.name));
}

export function isText(node: VNode): boolean {
  return node.kind === 'file' && ['txt', 'log', 'ini', 'md', ''].includes(extOf(node.name));
}

/** Double-click semantics for a file-system node. */
export function openNode(node: VNode, cannotOpen: (name: string) => string): void {
  if (node.kind === 'folder') {
    openApp('explorer', { params: { path: node.id } });
    return;
  }
  if (node.kind === 'shortcut' && node.target) {
    if (node.target.startsWith('app:')) {
      const app = node.target.slice(4) as AppId;
      if (APPS[app]) openApp(app);
      return;
    }
    if (/^https?:\/\//i.test(node.target)) {
      openApp('ie', { params: { url: node.target }, title: undefined });
      return;
    }
  }
  if (isImage(node)) {
    openApp('photos', { params: { file: node.id } });
    return;
  }
  if (isText(node)) {
    openApp('notepad', { params: { file: node.id } });
    return;
  }
  showMessage({ icon: 'warning', text: cannotOpen(node.name) });
}

/** Phone-sized layout: every window fills the screen, one at a time. */
export function useCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 759px), (max-height: 499px)');
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}
