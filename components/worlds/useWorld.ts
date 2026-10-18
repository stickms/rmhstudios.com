'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SnapshotView } from '@/lib/worlds/schema';

/** Load a published world by share code. `error` is 'not-found' or 'failed'. */
export function useVisitedWorld(code: string | null) {
  const [world, setWorld] = useState<SnapshotView | null>(null);
  const [error, setError] = useState<'not-found' | 'failed' | null>(null);

  const reload = useCallback(async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/worlds/visit/${code}`);
      if (res.status === 404) return setError('not-found');
      if (!res.ok) return setError('failed');
      setWorld((await res.json()) as SnapshotView);
      setError(null);
    } catch {
      setError('failed');
    }
  }, [code]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { world, error, reload };
}
