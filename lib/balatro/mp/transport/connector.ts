/**
 * The browser's PeerConnector: one `DirectConnection` (lib/shared/p2p) per
 * host ↔ member pair. Balatro's hub contract has no null end-of-candidates,
 * so candidates never signal one (`endOfCandidates: false`). When no direct
 * or TURN path forms in time, `onFailed` tells the owner to fall back to the
 * hub relay (host-star.ts / member.ts).
 *
 * Test builds can pass P2pTestHooks (blockCandidates forces the relay path,
 * E2E-15; relayOnly proves TURN). Browser only.
 */

import { DirectConnection, type P2pTestHooks } from '../../../shared/p2p';
import type { PeerAttempt, PeerConnectOptions, PeerConnector } from './types';

export function webrtcConnector(hooks?: P2pTestHooks): PeerConnector {
  return {
    connect(opts: PeerConnectOptions): PeerAttempt {
      const dc = new DirectConnection({
        role: opts.role,
        iceServers: hooks?.iceServers ?? opts.ice,
        hooks,
        endOfCandidates: false,
        signal: opts.signal,
        onChannels: opts.onChannels,
        onFailed: opts.onFailed,
      });
      return {
        handle: (s) => void dc.handle(s),
        close: () => dc.close(),
      };
    },
  };
}
