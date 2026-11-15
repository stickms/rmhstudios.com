/**
 * The stored files of the signed-in account, independent of any machine: one IndexedDB
 * connection per mount, opened lazily by the first call and closed on unmount. The machine hook
 * shares it (a restart keeps the in-memory fallback's contents), and the coming-soon panel uses
 * it alone, so a returning person can always reach their files from About.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { openHomeStore, type HomeStore } from '../engine/home-store';
import { createStoredFiles, type StoredFiles } from '../engine/stored-home';

export function useStoredHome(userId: string | null): {
  getStore: () => HomeStore;
  stored: StoredFiles;
} {
  const storeRef = useRef<HomeStore | null>(null);
  const getStore = useCallback(() => (storeRef.current ??= openHomeStore()), []);
  useEffect(
    () => () => {
      storeRef.current?.close();
      storeRef.current = null;
    },
    [],
  );
  const stored = useMemo(() => createStoredFiles(userId, getStore), [userId, getStore]);
  return { getStore, stored };
}
