/**
 * The process-wide "start the cache-invalidation bridge" signal.
 *
 * The production build holds `lib/cached.server.ts` twice: once in the Nitro
 * bundle (the startup plugins) and once in the app's `_ssr` bundle, where the
 * requests read and write `apiCache` (the same split documented on
 * BUDGET_STORAGE_KEY in lib/prisma.server.ts). A plugin that called the Nitro
 * copy's `startCacheBridge` subscribed that copy's cache, which no request ever
 * reads, and left the app copy unsubscribed. So the plugin raises this flag on
 * `globalThis` instead, and every copy of `cached.server` registers its starter
 * here: a copy loaded before the flag is started by `requestCacheBridge`, one
 * loaded after starts itself at import.
 *
 * Dependency-free on purpose, so the plugin can import it without pulling in
 * Redis or the cache.
 */

type Slot = { wanted: boolean; starters: Set<() => void> };

const SLOT_KEY = Symbol.for('rmh.cache.bridgeStart');

function slot(): Slot {
  const g = globalThis as unknown as Record<symbol, Slot | undefined>;
  return (g[SLOT_KEY] ??= { wanted: false, starters: new Set() });
}

/** Server start-up: start the bridge in every loaded copy, and in every copy loaded later. */
export function requestCacheBridge(): void {
  const s = slot();
  s.wanted = true;
  for (const start of s.starters) start();
}

/** Called once per copy of `cached.server` at import. Starts it now if start-up already asked. */
export function registerCacheBridgeStarter(start: () => void): void {
  const s = slot();
  s.starters.add(start);
  if (s.wanted) start();
}
