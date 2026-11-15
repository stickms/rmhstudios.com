import type { FeatureSocketServer } from '../../../server/socket-server/features';
import {
  registerBalatroP2pHandlers,
  handleBalatroP2pDisconnect,
} from './p2p';
import {
  registerBalatroQueueHandlers,
  handleBalatroQueueDisconnect,
} from './queue';

/**
 * Balatro's socket surface, registered by `server/socket-server/features.ts`.
 * Same order as the hand-written calls it replaced: p2p (signalling, relay
 * fallback, seat directory) then queue (matchmaking, party, invites, spectate
 * list); disconnect likewise.
 */
const balatro: FeatureSocketServer =
  {
    id: 'balatro',
    register(
      io,
      socket,
    ) {
      registerBalatroP2pHandlers(
        io,
        socket,
      );
      registerBalatroQueueHandlers(
        io,
        socket,
      );
    },
    onDisconnect(
      io,
      socket,
    ) {
      handleBalatroP2pDisconnect(
        io,
        socket,
      );
      handleBalatroQueueDisconnect(
        io,
        socket,
      );
    },
  };

export default balatro;
