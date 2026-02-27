/**
 * RMHbox Phase 6 — Test Setup
 *
 * Extends Phase 5 setup with helpers for testing Phase 6 minigames:
 * Minimalist Masterpiece and Emoji Cinema.
 *
 * Environment-agnostic: no real DB, network, or file system.
 * All external dependencies are mocked.
 */

// Re-export everything from Phase 5 setup
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
