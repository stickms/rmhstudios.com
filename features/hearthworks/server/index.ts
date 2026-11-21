import type { FeatureSocketServer } from '../../../server/socket-server/features';
import { registerHearthworksP2pHandlers, handleHearthworksP2pDisconnect } from './p2p';

/**
 * Hearthworks multiplayer: room list, signalling, relay fallback and host migration. The world runs in the
 * host's browser; the hub never carries game state. Shared slot, registered right after Balatro as before.
 */
const hearthworks: FeatureSocketServer = {
  id: 'hearthworks',
  register: registerHearthworksP2pHandlers,
  onDisconnect: handleHearthworksP2pDisconnect,
};

export default hearthworks;
