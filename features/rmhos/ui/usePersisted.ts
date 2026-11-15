/**
 * Whether the browser promised to keep the stored files, for the notice and for About
 * (engine/persistence.ts has the rules). `keep()` must be called straight from a click handler.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { askOnce, evictionRisk, readPersisted, requestPersist } from '../engine/persistence';

export function usePersisted(refreshOn: unknown = null) {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void readPersisted().then((p) => live && setPersisted(p));
    return () => {
      live = false;
    };
  }, [refreshOn]);
  /** Asks the browser, then reads its answer. Resolves to whether the files are now kept. */
  const keep = useCallback(async () => {
    const granted = await requestPersist();
    const now = await readPersisted();
    setPersisted(now);
    return granted;
  }, []);
  /** The same, at most once per page load: for Save, which must not re-prompt on every click. */
  const keepOnceRef = useRef<(() => Promise<boolean | undefined>) | null>(null);
  const keepOnce = useCallback(() => (keepOnceRef.current ??= askOnce(keep))(), [keep]);
  return { persisted, risk: evictionRisk(persisted), keep, keepOnce };
}
