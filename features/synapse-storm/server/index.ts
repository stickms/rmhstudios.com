import type { FeatureSocketServer } from '../../../server/socket-server/features';
import { registerSynapseStormHandlers, handleSynapseStormDisconnect } from './handlers';

/**
 * Synapse Storm's multiplayer lobbies, registered by `server/socket-server/features.ts`.
 * Pinned to its own hub slot: the call sat between Neon Driftway and RMH Type. Its disconnect
 * only holds reconnect state, so the hub skips it during shutdown.
 */
const synapseStorm: FeatureSocketServer = {
  id: 'synapse-storm',
  slot: 'synapse-storm',
  register: registerSynapseStormHandlers,
  onDisconnect: handleSynapseStormDisconnect,
  skipDisconnectOnShutdown: true,
};

export default synapseStorm;
