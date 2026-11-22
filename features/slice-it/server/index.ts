import type { FeatureSocketServer } from '../../../server/socket-server/features';
import { registerSliceItHandlers, handleSliceItDisconnect } from './handlers';

/**
 * Slice It's socket surface (lobbies, matches, spectate, guest seats), registered by
 * `server/socket-server/features.ts`. Pinned to its own hub slot: the call used to open the
 * games block, before Neon Driftway.
 */
const sliceIt: FeatureSocketServer = {
  id: 'slice-it',
  slot: 'slice-it',
  register: registerSliceItHandlers,
  onDisconnect: handleSliceItDisconnect,
};

export default sliceIt;
