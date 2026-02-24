/**
 * RMHbox Phase 6 — Test Setup
 *
 * Extends Phase 5 setup with minigame-specific helpers for testing
 * the Phase 6 minigames: Fact or Friction and Undercover Editor.
 *
 * Environment-agnostic: no real DB, Wikipedia API, or network
 * connections required. All external dependencies are mocked.
 */

// Re-export all Phase 5 helpers (mock users, context, lookup helpers)
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
