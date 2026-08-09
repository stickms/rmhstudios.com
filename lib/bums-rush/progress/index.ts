/**
 * Bum's Rush — the progress module's barrel.
 *
 * Deliberately does NOT re-export `save.server.ts`: importing this barrel
 * from client code must not risk pulling a `.server` module into the browser
 * bundle. Reach for `@/lib/bums-rush/progress/save.server` directly from
 * server-only code (API routes, the socket handler) instead.
 */
export * from './merge';
export * from './unlocks';
export * from './leaderboard';
export {
  bumsRushSave,
  BUMS_RUSH_LOCAL_KEY,
  applyLevelClear,
  clearProfileEverywhere,
  createDefaultProfile,
  loadOrCreateLocalProfile,
  loadProfileFromServer,
  mergeOnSignIn,
  parseProfile,
  saveLocalProfile,
  saveProfileBeacon,
  saveProfileToServer,
  setSaveIdentity,
  summarizeProfile,
} from './save';
