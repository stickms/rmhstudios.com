/**
 * Phase 8 — Test Setup
 *
 * Extends Phase 5 setup with helpers specific to
 * the Phase 8 minigames: Pixel Pushers and Scroll Soul.
 *
 * Environment-agnostic: no real DB, no network connections.
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

// ─── Additional Mock Users for 8-Player Tests ───────────────────

import type { MockUser } from '../phase-5/setup';

export const MOCK_USERS_EXTENDED: Record<string, MockUser> = {
  frank: {
    userId: 'user-frank-006',
    userName: 'Frank',
    avatarUrl: null,
    sessionToken: 'valid-token-frank',
    expiresAt: new Date(Date.now() + 86400_000),
  },
  grace: {
    userId: 'user-grace-007',
    userName: 'Grace',
    avatarUrl: null,
    sessionToken: 'valid-token-grace',
    expiresAt: new Date(Date.now() + 86400_000),
  },
  henry: {
    userId: 'user-henry-008',
    userName: 'Henry',
    avatarUrl: null,
    sessionToken: 'valid-token-henry',
    expiresAt: new Date(Date.now() + 86400_000),
  },
};
