/**
 * Tiny fetch helpers for the economy-plus panels. Client-safe.
 *
 * Every mutation that moves coins carries an `Idempotency-Key` so a flaky
 * connection or a double tap replays the first response instead of paying twice.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export async function apiJson<T>(
  url: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof data.error === 'string' ? data.error : 'REQUEST_FAILED';
    throw new ApiError(res.status, code, data);
  }
  return data as T;
}

/** A fresh key per user intent. Reuse the SAME key when retrying that intent. */
export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function errorCode(err: unknown): string {
  return err instanceof ApiError ? err.code : 'NETWORK';
}
