/** Tiny fetch helpers for the calendar UI. No strings, no React. */

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export async function api<T>(
  url: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      credentials: 'include',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
    });
    const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? (json as T) : null,
      error: res.ok ? null : (json?.error ?? null),
    };
  } catch {
    return { ok: false, status: 0, data: null, error: null };
  }
}

/** The viewer's IANA timezone, with a safe fallback. */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
