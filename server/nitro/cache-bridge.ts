// Nitro startup plugin — subscribes each web worker to the cross-process cache
// invalidation channel at boot.
//
// WHY A PLUGIN: lib/cached.server.ts opens no Redis connection at import (a script
// that imports it must be able to exit), and installs its bridge lazily on the first
// cached()/invalidate call. A worker that only ever READS `apiCache` makes neither
// call, so without this it would never receive another worker's invalidation and
// would serve the old value until its TTL. Long-running servers start the bridge here.
//
// WHY A FLAG, NOT AN IMPORT OF cached.server: this plugin is bundled into Nitro,
// which holds its own copy of cached.server and of `apiCache`; the requests use
// the copy in the app bundle. Subscribing the Nitro copy did nothing for them.
// The flag lives on globalThis, so the app copy starts itself when it loads
// (lib/cache-bridge-start.ts).
//
// SAFETY: no Redis configured -> the bridge is a no-op. Nothing here can block
// boot. Imports are RELATIVE (Nitro plugins don't reliably resolve `@/`).

import { requestCacheBridge } from '../../lib/cache-bridge-start';

export default function cacheBridgePlugin(): void {
  try {
    requestCacheBridge();
  } catch {
    // The lazy path still installs the bridge on the first cached()/invalidate call.
  }
}
