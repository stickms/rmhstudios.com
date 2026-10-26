/**
 * Browser-side client for `/api/tf2-hud/*`.
 */

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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
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

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export interface ListParams {
  q?: string;
  sort?: 'new' | 'top' | 'forks';
  tag?: string;
  cursor?: string;
  mine?: boolean;
  limit?: number;
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
  async uploadBlob(sha1: string, bytes: Uint8Array): Promise<void> {
    await request(`/api/tf2-hud/blobs/${sha1}`, {
      method: 'PUT',
      body: bytes as BodyInit,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
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
