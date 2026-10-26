/**
 * Saving to and loading from an account: turns the overlay into a manifest +
 * content-addressed blobs (uploading only what the server lacks), and back.
 */

import { api } from './api';
import { HUD_LIMITS, type HudDetail, type ManifestEntry } from './api-types';
import { binaryContent, contentBytes, textFromBytes } from './project/model';
import { isTextPath } from './project/paths';
import type { FileContent, HudMeta, Overlay } from './project/types';

export interface Progress {
  phase: 'checking' | 'uploading' | 'saving' | 'downloading';
  done: number;
  total: number;
}

export function buildManifest(overlay: Overlay): ManifestEntry[] {
  const out: ManifestEntry[] = [];
  for (const [path, c] of overlay) {
    if (c === null) out.push({ path, deleted: true });
    else out.push({ path, sha1: c.sha1, size: contentBytes(c).length });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/** Upload every blob the server does not already have for this user. */
export async function uploadMissingBlobs(
  overlay: Overlay,
  onProgress?: (p: Progress) => void,
): Promise<void> {
  const bySha = new Map<string, FileContent>();
  for (const c of overlay.values()) if (c) bySha.set(c.sha1, c);
  const hashes = [...bySha.keys()];
  if (hashes.length === 0) return;
  onProgress?.({ phase: 'checking', done: 0, total: hashes.length });
  const missing: string[] = [];
  for (let i = 0; i < hashes.length; i += 500) {
    const res = await api.checkBlobs(hashes.slice(i, i + 500));
    missing.push(...res.missing);
  }
  let done = 0;
  await pool(missing, 4, async (sha) => {
    await api.uploadBlob(sha, contentBytes(bySha.get(sha)!));
    onProgress?.({ phase: 'uploading', done: ++done, total: missing.length });
  });
}

export function validateForCloud(overlay: Overlay): string | null {
  let total = 0;
  let count = 0;
  for (const c of overlay.values()) {
    if (!c) continue;
    const size = contentBytes(c).length;
    if (size > HUD_LIMITS.maxBlobBytes) return 'A file is larger than 25 MB.';
    total += size;
    count++;
  }
  if (count > HUD_LIMITS.maxFiles) return `A HUD can have at most ${HUD_LIMITS.maxFiles} files.`;
  if (total > HUD_LIMITS.maxTotalBytes) return 'This HUD is larger than 150 MB.';
  return null;
}

export async function saveNew(
  meta: HudMeta,
  overlay: Overlay,
  baseCommit: string,
  opts: { visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC'; forkOfId?: string; message?: string },
  onProgress?: (p: Progress) => void,
): Promise<HudDetail> {
  await uploadMissingBlobs(overlay, onProgress);
  onProgress?.({ phase: 'saving', done: 0, total: 1 });
  return api.create({
    title: meta.name,
    description: meta.description,
    tags: meta.tags,
    visibility: opts.visibility,
    manifest: buildManifest(overlay),
    baseCommit,
    forkOfId: opts.forkOfId,
    message: opts.message,
  });
}

export async function saveExisting(
  id: string,
  meta: HudMeta,
  overlay: Overlay,
  message?: string,
  onProgress?: (p: Progress) => void,
  autosave = false,
): Promise<HudDetail> {
  await uploadMissingBlobs(overlay, onProgress);
  onProgress?.({ phase: 'saving', done: 0, total: 1 });
  return api.update(id, {
    title: meta.name,
    description: meta.description,
    tags: meta.tags,
    manifest: buildManifest(overlay),
    message,
    autosave,
  });
}

/** Download a saved HUD's files into an overlay. */
export async function loadOverlay(
  detail: HudDetail,
  source: { hud: string } | { token: string },
  onProgress?: (p: Progress) => void,
): Promise<{ overlay: Overlay; meta: HudMeta }> {
  const overlay = new Map<string, FileContent | null>();
  const entries = detail.manifest;
  let done = 0;
  await pool(entries, 6, async (e) => {
    if (e.deleted) {
      overlay.set(e.path, null);
    } else {
      const bytes = await api.fetchFile(source, e.path, detail.latestVersion);
      overlay.set(e.path, isTextPath(e.path) ? textFromBytes(bytes) : binaryContent(bytes));
    }
    onProgress?.({ phase: 'downloading', done: ++done, total: entries.length });
  });
  return {
    overlay,
    meta: {
      name: detail.title,
      description: detail.description,
      author: detail.author?.name ?? '',
      tags: detail.tags,
    },
  };
}
