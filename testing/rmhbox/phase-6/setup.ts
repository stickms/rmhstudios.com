/**
 * RMHbox Phase 6 — Test Setup
 *
 * Extends Phase 5 setup with helpers for testing Phase 6 minigames:
 * Fact or Friction, Undercover Editor, Minimalist Masterpiece, and Emoji Cinema.
 *
 * Environment-agnostic: no real DB, Wikipedia API, network, or file system.
 * All external dependencies are mocked.
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