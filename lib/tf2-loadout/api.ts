/**
 * Browser-side client for `/api/tf2-loadout/*`.
 */

import { json, request } from '@/lib/tf2-hud/api';
import type { LoadoutDetail, LoadoutListResponse, Visibility } from './api-types';
import type { AiAction } from './ai-core';
import type { Catalog, LoadoutSlots, TfClass } from './catalog-types';

export type AssistantResponse =
  | { reply: string; actions: AiAction[]; dropped: number }
  | { unavailable: true; reason: string };

export interface ListParams {
  q?: string;
  sort?: 'new' | 'top';
  tfClass?: TfClass;
  cursor?: string;
  mine?: boolean;
  limit?: number;
}

export interface LoadoutBody {
  title: string;
  description: string;
  tfClass: TfClass;
  slots: LoadoutSlots;
  visibility: Visibility;
}

const enc = encodeURIComponent;

export const loadoutApi = {
  catalog(): Promise<Catalog> {
    return request('/api/tf2-loadout/catalog');
  },
  list(p: ListParams = {}): Promise<LoadoutListResponse> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') qs.set(k, String(v));
    return request(`/api/tf2-loadout/loadouts?${qs}`);
  },
  get(idOrSlug: string): Promise<LoadoutDetail> {
    return request(`/api/tf2-loadout/loadouts/${enc(idOrSlug)}`);
  },
  create(body: LoadoutBody): Promise<LoadoutDetail> {
    return request('/api/tf2-loadout/loadouts', { method: 'POST', ...json(body) });
  },
  update(id: string, body: Partial<LoadoutBody>): Promise<LoadoutDetail> {
    return request(`/api/tf2-loadout/loadouts/${enc(id)}`, { method: 'PUT', ...json(body) });
  },
  remove(id: string): Promise<void> {
    return request(`/api/tf2-loadout/loadouts/${enc(id)}`, { method: 'DELETE' });
  },
  fork(id: string): Promise<LoadoutDetail> {
    return request(`/api/tf2-loadout/loadouts/${enc(id)}/fork`, { method: 'POST' });
  },
  ask(body: {
    tfClass: TfClass;
    slots: LoadoutSlots;
    message: string;
    history: { role: 'user' | 'assistant'; content: string }[];
  }): Promise<AssistantResponse> {
    return request('/api/tf2-loadout/ai', { method: 'POST', ...json(body) });
  },
  like(id: string): Promise<{ liked: boolean; likeCount: number }> {
    return request(`/api/tf2-loadout/loadouts/${enc(id)}/like`, { method: 'POST' });
  },
};
