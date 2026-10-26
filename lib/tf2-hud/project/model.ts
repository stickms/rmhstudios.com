/**
 * Pure operations on a project overlay. Everything returns a new `Map`; callers
 * (the Zustand store) own identity and history.
 */

import { decodeUtf8, encodeUtf8, sha1Hex, sha1OfText } from '../util/sha1';
import type { BaseIndex, FileContent, FileStatus, Overlay } from './types';

export const textContent = (text: string): FileContent => ({
  kind: 'text',
  text,
  sha1: sha1OfText(text),
});

export const binaryContent = (bytes: Uint8Array): FileContent => ({
  kind: 'binary',
  bytes,
  sha1: sha1Hex(bytes),
});

export function contentBytes(c: FileContent): Uint8Array {
  return c.kind === 'binary' ? c.bytes : encodeUtf8(c.text);
}

/** Decode raw bytes as a text file, preserving a BOM and CRLF exactly. */
export const textFromBytes = (bytes: Uint8Array): FileContent => {
  const text = decodeUtf8(bytes);
  return { kind: 'text', text, sha1: sha1Hex(bytes) };
};

export function statusOf(overlay: Overlay, base: BaseIndex | undefined, path: string): FileStatus {
  if (!overlay.has(path)) return 'unchanged';
  const entry = overlay.get(path);
  const inBase = base?.files.has(path) ?? false;
  if (entry === null) return 'deleted';
  if (!inBase) return 'added';
  return 'modified';
}

/** Write a file; an edit that restores the base bytes drops the overlay entry. */
export function writeFile(
  overlay: Overlay,
  base: BaseIndex | undefined,
  path: string,
  content: FileContent,
): Overlay {
  const next = new Map(overlay);
  if (base?.files.get(path)?.sha1 === content.sha1) next.delete(path);
  else next.set(path, content);
  return next;
}

export function deleteFile(overlay: Overlay, base: BaseIndex | undefined, path: string): Overlay {
  const next = new Map(overlay);
  if (base?.files.has(path)) next.set(path, null);
  else next.delete(path);
  return next;
}

/** Undo all changes to one file (restoring it from the base, or removing it). */
export function revertFile(overlay: Overlay, path: string): Overlay {
  if (!overlay.has(path)) return overlay;
  const next = new Map(overlay);
  next.delete(path);
  return next;
}

/** Union of the base listing and the overlay, minus deletions, sorted. */
export function listPaths(overlay: Overlay, base: BaseIndex | undefined): string[] {
  const out = new Set<string>(base ? base.files.keys() : []);
  for (const [p, c] of overlay) {
    if (c === null) out.delete(p);
    else out.add(p);
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

export interface ChangedFile {
  path: string;
  status: Exclude<FileStatus, 'unchanged'>;
}

export function changedFiles(overlay: Overlay, base: BaseIndex | undefined): ChangedFile[] {
  const out: ChangedFile[] = [];
  for (const path of overlay.keys()) {
    const status = statusOf(overlay, base, path);
    if (status !== 'unchanged') out.push({ path, status });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Rename/move one file or, with a trailing `/`, a whole folder. */
export function renamePath(
  overlay: Overlay,
  base: BaseIndex | undefined,
  from: string,
  to: string,
  read: (path: string) => FileContent | undefined,
  paths: readonly string[],
): Overlay {
  const isDir = from.endsWith('/');
  const moves = isDir
    ? paths.filter((p) => p.startsWith(from)).map((p) => [p, to + p.slice(from.length)] as const)
    : paths.includes(from)
      ? ([[from, to]] as const)
      : [];
  let next = overlay;
  for (const [src, dst] of moves) {
    const content = read(src);
    if (!content || src === dst) continue;
    next = deleteFile(next, base, src);
    next = writeFile(next, base, dst, content);
  }
  return next;
}
