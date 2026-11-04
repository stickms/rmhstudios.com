/**
 * The browser's PeerConnector for Balatro: one `DirectConnection` (lib/shared/p2p) per host ↔ member pair.
 * The implementation moved to lib/shared/p2p/connector.ts when Hearthworks started using it too; Balatro's
 * hub contract has no null end-of-candidates, so candidates never signal one (`endOfCandidates: false`).
 * When no direct or TURN path forms in time, `onFailed` tells the owner to fall back to the hub relay
 * (host-star.ts / member.ts).
 *
 * Test builds can pass P2pTestHooks (blockCandidates forces the relay path, E2E-15; relayOnly proves TURN).
 */

export { webrtcConnector } from '../../../shared/p2p/connector';
