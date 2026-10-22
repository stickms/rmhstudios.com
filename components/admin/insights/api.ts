import { useCallback, useEffect, useState } from 'react';

/** Fetch an admin insights endpoint; `reload` refetches. */
export function useInsight<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as T);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, loading, failed, reload };
}

export async function send(url: string, method: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
