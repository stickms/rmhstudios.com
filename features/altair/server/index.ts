import type { FeatureSocketServer } from '../../../server/socket-server/features';
import {
  registerAltairHandlers,
  handleAltairDisconnect,
} from './handlers';

/**
 * Altair's socket surface (co-op lobbies, host-sim relay, run-log verify hand-off),
 * registered by `server/socket-server/features.ts`. Pinned to the hub slot where the
 * hand-written call used to sit (after RMH Study, before Kowloon Knockout).
 */
const altair: FeatureSocketServer =
  {
    id: 'altair',
    slot: 'altair',
    register:
      registerAltairHandlers,
    onDisconnect:
      handleAltairDisconnect,
  };

export default altair;
