/**
 * The feature registry for the socket hub (redesign audit A1 step 3).
 *
 * A feature owns its socket handlers in `features/<id>/server/` and exposes them
 * as one `FeatureSocketServer` (default export of `features/<id>/server/index.ts`).
 * This list is the only place the hub learns about them; `index.ts` calls
 * `registerFeatureHandlers` once per connection and `handleFeatureDisconnects`
 * from the disconnect handler, at the spot the hand-written calls used to sit.
 *
 * ORDER IS BEHAVIOUR. Entries register in array order and disconnect in array
 * order, exactly as the hand-written calls did. Append new features where their
 * old calls sat in `index.ts`; do not sort this list.
 *
 * The list is a plain import list rather than `import.meta.glob`: the server
 * bundle is built by esbuild (package.json `build`, Dockerfile `server-builder`),
 * which has no glob import, and a static import keeps the bundle's reachability
 * checkable (`lib/__tests__/server-bundle-copies.test.ts`).
 */
import type { Server, Socket } from 'socket.io';
import balatro from '../../features/balatro/server';

/** What a feature's `server/index.ts` default-exports. */
export interface FeatureSocketServer {
  /** The feature id (folder name under `features/`). */
  readonly id: string;
  /** Called once per connected socket, in registry order. */
  register(io: Server, socket: Socket): void;
  /** Called when that socket disconnects, in registry order. */
  onDisconnect?(io: Server, socket: Socket): void;
}

export const FEATURE_SOCKET_SERVERS: readonly FeatureSocketServer[] = [balatro];

export function registerFeatureHandlers(io: Server, socket: Socket): void {
  for (const f of FEATURE_SOCKET_SERVERS) f.register(io, socket);
}

export function handleFeatureDisconnects(io: Server, socket: Socket): void {
  for (const f of FEATURE_SOCKET_SERVERS) f.onDisconnect?.(io, socket);
}
