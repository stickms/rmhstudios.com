/**
 * RMHbox Phase 7 — Test Setup
 *
 * Re-exports the Phase 5 mock infrastructure (mock users, context factory,
 * broadcast lookup helpers) for use in Cursor Curling tests.
 * The underlying mock shapes are identical across phases.
 */

export {
  MOCK_USERS,
  DEFAULT_SETTINGS,
  createPlayer,
  createMockContext,
  findBroadcasts,
  findLastBroadcast,
  findPlayerEvents,
  findLastPlayerEvent,
  findActionBroadcasts,
  findLastActionBroadcast,
  findPlayerActions,
  findLastPlayerAction,
  type MockUser,
  type MockContextData,
} from '../phase-5/setup';
