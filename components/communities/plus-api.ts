/** Tiny fetch helper for the communities-plus panels (JSON in, JSON out). */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export async function plusFetch<T = unknown>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      ...(body !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? data : null,
      error: res.ok ? null : (data?.error ?? null),
    };
  } catch {
    return { ok: false, status: 0, data: null, error: null };
  }
}

export const communityApi = (slug: string, path = '') =>
  `/api/communities/${encodeURIComponent(slug)}${path}`;
