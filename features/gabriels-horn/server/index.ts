import type { FeatureSocketServer } from '../../../server/socket-server/features';
import { registerGabrielsHornHandlers, handleGabrielsHornDisconnect } from './handlers';

/**
 * Gabriel's Horn's table lobbies and match handlers, registered by `server/socket-server/features.ts`.
 * Pinned to its own hub slot: the call sat between Laundry Sort and Globe Set.
 */
const gabrielsHorn: FeatureSocketServer = {
  id: 'gabriels-horn',
  slot: 'gabriels-horn',
  register: registerGabrielsHornHandlers,
  onDisconnect: handleGabrielsHornDisconnect,
};

export default gabrielsHorn;
