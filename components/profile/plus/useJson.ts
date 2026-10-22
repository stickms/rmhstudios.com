'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A GET that runs once per `url` and can be refreshed or patched locally.
 * `data` is `undefined` while loading and `null` if the request failed, so a
 * module can tell "still loading" from "nothing to show".
 */
export function useJson<T>(url: string | null): {
  data: T | null | undefined;
  setData: (next: T | null) => void;
  reload: () => void;
} {
  const [data, setData] = useState<T | null | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
      .catch(() => null)
      .then((json) => {
        if (!cancelled) setData(json);
      });
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, setData, reload };
}
