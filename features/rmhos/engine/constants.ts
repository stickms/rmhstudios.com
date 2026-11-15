// rmhOS shared constants. Imports nothing: this file is bundled into the
// sandboxed relay hub as well as the browser.
export const RMHOS =
  {
    memoryBytes:
      640 *
      1024 *
      1024,
    vgaMemoryBytes:
      8 *
      1024 *
      1024,
    uid: 1000,
    autosaveMs: 300_000,
    ticketTtlMs: 60_000,
    netPath:
      '/rmhos-net/',
    netPort: 7009,
    /** Shortest relay ticket secret the web tier and the hub accept (`openssl rand -hex 32` is 64). */
    minSecretLength: 32,
  } as const;
