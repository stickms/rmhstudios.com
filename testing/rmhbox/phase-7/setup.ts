/**
 * RMHbox Phase 7 — Test Setup
 *
 * Extends Phase 5 setup with helpers for testing Phase 7 minigames:
 * Sequence Sam and Human Keyboard.
 *
 * Environment-agnostic: no real DB, Wikipedia API, or network
 * connections required. All external dependencies are mocked.
 */

// Re-export all Phase 5 setup helpers
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
} from '../phase-5/setup';
export type { MockUser, MockContextData } from '../phase-5/setup';
