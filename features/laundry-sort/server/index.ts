import type { FeatureSocketServer } from '../../../server/socket-server/features';
import {
  registerLaundrySortHandlers,
  handleLaundrySortDisconnect,
} from './handlers';

/**
 * Laundry Sort's versus lobbies, registered by `server/socket-server/features.ts`.
 * Pinned to its own hub slot: the call sat between Dream Rift and Gabriel's Horn.
 */
const laundrySort: FeatureSocketServer =
  {
    id: 'laundry-sort',
    slot: 'laundry-sort',
    register:
      registerLaundrySortHandlers,
    onDisconnect:
      handleLaundrySortDisconnect,
  };

export default laundrySort;
