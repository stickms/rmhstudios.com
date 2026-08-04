/**
 * What each game in `lib/games.ts` actually *is*, as opposed to how it is sold.
 *
 * `GameInfo` is a marketing card — title, blurb, gradient, icon, free-text
 * `tags`. Nothing in it answers the questions a player asks before spending a
 * download: can I play this on my phone, does it need a keyboard, is it
 * multiplayer, will it eat twenty minutes or two, does my progress follow my
 * account, does it flash. Steam and itch.io have answered all of those in
 * structured fields for a decade and use them as browse facets; this module is
 * the equivalent.
 *
 * ## Why a separate registry instead of fields on `GameInfo`
 *
 * Same reason `lib/achievements/catalog.ts` and `lib/wager/eligible-games.ts`
 * are separate: `games.ts` is edited when a game's *presentation* changes and
 * this is edited when its *behaviour* changes, and they are reviewed by
 * different eyes. `lib/__tests__/game-capabilities.test.ts` holds the two to
 * exact key parity, so a new game cannot ship without an entry here — the
 * enforcement the co-located version would have given is kept, without doubling
 * the length of the catalog file.
 *
 * ## The honesty rule
 *
 * Every field here is a claim about code that exists **today**. Where a claim is
 * mechanically checkable it IS checked in the test file (save scope against
 * `SHARED_SAVE_GAMES`, touch support against the presence of touch handling,
 * multiplayer against a realtime module). Where it is a judgement — genre,
 * session length — keep it honest rather than flattering: this metadata's only
 * value is that a player can trust it. `accessibility` in particular is empty
 * for almost every game, and that is not an oversight; the cross-game assist
 * layer has not been built (see docs/plans/2026-08-04-competitive-feature-gaps.md
 * §A3). Do not populate it aspirationally.
 */

export type GameGenre =
  | 'action'
  | 'arcade'
  | 'card'
  | 'fighting'
  | 'idle'
  | 'narrative'
  | 'party'
  | 'platformer'
  | 'puzzle'
  | 'racing'
  | 'rhythm'
  | 'shooter'
  | 'simulation'
  | 'strategy';

export type PlayerMode =
  /** Playable alone, start to finish. */
  | 'single'
  /** Real-time online play against other people. */
  | 'online-versus'
  /** Real-time online play alongside other people. */
  | 'online-coop'
  /** Compete through a leaderboard rather than a shared session. */
  | 'async-leaderboard';

export type InputMethod = 'keyboard' | 'mouse' | 'touch' | 'gamepad' | 'gyro';

/**
 * Where a player's progress lives.
 *
 * `shared-table` is the allowlist in `lib/game-saves/registry.ts`; `own-table`
 * is a game that keeps its own model and route (that file's doc comment names
 * both sets, and is the source used here); `local-only` is `localStorage` and
 * dies with the browser profile; `none` is a game with no progress to keep.
 */
export type SaveScope = 'shared-table' | 'own-table' | 'local-only' | 'none';

/**
 * Accessibility features a game actually implements. Deliberately sparse — see
 * the honesty rule above.
 */
export type AccessibilityFeature =
  | 'remappable-input'
  | 'assist-mode'
  | 'reduced-flashing'
  | 'colorblind-safe'
  | 'subtitles'
  | 'no-timed-input';

/**
 * Honest warnings. `flashing` is the load-bearing one: it gates the
 * photosensitivity interstitial and is a WCAG 2.3.1 (Level A) concern, so mark
 * it whenever a renderer strobes, even if it feels mild.
 */
export type ContentDescriptor =
  'flashing' | 'gambling-themes' | 'violence' | 'user-content' | 'ai-generated';

export interface GameCapabilities {
  genre: readonly GameGenre[];
  players: readonly PlayerMode[];
  /** Players in one online session. Omit for single-player-only games. */
  maxPlayers?: number;
  input: {
    /** Everything the game can be played with. */
    readonly supported: readonly InputMethod[];
    /** Without one of these the game is unplayable — drives the device badge. */
    readonly required: readonly InputMethod[];
  };
  /** Typical single sitting, in minutes: [floor, ceiling]. */
  sessionMinutes: readonly [number, number];
  engine: '2d-canvas' | 'webgl' | 'dom';
  /**
   * Needs more than a `perf-lite` device to hold a playable frame rate.
   * `lib/perf-tier.ts` is a binary low-end switch, so this is binary too.
   */
  demanding: boolean;
  save: SaveScope;
  accessibility: readonly AccessibilityFeature[];
  descriptors?: readonly ContentDescriptor[];
}

/** Keyed by `GameInfo.id`. Held to exact parity with `games` by the test file. */
export const GAME_CAPABILITIES: Record<string, GameCapabilities> = {
  isleworks: {
    genre: ['simulation', 'strategy'],
    players: ['single'],
    input: { supported: ['mouse', 'touch'], required: ['mouse'] },
    sessionMinutes: [20, 90],
    engine: 'webgl',
    demanding: true,
    save: 'shared-table',
    accessibility: [],
  },
  rmhbox: {
    genre: ['party', 'puzzle'],
    players: ['online-versus', 'online-coop'],
    maxPlayers: 16, // server: ABSOLUTE_MAX_PLAYERS
    input: { supported: ['mouse', 'touch', 'keyboard'], required: [] },
    sessionMinutes: [10, 30],
    engine: 'dom',
    demanding: false,
    save: 'none',
    accessibility: [],
  },
  altair: {
    genre: ['strategy', 'narrative'],
    players: ['single', 'online-coop'],
    maxPlayers: 4,
    input: { supported: ['mouse', 'touch', 'keyboard'], required: [] },
    sessionMinutes: [20, 60],
    engine: 'webgl',
    demanding: true,
    // AltairMetaProgress, written by app/routes/api/altair/meta.ts.
    save: 'own-table',
    accessibility: [],
  },
  'daily-puzzles': {
    genre: ['puzzle'],
    players: ['single', 'async-leaderboard'],
    input: { supported: ['mouse', 'touch', 'keyboard'], required: [] },
    sessionMinutes: [3, 15],
    engine: 'webgl',
    demanding: false,
    save: 'own-table',
    accessibility: ['no-timed-input'],
  },
  versecraft: {
    genre: ['narrative'],
    players: ['single'],
    input: { supported: ['mouse', 'touch', 'keyboard'], required: [] },
    sessionMinutes: [20, 60],
    engine: 'dom',
    demanding: false,
    save: 'own-table',
    accessibility: ['no-timed-input'],
    descriptors: ['ai-generated'],
  },
  'slice-it': {
    genre: ['rhythm', 'arcade'],
    players: ['single', 'online-versus', 'async-leaderboard'],
    // Server declares no lobby cap; omitted rather than invented.
    input: { supported: ['keyboard', 'touch', 'gamepad'], required: [] },
    sessionMinutes: [3, 20],
    engine: '2d-canvas',
    demanding: false,
    save: 'none',
    // The only game wired to a gamepad today (components/game/GameCanvas.tsx).
    accessibility: [],
    descriptors: ['flashing', 'user-content'],
  },
  velum2099: {
    genre: ['racing', 'simulation'],
    players: ['single', 'online-versus'],
    // Server declares no lobby cap; omitted rather than invented.
    input: { supported: ['keyboard', 'touch'], required: [] },
    sessionMinutes: [10, 40],
    engine: 'webgl',
    demanding: true,
    save: 'local-only',
    accessibility: [],
    descriptors: ['flashing'],
  },
  'synapse-storm': {
    genre: ['action', 'puzzle'],
    players: ['single', 'async-leaderboard'],
    input: { supported: ['mouse', 'touch', 'keyboard'], required: [] },
    sessionMinutes: [3, 10],
    engine: 'dom',
    demanding: false,
    // SynapseStormPlayer is a score row (lib/game/adapters.server.ts), not progress.
    save: 'none',
    accessibility: [],
    descriptors: ['flashing'],
  },
  'temple-of-joy': {
    genre: ['idle'],
    players: ['single'],
    input: { supported: ['mouse', 'touch'], required: [] },
    sessionMinutes: [5, 60],
    engine: 'webgl',
    demanding: false,
    save: 'own-table',
    accessibility: ['no-timed-input'],
  },
  'neon-driftway': {
    genre: ['racing', 'arcade'],
    players: ['single', 'online-versus'],
    maxPlayers: 6, // server: MAX_NDW_PLAYERS
    input: { supported: ['keyboard', 'touch', 'gyro'], required: [] },
    sessionMinutes: [5, 20],
    engine: 'webgl',
    demanding: true,
    save: 'shared-table',
    accessibility: [],
    descriptors: ['flashing'],
  },
  'laundry-sort': {
    genre: ['arcade', 'puzzle'],
    players: ['single', 'online-versus'],
    maxPlayers: 8, // lib/laundry-sort/constants.ts: MAX_LOBBY_PLAYERS
    input: { supported: ['mouse', 'touch'], required: [] },
    sessionMinutes: [3, 10],
    engine: 'webgl',
    demanding: true,
    save: 'none',
    accessibility: [],
  },
  'forest-explorer': {
    genre: ['narrative', 'puzzle'],
    players: ['single'],
    // No touch handling in the source: first-person 3D, desktop-only in practice.
    input: { supported: ['keyboard', 'mouse'], required: ['keyboard'] },
    sessionMinutes: [10, 45],
    engine: 'webgl',
    demanding: true,
    save: 'own-table',
    accessibility: ['no-timed-input'],
  },
  'void-breaker': {
    genre: ['shooter', 'arcade'],
    players: ['single', 'async-leaderboard'],
    input: { supported: ['keyboard', 'mouse', 'touch'], required: [] },
    sessionMinutes: [5, 25],
    engine: 'webgl',
    demanding: true,
    save: 'shared-table',
    accessibility: [],
    descriptors: ['flashing'],
  },
  'kowloon-knockout': {
    genre: ['fighting', 'action'],
    players: ['single', 'online-versus'],
    maxPlayers: 4,
    input: { supported: ['keyboard', 'touch'], required: [] },
    sessionMinutes: [5, 20],
    engine: 'webgl',
    demanding: true,
    save: 'none',
    accessibility: [],
    descriptors: ['violence'],
  },
  cookgame: {
    genre: ['simulation', 'strategy'],
    players: ['single'],
    // No touch handling in the source.
    input: { supported: ['mouse'], required: ['mouse'] },
    sessionMinutes: [15, 60],
    engine: 'webgl',
    demanding: true,
    save: 'shared-table',
    accessibility: ['no-timed-input'],
  },
  'rochester-offensive': {
    genre: ['shooter', 'action'],
    players: ['single', 'online-versus', 'online-coop'],
    maxPlayers: 10,
    input: { supported: ['keyboard', 'mouse', 'touch'], required: [] },
    sessionMinutes: [10, 40],
    engine: 'webgl',
    demanding: true,
    save: 'none',
    accessibility: [],
    descriptors: ['violence'],
  },
  'house-always-wins': {
    genre: ['platformer', 'narrative'],
    players: ['single'],
    // Precision platforming with no touch handling in the source.
    input: { supported: ['keyboard'], required: ['keyboard'] },
    sessionMinutes: [20, 90],
    engine: '2d-canvas',
    demanding: false,
    save: 'local-only',
    accessibility: [],
    // Depicts a casino; no real staking. Distinct from the coin-staked surfaces.
    descriptors: ['gambling-themes'],
  },
  'dream-rift': {
    genre: ['shooter', 'arcade'],
    players: ['single', 'online-coop'],
    maxPlayers: 4,
    input: { supported: ['keyboard', 'touch'], required: [] },
    sessionMinutes: [10, 30],
    engine: '2d-canvas',
    demanding: false,
    // Score-attack: DreamRiftPlayer holds high scores, there is no run to resume.
    save: 'none',
    accessibility: [],
    descriptors: ['flashing'],
  },
  'rmh-farming-sim': {
    genre: ['simulation'],
    players: ['single', 'online-coop'],
    maxPlayers: 4,
    input: { supported: ['keyboard', 'mouse'], required: ['keyboard'] },
    sessionMinutes: [20, 90],
    engine: 'webgl',
    demanding: true,
    // FarmingSimFarm.saveData, upserted by the socket handler.
    save: 'own-table',
    accessibility: ['no-timed-input'],
  },
  'gabriels-horn': {
    genre: ['card', 'party'],
    players: ['online-versus'],
    maxPlayers: 6,
    input: { supported: ['mouse', 'touch'], required: [] },
    sessionMinutes: [10, 30],
    engine: 'dom',
    demanding: false,
    save: 'none',
    accessibility: ['no-timed-input'],
  },
  nightrail: {
    genre: ['racing', 'arcade'],
    // No shared session — the competition is the leaderboard, not other trains.
    players: ['single', 'async-leaderboard'],
    // Keyboard, touch and gamepad each cover the whole control set on their
    // own, so nothing is strictly required. Mouse is listed because a drag is
    // the desktop way to throw the four diagonal tricks a keyboard can't
    // express, not because the game can be played with it alone.
    input: { supported: ['keyboard', 'mouse', 'touch', 'gamepad'], required: [] },
    // A single delivery is about a minute; a sitting is a few attempts at one
    // line, or a run at all five.
    sessionMinutes: [5, 20],
    engine: 'webgl',
    demanding: true,
    // Level unlocks are `localStorage` under `nightrail.unlocks`. The
    // `NightrailPlayer` row is a leaderboard record, not progress the game
    // reads back, so `own-table` would overstate what following your account
    // actually gets you.
    save: 'local-only',
    accessibility: [],
    // Neon signage, bloom, drift sparks and the crash burst all strobe.
    descriptors: ['flashing'],
  },
};

export function capabilitiesFor(gameId: string): GameCapabilities | undefined {
  return GAME_CAPABILITIES[gameId];
}

/**
 * Whether a game is playable on the device asking, from the capability data
 * alone. `coarsePointer` is a touch device; `perfLite` is the low-end tier from
 * `lib/perf-tier.ts`. Returns a reason so the UI can say *why* rather than just
 * greying a card out.
 */
export function playabilityFor(
  caps: GameCapabilities,
  device: { coarsePointer: boolean; perfLite: boolean },
): { playable: boolean; reason?: 'needs-keyboard' | 'needs-pointer' | 'too-demanding' } {
  const { required, supported } = caps.input;

  // A touch device can't offer a keyboard or a real pointer; a desktop can't
  // offer touch. Only `required` blocks — `supported` is a nice-to-have.
  if (device.coarsePointer) {
    if (required.includes('keyboard')) return { playable: false, reason: 'needs-keyboard' };
    if (required.includes('mouse')) return { playable: false, reason: 'needs-pointer' };
    // Nothing required, but nothing touch-shaped supported either.
    if (!supported.includes('touch') && !supported.includes('gyro')) {
      return { playable: false, reason: 'needs-pointer' };
    }
  }

  if (device.perfLite && caps.demanding) return { playable: false, reason: 'too-demanding' };
  return { playable: true };
}
