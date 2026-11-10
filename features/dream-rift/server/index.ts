import type { FeatureSocketServer } from '../../../server/socket-server/features';
import { registerDreamRiftHandlers, handleDreamRiftDisconnect } from './handlers';

/**
 * Dream Rift's co-op lobby and relay, registered by `server/socket-server/features.ts`.
 * Pinned to its own hub slot: the call sat between Velum and Laundry Sort.
 */
const dreamRift: FeatureSocketServer = {
  id: 'dream-rift',
  slot: 'dream-rift',
  register: registerDreamRiftHandlers,
  onDisconnect: handleDreamRiftDisconnect,
};

export default dreamRift;
