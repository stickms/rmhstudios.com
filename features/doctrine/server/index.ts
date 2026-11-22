import type { FeatureSocketServer } from '../../../server/socket-server/features';
import { registerDoctrineHandlers, handleDoctrineDisconnect } from './handlers';

/**
 * Doctrine's socket surface (leaderboard, incident and Sahur broadcasts), registered by
 * `server/socket-server/features.ts`. Pinned to its own hub slot: the call sat between Lights Out and Velum.
 */
const doctrine: FeatureSocketServer = {
  id: 'doctrine',
  slot: 'doctrine',
  register: registerDoctrineHandlers,
  onDisconnect: handleDoctrineDisconnect,
};

export default doctrine;
