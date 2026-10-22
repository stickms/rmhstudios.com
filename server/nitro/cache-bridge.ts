// Nitro startup plugin — subscribes each web worker to the cross-process cache
// invalidation channel at boot.
//
// WHY A PLUGIN: lib/cached.server.ts opens no Redis connection at import (a script
// that imports it must be able to exit), and installs its bridge lazily on the first
// cached()/invalidate call. A worker that only ever READS `apiCache` makes neither
// call, so without this it would never receive another worker's invalidation and
// would serve the old value until its TTL. Long-running servers start the bridge here.
//
// SAFETY: no Redis configured -> no-op. Everything is swallowed; this must never
// block boot. Imports are RELATIVE (Nitro plugins don't reliably resolve `@/`).

export default function cacheBridgePlugin(): void {
  void import('../../lib/cached.server')
    .then(({ startCacheBridge }) => startCacheBridge())
    .catch(() => {
      // The lazy path still installs the bridge on the first cached()/invalidate call.
    });
}
