"use client";

import { useEffect, useState } from "react";

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Returns false on the server and the first client render, then flips to true
 * once the browser is idle after first paint (requestIdleCallback, falling back
 * to a short timeout). Gate non-critical fetches/polling on this so they don't
 * contend for the network and main thread during the hydration/TTI window.
 */
export function useIdleReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = window as IdleWindow;
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 200);
    return () => window.clearTimeout(id);
  }, []);

  return ready;
}
