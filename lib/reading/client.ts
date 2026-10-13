/**
 * Browser-side data access for the reading package. One fetch per document
 * (`/api/reading/doc`), cached by React Query so the article body (glossary
 * links) and the lazy enhancer (highlights) share it.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { PassageRef } from './passages';
import type {
  DocBundle,
  GoalProgress,
  HighlightView,
  ReadingDocKind,
  ShelfEntryView,
  ShelfId,
  ShelfPrefs,
} from './schema';

export const docQueryKey = (kind: ReadingDocKind, key: string) =>
  ['reading-doc', kind, key] as const;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!res.ok) throw new ApiError(data.error ?? 'Request failed', res.status);
  return data as T;
}

export function useDocBundle(kind: ReadingDocKind, key: string, enabled: boolean) {
  return useQuery({
    queryKey: docQueryKey(kind, key),
    queryFn: () =>
      apiJson<DocBundle>(`/api/reading/doc?kind=${kind}&key=${encodeURIComponent(key)}`),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export interface NewHighlightInput {
  unit: string;
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  version: string;
  note?: string;
  isPublic: boolean;
  passages: PassageRef[];
}

/** Create / patch / delete highlights, keeping the shared doc bundle in step. */
export function useHighlightActions(kind: ReadingDocKind, key: string) {
  const qc = useQueryClient();
  const qk = docQueryKey(kind, key);
  const patchMine = useCallback(
    (fn: (mine: HighlightView[]) => HighlightView[]) =>
      qc.setQueryData<DocBundle>(qk, (b) => (b ? { ...b, mine: fn(b.mine) } : b)),
    [qc, qk],
  );

  const create = useCallback(
    async (input: NewHighlightInput) => {
      const { highlight } = await apiJson<{ highlight: HighlightView }>('/api/reading/highlights', {
        method: 'POST',
        body: JSON.stringify({ kind, key, ...input }),
      });
      patchMine((m) => [...m, highlight]);
      return highlight;
    },
    [kind, key, patchMine],
  );

  const update = useCallback(
    async (
      id: string,
      patch: { note?: string | null; isPublic?: boolean; passages?: PassageRef[] },
    ) => {
      const { highlight } = await apiJson<{ highlight: HighlightView }>(
        `/api/reading/highlights/${id}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
      );
      patchMine((m) => m.map((h) => (h.id === id ? highlight : h)));
      return highlight;
    },
    [patchMine],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiJson(`/api/reading/highlights/${id}`, { method: 'DELETE' });
      patchMine((m) => m.filter((h) => h.id !== id));
    },
    [patchMine],
  );

  return { create, update, remove };
}

/* ── L7 shelves / L3 challenge ─────────────────────────────────────────────── */

export const SHELVES_KEY = ['reading-shelves'] as const;
export const goalKey = (year: number) => ['reading-goal', year] as const;

export interface MyShelves {
  entries: ShelfEntryView[];
  prefs: ShelfPrefs;
}

export function useMyShelves(enabled = true) {
  return useQuery({
    queryKey: SHELVES_KEY,
    queryFn: () => apiJson<MyShelves>('/api/reading/shelves'),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useShelfMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: SHELVES_KEY });
    void qc.invalidateQueries({ queryKey: ['reading-goal'] });
  };
  const set = useMutation({
    mutationFn: (v: { slug: string; title: string; shelf: ShelfId; pages: number }) =>
      apiJson<{ entry: ShelfEntryView }>('/api/reading/shelves', {
        method: 'PUT',
        body: JSON.stringify(v),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (slug: string) =>
      apiJson('/api/reading/shelves?slug=' + encodeURIComponent(slug), { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const prefs = useMutation({
    mutationFn: (v: Partial<ShelfPrefs>) =>
      apiJson<{ prefs: ShelfPrefs }>('/api/reading/shelves/prefs', {
        method: 'PUT',
        body: JSON.stringify(v),
      }),
    onSuccess: refresh,
  });
  return { set, remove, prefs };
}

export function useGoal(year: number, enabled = true) {
  return useQuery({
    queryKey: goalKey(year),
    queryFn: () => apiJson<{ goal: GoalProgress | null }>(`/api/reading/goal?year=${year}`),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useGoalMutations(year: number) {
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: (v: { unit: 'books' | 'pages'; target: number }) =>
      apiJson<{ goal: GoalProgress }>('/api/reading/goal', {
        method: 'PUT',
        body: JSON.stringify({ year, ...v }),
      }),
    onSuccess: (r) => qc.setQueryData(goalKey(year), { goal: r.goal }),
  });
  const clear = useMutation({
    mutationFn: () => apiJson(`/api/reading/goal?year=${year}`, { method: 'DELETE' }),
    onSuccess: () => qc.setQueryData(goalKey(year), { goal: null }),
  });
  return { set, clear };
}
