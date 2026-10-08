'use client';

import {
  DESKTOP,
  DOCUMENTS,
  DOWNLOADS,
  DRIVE,
  HOME,
  MUSIC,
  PICTURES,
  RECYCLE,
  ROOT,
  VIDEOS,
  children,
  extOf,
  type VNode,
  type Vfs,
} from '@/lib/dunesday/vfs';
import { APPS } from './apps';
import type { IconName } from './icons';
import type { AppId } from './store';

export function iconFor(node: VNode, vfs?: Vfs): IconName {
  switch (node.id) {
    case ROOT:
      return 'computer';
    case DRIVE:
      return 'drive';
    case DOCUMENTS:
      return 'folder-docs';
    case PICTURES:
      return 'folder-pics';
    case MUSIC:
      return 'folder-music';
    case VIDEOS:
      return 'folder-videos';
    case DOWNLOADS:
      return 'folder-downloads';
    case HOME:
      return 'folder-user';
    case DESKTOP:
      return 'folder';
    case RECYCLE:
      return vfs && children(vfs, RECYCLE).length ? 'recycle-full' : 'recycle-empty';
  }
  if (node.kind === 'folder') return 'folder';
  if (node.kind === 'shortcut') {
    if (node.target?.startsWith('app:')) return APPS[node.target.slice(4) as AppId]?.icon ?? 'file';
    return 'ie';
  }
  const ext = extOf(node.name);
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return 'image';
  if (['txt', 'log', 'ini', 'md'].includes(ext)) return 'txt';
  return 'file';
}

export function typeLabel(
  node: VNode,
  t: (k: string, o: { defaultValue: string }) => string,
): string {
  if (node.kind === 'folder') return t('type-folder', { defaultValue: 'File folder' });
  if (node.kind === 'shortcut') return t('type-shortcut', { defaultValue: 'Shortcut' });
  const ext = extOf(node.name);
  if (ext === 'txt') return t('type-txt', { defaultValue: 'Text Document' });
  if (ext === 'png') return t('type-png', { defaultValue: 'PNG image' });
  if (ext === 'svg') return t('type-svg', { defaultValue: 'SVG image' });
  return ext
    ? `${ext.toUpperCase()} ${t('type-file', { defaultValue: 'File' })}`
    : t('type-file', { defaultValue: 'File' });
}

export function sizeLabel(node: VNode): string {
  if (node.kind !== 'file') return '';
  const bytes = node.content ? new Blob([node.content]).size : 0;
  return `${Math.max(1, Math.ceil(bytes / 1024)).toLocaleString()} KB`;
}
