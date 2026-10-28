/**
 * Browser-side client for `/api/tf2-hud/*`.
 */

import type { HudChange } from './ai-core';
import type {
  HudDetail,
  HudListResponse,
  HudSummary,
  ManifestEntry,
  VersionSummary,
  Visibility,
} from './api-types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof Uint8Array)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(message, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export interface ListParams {
  q?: string;
  sort?: 'new' | 'top' | 'forks';
  tag?: string;
  cursor?: string;
  mine?: boolean;
  limit?: number;
}

/** Gzip with the platform's CompressionStream; null when unavailable or not worth it. */
async function gzipIfSmaller(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (
    bytes.length < 256 ||
    typeof CompressionStream === 'undefined' ||
    looksCompressedFormat(bytes)
  )
    return null;
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream('gzip'));
    const out = new Uint8Array(await new Response(stream).arrayBuffer());
    return out.length < bytes.length * 0.95 ? out : null;
  } catch {
    return null;
  }
}

/** PNG, JPEG, Ogg, MP3 and ZIP are already compressed; gzipping them only costs time. */
function looksCompressedFormat(b: Uint8Array): boolean {
  return (
    (b[0] === 0x89 && b[1] === 0x50) ||
    (b[0] === 0xff && b[1] === 0xd8) ||
    (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67) ||
    (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) ||
    (b[0] === 0x50 && b[1] === 0x4b)
  );
}

export const api = {
  list(p: ListParams = {}): Promise<HudListResponse> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') qs.set(k, String(v));
    return request(`/api/tf2-hud/huds?${qs}`);
  },
  get(idOrSlug: string): Promise<HudDetail> {
    return request(`/api/tf2-hud/huds/${encodeURIComponent(idOrSlug)}`);
  },
  getShared(token: string): Promise<HudDetail> {
    return request(`/api/tf2-hud/share/${encodeURIComponent(token)}`);
  },
  create(body: {
    title: string;
    description: string;
    tags: string[];
    visibility: Visibility;
    manifest: ManifestEntry[];
    baseCommit: string;
    forkOfId?: string;
    message?: string;
  }): Promise<HudDetail> {
    return request('/api/tf2-hud/huds', { method: 'POST', ...json(body) });
  },
  update(
    id: string,
    body: {
      title?: string;
      description?: string;
      tags?: string[];
      visibility?: Visibility;
      manifest?: ManifestEntry[];
      message?: string;
      /** A background save: the server folds it into the previous autosave. */
      autosave?: boolean;
    },
  ): Promise<HudDetail> {
    return request(`/api/tf2-hud/huds/${encodeURIComponent(id)}`, { method: 'PUT', ...json(body) });
  },
  remove(id: string): Promise<void> {
    return request(`/api/tf2-hud/huds/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  fork(id: string): Promise<HudDetail> {
    return request(`/api/tf2-hud/huds/${encodeURIComponent(id)}/fork`, { method: 'POST' });
  },
  like(id: string): Promise<{ liked: boolean; likeCount: number }> {
    return request(`/api/tf2-hud/huds/${encodeURIComponent(id)}/like`, { method: 'POST' });
  },
  versions(id: string): Promise<VersionSummary[]> {
    return request(`/api/tf2-hud/huds/${encodeURIComponent(id)}/versions`);
  },
  restoreVersion(id: string, number: number): Promise<HudDetail> {
    return request(`/api/tf2-hud/huds/${encodeURIComponent(id)}/versions/${number}`, {
      method: 'POST',
    });
  },
  createShare(id: string): Promise<{ token: string }> {
    return request(`/api/tf2-hud/huds/${encodeURIComponent(id)}/share`, { method: 'POST' });
  },
  revokeShare(id: string): Promise<void> {
    return request(`/api/tf2-hud/huds/${encodeURIComponent(id)}/share`, { method: 'DELETE' });
  },
  checkBlobs(hashes: string[]): Promise<{ missing: string[] }> {
    return request('/api/tf2-hud/blobs/check', { method: 'POST', ...json({ hashes }) });
  },
  /** Upload one file, gzipped in the browser when that helps (the server re-hashes the inflated bytes). */
  async uploadBlob(sha1: string, bytes: Uint8Array, compress = true): Promise<void> {
    const packed = compress ? await gzipIfSmaller(bytes) : null;
    await request(`/api/tf2-hud/blobs/${sha1}`, {
      method: 'PUT',
      body: (packed ?? bytes) as BodyInit,
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(packed ? { 'x-upload-encoding': 'gzip' } : {}),
      },
    });
  },
  /** The HUD assistant: which files a request touches, then key-level changes to them. */
  aiSelect(body: {
    message: string;
    paths: string[];
    history: { role: 'user' | 'assistant'; content: string }[];
  }): Promise<{ files: string[] } | { unavailable: true; reason: string }> {
    return request('/api/tf2-hud/ai', {
      method: 'POST',
      ...json({ stage: 'select', ...body }),
    });
  },
  aiEdit(body: {
    message: string;
    files: { path: string; text: string }[];
    history: { role: 'user' | 'assistant'; content: string }[];
    /** What the player has selected, so "this" in the request means something. */
    context?: string;
  }): Promise<
    | { summary: string; changes: HudChange[]; malformed: number }
    | { unavailable: true; reason: string }
  > {
    return request('/api/tf2-hud/ai', { method: 'POST', ...json({ stage: 'edit', ...body }) });
  },
  async fetchFile(
    source: { hud: string } | { token: string },
    path: string,
    version?: number,
  ): Promise<Uint8Array> {
    const qs = new URLSearchParams({ path });
    if (version !== undefined) qs.set('v', String(version));
    const url =
      'hud' in source
        ? `/api/tf2-hud/huds/${encodeURIComponent(source.hud)}/file?${qs}`
        : `/api/tf2-hud/share/${encodeURIComponent(source.token)}/file?${qs}`;
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new ApiError(`Could not load ${path}`, res.status);
    return new Uint8Array(await res.arrayBuffer());
  },
};

export type { HudDetail, HudSummary };
