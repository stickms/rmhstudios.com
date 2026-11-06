/** Attempts per realm: a failure (a timeout, a flaky network) earns the next caller one retry, then null is final. */
const MAX_ATTEMPTS = 2;

/** Fetch/compile once per realm. MIME fallback supports imperfect preview hosts. */
export function wasmModule(url: string): () => Promise<WebAssembly.Module | null> {
  let pending: Promise<WebAssembly.Module | null> | undefined;
  let failures = 0;
  return () => {
    if (typeof WebAssembly === 'undefined') return Promise.resolve(null);
    pending ??= (async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Wasm HTTP ${response.status}`);
      if (typeof WebAssembly.compileStreaming === 'function') {
        try {
          return await WebAssembly.compileStreaming(response.clone());
        } catch {
          /* A missing application/wasm MIME type must not break the site. */
        }
      }
      return WebAssembly.compile(await response.arrayBuffer());
    })().catch(() => {
      // Forget the failure so a later call fetches again, until the attempts run out.
      if (++failures < MAX_ATTEMPTS) pending = undefined;
      return null;
    });
    return pending;
  };
}
