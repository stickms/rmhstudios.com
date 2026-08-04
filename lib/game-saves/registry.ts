/**
 * Which games may keep a save on the shared table.
 *
 * `/api/game-saves/:gameId` writes a JSON blob keyed by `(userId, gameId)`, so
 * without a list it is a general-purpose key-value store that any signed-in
 * account can fill at 500 KB a row. The allowlist is what makes it a save
 * endpoint instead: an id that is not here is a 404, and adding a game is a
 * one-line change in the same commit that teaches the game to save.
 *
 * Games with their own table and their own route — Temple of Joy, Forest
 * Explorer, Versecraft, Synapse Storm, Signal Forge — are deliberately absent.
 * They pass a transport of their own to `createCloudSave` and keep the schema
 * they already have; there is nothing to gain from moving a working save across
 * a migration.
 *
 * Games still on `localStorage` alone are absent too, and that is the point of
 * keeping this list short: an id here is a promise that something writes to it.
 * Velum 2099's story save, Lights Out's puzzle history, Dream Rift's high
 * scores, the Altair meta shop and the Farming Sim have not been moved yet —
 * add the id in the same commit that teaches the game to save, not before.
 */
export const SHARED_SAVE_GAMES = [
  'cookgame',
  'isleworks',
  'void-breaker',
  'neon-driftway',
] as const;

export type SharedSaveGameId = (typeof SHARED_SAVE_GAMES)[number];

const ALLOWED = new Set<string>(SHARED_SAVE_GAMES);

export function isSharedSaveGame(id: string): id is SharedSaveGameId {
  return ALLOWED.has(id);
}

/**
 * The ceiling on one save, in bytes of JSON.
 *
 * Generous — a finished Isleworks city is a few hundred kilobytes of placed
 * buildings — but finite, and checked before the row is written rather than
 * after. Stated here rather than in the route so the client can refuse to build
 * a payload it already knows will be rejected.
 */
export const MAX_SAVE_BYTES = 500_000;
