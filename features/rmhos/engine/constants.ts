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
  } as const;
