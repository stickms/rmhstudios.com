/** Fetch/compile once per realm. MIME fallback supports imperfect preview hosts. */
export function wasmModule(url: string): () => Promise<WebAssembly.Module | null> {
  let pending: Promise<WebAssembly.Module | null> | undefined;
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
    })().catch(() => null);
    return pending;
  };
}
