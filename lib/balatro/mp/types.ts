/**
 * Balatro multiplayer — domain types (PLAN §3.f, §3.b `LobbyState`/`LobbyOptions`; frozen).
 *
 * Every type is a zod schema plus `z.infer`, so the wire (wire.ts), the Lua
 * mailbox (bridge-protocol.ts → protocol.lua) and the referee share one
 * definition. Browser-free and relative imports only.
 *
 * ## WS0 resolutions of gaps in the PLAN text (binding for every stream)
 *
 * 1. **LobbyOptions naming.** The PLAN mixes snake_case (A1 §1.3, LOB-07) and
 *    camelCase (`trapCards`, `seatGraceMs`). Every field here is camelCase;
 *    the A1 name is in the comment next to it. `queue_mode`, `back`/`stake`/
 *    `challenge` live on LobbyState, not in the options. `preview_disabled`
 *    is dropped (EX-12/D-40), as are the EX-19 options. `gamemode` is fixed
 *    to Attrition (the only content profile, A1 §2.1).
 * 2. **Shape.** `Shape` gains `practice?: boolean` because §3.f's rules say
 *    "Practice runs refStep with `shape.practice=true`".
 * 3. **RefState** is WS4's internal type and lives in referee/referee.ts;
 *    this file exports `RefStep<S>` generic over it. `RefOutput` =
 *    `{ to, msg: RefMsg }` (the element of `RefStep.out`).
 * 4. **Types the PLAN names without a shape** — `SetupView`, `HandResult`,
 *    `PlayerResult`, `SafeCard`, `ReplayEvent`, `ReplayBatch`,
 *    `PendingDeath`, `TeamPending` — are defined below from A1 §1.5/§1.6/§4.6,
 *    §3.b and REP-01. Their fields are the minimum those sections need.
 * 5. **Ids** are account userIds, `string` of 1–64 chars.
 */

import { z } from 'zod';
import { zQueueMode, zLobbyKind, zContentHash, zCode } from '../net/events';

export { zQueueMode, zLobbyKind };
export type { QueueMode, LobbyKind } from '../net/events';

/* ─── Scalars ────────────────────────────────────────────────────────────── */

export const zId = z.string().min(1).max(64);
export type Id = z.infer<typeof zId>;

export const zTeam = z.enum(['A', 'B', 'HUNTER', 'RUNNER']);
export type Team = z.infer<typeof zTeam>;
export const zTeamAB = z.enum(['A', 'B']);

/** A game key: `j_mp_pizza`, `b_red`, `bl_small`, `c_mp_eeeee`, `m_glass`… */
export const zKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
export const zRulesetKey = z.string().regex(/^ruleset_mp_[a-z0-9_]{1,40}$/);
export const zLayerName = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);

/** `string.format('%.17g', x)` in Lua, or `inf`/`-inf` (NaN travels as `inf`, §0.9). */
export const zScoreStr = z.string().regex(/^(-?inf|-?\d+(\.\d+)?(e[+-]\d+)?)$/);
export type ScoreStr = z.infer<typeof zScoreStr>;

/** The match seed (D-30: 8 chars A–Z0–9; a custom seed may be shorter). */
export const zSeed = z.string().regex(/^[A-Z0-9]{1,8}$/);
export const zRunId = z.string().min(1).max(32);
export const zBlindCol = z.number().int().min(1).max(25);
export const zStake = z.number().int().min(1).max(8);
/**
 * The MP stake on top of the vanilla stake index. The first three are the mod's live stakes; the
 * seven after them are its `alt_stakes` (EX-16 lifted: off by default, picked in the lobby like
 * the others — plastic … antimatter, each applying the ones before it).
 */
export const MP_STAKES = [
  'planet',
  'spectral',
  'spectralplus',
  'plastic',
  'pebble',
  'ferrite',
  'pyrite',
  'jade',
  'crystal',
  'antimatter',
] as const;
export const zMpStake = z.enum(MP_STAKES);
export type MpStake = z.infer<typeof zMpStake>;
/**
 * An optional content pack a ruleset needs beyond the MP pack (EX-14: the Release ruleset's art,
 * `release-<sha>.zip`). Every seated peer must hold it before the host can start.
 */
export const zOptionalPack = z.enum(['release']);
export type OptionalPack = z.infer<typeof zOptionalPack>;
export const zBlindSlot = z.enum(['Small', 'Big', 'Boss']);

export const zShape = z.object({
  nemesisPairing: z.boolean(),
  manhunt: z.boolean(),
  teamBased: z.boolean(),
  practice: z.boolean().optional(),
});
export type Shape = z.infer<typeof zShape>;

/* ─── Lobby options (A1 §1.3 minus EX-19, plus the §3.b additions) ───────── */

export const zLobbyOptions = z.object({
  /** `ruleset` */
  ruleset: zRulesetKey,
  /** `gamemode` — always Attrition. */
  gamemode: z.literal('gamemode_mp_attrition'),
  /** `trap_cards` → adds the `traps` modifier layer. */
  trapCards: z.boolean(),
  /** `manhunt_hunter_lives`, 7…16. */
  manhuntHunterLives: z.number().int().min(7).max(16),
  /** `starting_lives` */
  startingLives: z.number().int().min(1).max(20),
  /** `pvp_start_round` */
  pvpStartRound: z.number().int().min(1).max(20),
  /** `timer` */
  timer: z.boolean(),
  /** `timer_base_seconds` */
  timerBaseSeconds: z.number().int().min(1).max(3600),
  /** `timer_increment_seconds` */
  timerIncrementSeconds: z.number().int().min(0).max(3600),
  /** `timer_forgiveness` */
  timerForgiveness: z.number().int().min(0).max(10),
  /** `pvp_countdown_seconds` */
  pvpCountdownSeconds: z.number().int().min(0).max(10),
  /** `death_on_round_loss` */
  deathOnRoundLoss: z.boolean(),
  /** `gold_on_life_loss` */
  goldOnLifeLoss: z.boolean(),
  /** `no_gold_on_round_loss` */
  noGoldOnRoundLoss: z.boolean(),
  /** `custom_seed` — `'random'` or a fixed seed. */
  customSeed: z.union([z.literal('random'), zSeed]),
  /** `the_order` */
  theOrder: z.boolean(),
  /** `hide_score_until_played` (D-02, default off) */
  hideScoreUntilPlayed: z.boolean(),
  /** `normal_bosses` (D-15) */
  normalBosses: z.boolean(),
  /** `different_seeds` (D-15) */
  differentSeeds: z.boolean(),
  /** `different_decks` (D-15) */
  differentDecks: z.boolean(),
  /** `random_loadout` (D-15) */
  randomLoadout: z.boolean(),
  /** `multiplayer_jokers` (D-15) */
  multiplayerJokers: z.boolean(),
  /** `modifier_layers` — Advanced toggles (LY-25); ruleset defaults are added on resolve. */
  modifierLayers: z.array(zLayerName).max(32),
  /** Test hook; production is fixed at 120 000. */
  seatGraceMs: z.number().int().min(1_000).max(600_000),
});
export type LobbyOptions = z.infer<typeof zLobbyOptions>;
export type LobbyOptionKey = keyof LobbyOptions;
export const LOBBY_OPTION_KEYS = Object.keys(zLobbyOptions.shape) as LobbyOptionKey[];
export const zLobbyOptionKey = z.enum(
  Object.keys(zLobbyOptions.shape) as [LobbyOptionKey, ...LobbyOptionKey[]],
);

/* ─── Resolved ruleset ───────────────────────────────────────────────────── */

export const zResolvedRuleset = z.object({
  key: zRulesetKey,
  layers: z.array(zLayerName).max(64),
  multiplayerContent: z.boolean(),
  banned: z.array(zKey).max(1024),
  bannedSilent: z.array(zKey).max(1024),
  included: z.array(zKey).max(1024),
  reworked: z.array(zKey).max(256),
  spectralBannedEnhancements: z.array(zKey).max(32),
  stickers: z.array(zKey).max(32),
  gameModifiers: z.record(
    z.string().max(64),
    z.union([z.number(), z.boolean(), z.string().max(256)]),
  ),
  startingParams: z.record(z.string().max(64), z.number()),
  /** Layer names whose Lua run-start hook must run, in order. */
  setupHooks: z.array(zLayerName).max(64),
  flags: z.object({
    theOrder: z.boolean(),
    enemyLocationDisabled: z.boolean(),
    timerDisplayThreshold: z.number().nullable(),
    comeback: z.enum(['default', 'majorleague', 'sandbox']),
  }),
  timer: z.object({
    enabled: z.boolean(),
    base: z.number(),
    increment: z.number(),
    forgiveness: z.number().int(),
    pvpBase: z.number().nullable(),
    pvpHandIncrement: z.number(),
    mode: z.enum(['default', 'pressure', 'no_animation', 'speedlatro']),
    pressurePlusHand: z.number(),
    countdown: z.number(),
    mult: z.number(),
  }),
});
export type ResolvedRuleset = z.infer<typeof zResolvedRuleset>;

/* ─── Started match ──────────────────────────────────────────────────────── */

export const zRosterEntry = z.object({
  id: zId,
  name: z.string().max(64),
  team: zTeam.optional(),
  blindCol: zBlindCol,
  avatarJoker: zKey,
});
export type RosterEntry = z.infer<typeof zRosterEntry>;

export const zStartedMatch = z.object({
  runId: zRunId,
  seed: zSeed,
  stake: zStake,
  mpStake: zMpStake.nullable(),
  deck: zKey,
  challenge: zKey.nullable(),
  /** different_seeds / different_decks / random_loadout */
  perPlayer: z
    .record(
      zId,
      z.object({ seed: zSeed.optional(), deck: zKey.optional(), stake: zStake.optional() }),
    )
    .optional(),
  queueMode: zQueueMode,
  shape: zShape,
  ruleset: zRulesetKey,
  layers: z.array(zLayerName).max(64),
  /** Resolved, forced options applied. */
  options: zLobbyOptions,
  resolved: zResolvedRuleset,
  roster: z.array(zRosterEntry).max(16),
  startedAt: z.number(),
  hostId: zId,
  contentHash: zContentHash,
});
export type StartedMatch = z.infer<typeof zStartedMatch>;

/* ─── Setup view (votes and draft, A1 §1.5–1.6) ──────────────────────────── */

export const zSetupOption = z.object({
  id: z.string().max(64),
  /** Votes for this option — only present once the vote has closed (reveal). */
  count: z.number().int().min(0).optional(),
  /** Lottery chance 0…1 — only present on reveal. */
  chance: z.number().min(0).max(1).optional(),
});

export const zDraftTile = z.object({
  deck: zKey,
  stake: zStake,
  state: z.enum(['open', 'banned', 'picked']),
});

export const zSetupView = z.object({
  stepId: z.string().max(32),
  kind: z.enum(['ruleset_vote', 'trap_vote', 'draft']),
  /** `voting` → `rolling` (1.2 s at 12 Hz) → `reveal` (3 s) → `done`; the draft uses `voting`/`done`. */
  phase: z.enum(['voting', 'rolling', 'reveal', 'done']),
  msLeft: z.number().int().min(0),
  options: z.array(zSetupOption).max(16),
  /** Connected voters that have voted / all connected voters. */
  voted: z.number().int().min(0),
  voters: z.number().int().min(0),
  /** The rolled option id (from `rolling` on), or the drafted deck. */
  result: z.string().max(64).nullable(),
  draft: z
    .object({
      tiles: z.array(zDraftTile).max(9),
      actor: zId.nullable(),
      action: z.enum(['ban', 'pick']),
      /** Bans/picks left for the current actor. */
      remaining: z.number().int().min(0),
    })
    .nullable(),
});
export type SetupView = z.infer<typeof zSetupView>;

/* ─── Game events (Lua → referee, §3.f) ──────────────────────────────────── */

const zHands = z.number().int().min(0).max(1000);
const zLives = z.number().int().min(0).max(100);

export const zGameEvent = z.discriminatedUnion('t', [
  z.object({ t: z.literal('set_ante'), ante: z.number().int().min(0).max(1000) }),
  z.object({ t: z.literal('new_round') }),
  z.object({ t: z.literal('ready_blind'), starting_hands: zHands }),
  z.object({ t: z.literal('unready_blind') }),
  z.object({
    t: z.literal('play_hand'),
    score: zScoreStr,
    hands_left: zHands,
    skips: z.number().int().min(0),
    lives: zLives.optional(),
  }),
  z.object({
    t: z.literal('skip'),
    skips: z.number().int().min(0),
    score: zScoreStr,
    hands_left: zHands,
    lives: zLives.optional(),
  }),
  z.object({
    t: z.literal('blind_result'),
    ante: z.number().int().min(0).max(1000),
    blind: zBlindSlot,
    beaten: z.boolean(),
  }),
  z.object({ t: z.literal('fail_round') }),
  z.object({ t: z.literal('fail_timer') }),
  z.object({ t: z.literal('fail_pvp_timer') }),
  z.object({ t: z.literal('furthest_blind'), value: z.number().int().min(0) }),
  z.object({ t: z.literal('redeem_ante_voucher') }),
  z.object({ t: z.literal('forfeit') }),
  z.object({ t: z.literal('seed_vote') }),
  z.object({ t: z.literal('draw_vote') }),
  z.object({ t: z.literal('result_request') }),
]);
export type GameEvent = z.infer<typeof zGameEvent>;
export type GameEventType = GameEvent['t'];

/* ─── Referee outputs (host → clients, "outcome") ───────────────────────── */

const zPairing = z.record(zId, z.union([zId, z.literal('')]));

export const zRefMsg = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('player_lives'),
    player_id: z.union([zId, z.literal('*all*')]),
    lives: zLives,
    lost: z.literal(1).optional(),
  }),
  z.object({ t: z.literal('team_lives'), team_id: zTeamAB, lives: zLives }),
  z.object({ t: z.literal('team_roster'), roster: z.record(zId, zTeam) }),
  z.object({ t: z.literal('nemesis_pairing'), pairing: zPairing, ante: z.number().int().min(0) }),
  z.object({ t: z.literal('team_card_target'), pairing: zPairing }),
  z.object({ t: z.literal('royale_target'), targets: zPairing }),
  z.object({ t: z.literal('manhunt_target'), target_id: z.union([zId, z.literal('')]) }),
  z.object({
    t: z.literal('team_score_board'),
    team_scores: z.object({ A: zScoreStr, B: zScoreStr }),
  }),
  z.object({
    t: z.literal('start_blind'),
    first_player: z.union([zId, z.literal('')]),
    starting_hands: z.record(zId, zHands),
  }),
  z.object({ t: z.literal('timer_hand_lost'), player_id: zId }),
  z.object({
    t: z.literal('end_pvp'),
    loser_id: z.union([zId, z.literal('')]),
    pvp_timer_lost: z.boolean(),
  }),
  z.object({
    t: z.literal('death_pending'),
    player_id: zId.optional(),
    opponent_id: zId.optional(),
    team_id: zTeam.optional(),
    blind_key: z.string().max(32),
  }),
  z.object({ t: z.literal('eliminated'), player_id: zId }),
  z.object({
    t: z.literal('win'),
    winner_id: zId.optional(),
    winner_team_id: zTeam.optional(),
    draw: z.literal(true).optional(),
    places: z.record(zId, z.number().int().min(1)).optional(),
  }),
  z.object({ t: z.literal('player_won'), player_id: zId }),
  z.object({ t: z.literal('reseed'), seed: zSeed }),
  z.object({ t: z.literal('speedrun'), player_id: zId }),
  z.object({
    t: z.literal('vote_progress'),
    kind: z.enum(['seed', 'draw']),
    k: z.number().int().min(0),
    n: z.number().int().min(0),
  }),
]);
export type RefMsg = z.infer<typeof zRefMsg>;
export type RefMsgType = RefMsg['t'];

export const zRefOutput = z.object({ to: z.union([z.literal('*'), zId]), msg: zRefMsg });
export type RefOutput = z.infer<typeof zRefOutput>;

/* ─── Referee checkpoint ─────────────────────────────────────────────────── */

/** A1 §4.6: `outBefore` = everyone already at 0 lives when this death happened. */
export const zPendingDeath = z.object({
  playerId: zId,
  /** `"<ante>:<Small|Big|Boss>"` */
  blindKey: z.string().max(32),
  outBefore: z.array(zId).max(16),
  /** 2-player pending only. */
  opponentId: zId.optional(),
});
export type PendingDeath = z.infer<typeof zPendingDeath>;

/** Manhunt/Teams: the side that died on `blindKey`; the other side must beat it. */
export const zTeamPending = z.object({ team: zTeam, blindKey: z.string().max(32) });
export type TeamPending = z.infer<typeof zTeamPending>;

const zBit = z.union([z.literal(0), z.literal(1)]);

export const zRefPlayer = z.object({
  score: zScoreStr,
  highest: zScoreStr,
  hands: zHands,
  lives: zLives,
  skips: z.number().int().min(0),
  ante: z.number().int().min(0),
  furthest: z.number().int().min(0),
  played: zBit,
  ready: zBit,
  first: zBit,
  blocker: zBit,
  team: zTeam.optional(),
  failedBlind: z.string().max(32).optional(),
  forfeited: zBit,
  readyAt: z.number().optional(),
  startingHands: zHands,
});

export const zRefCheckpoint = z.object({
  v: z.literal(1),
  runId: zRunId,
  seq: z.number().int().min(0),
  players: z.record(zId, zRefPlayer),
  pairing: zPairing,
  pairingAnte: z.number().int().min(0),
  usedPairs: z.array(z.string().max(160)).max(512),
  lastBye: zId.nullable(),
  teamLives: z.object({ A: zLives.optional(), B: zLives.optional() }),
  teamCardTargets: zPairing,
  eliminated: z.array(zId).max(16),
  pending: z.array(zPendingDeath).max(16),
  teamPending: zTeamPending.nullable(),
  /** key `"<ante>:<blind>"` → per player Beaten/Failed. */
  blindResults: z.record(z.string().max(32), z.record(zId, z.enum(['B', 'F']))),
  votes: z.object({
    seed: z.array(zId).max(16),
    draw: z.array(zId).max(16),
    openedAt: z.number().optional(),
  }),
  lastOutcome: zRefMsg.nullable(),
  winSentAt: z.array(z.number()).max(8),
  rngState: z.number().int(),
  startedAt: z.number(),
});
export type RefCheckpoint = z.infer<typeof zRefCheckpoint>;

/* ─── Referee inputs ─────────────────────────────────────────────────────── */

export const zRefInput = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('reset'),
    at: z.number(),
    match: zStartedMatch,
    rngSeed: z.number().int(),
  }),
  z.object({ t: z.literal('event'), at: z.number(), from: zId, e: zGameEvent }),
  z.object({
    t: z.literal('presence'),
    at: z.number(),
    id: zId,
    status: z.enum(['away', 'back', 'left', 'rejoined', 'grace_expired', 'catchup_expired']),
  }),
  z.object({ t: z.literal('tick'), at: z.number() }),
  /** Takeover after host migration. */
  z.object({
    t: z.literal('restore'),
    at: z.number(),
    checkpoint: zRefCheckpoint,
    present: z.array(zId).max(16),
  }),
]);
export type RefInput = z.infer<typeof zRefInput>;

/**
 * One referee step (§3.f). `S` is WS4's `RefState` (referee/referee.ts):
 *
 *     export function refStep(state: RefState | null, input: RefInput): RefStep<RefState>;  // PURE
 */
export interface RefStep<S> {
  state: S;
  out: RefOutput[];
  /** Non-null iff the state changed. */
  checkpoint: RefCheckpoint | null;
  /** Next tick needed: win re-sends +3 s/+8 s, vote expiry. */
  wakeAt: number | null;
  over: RefMsg | null;
}

/* ─── Lobby state (host-authoritative, §3.b) ─────────────────────────────── */

export const zLobbyPlayer = z.object({
  id: zId,
  name: z.string().max(64),
  avatarUrl: z.string().max(512).nullable(),
  avatarJoker: zKey,
  blindCol: zBlindCol,
  joinedAt: z.number(),
  ready: z.boolean(),
  team: zTeam.optional(),
  connected: z.boolean(),
  away: z.boolean(),
  catchingUp: z.boolean(),
  role: z.enum(['player', 'spectator']),
  conn: z.enum(['direct', 'turn', 'relay']),
  /** Optional packs this peer has mounted (EX-14; absent = none). */
  packs: z.array(zOptionalPack).max(4).optional(),
});
export type LobbyPlayer = z.infer<typeof zLobbyPlayer>;

export const zLobbyState = z.object({
  code: zCode,
  kind: zLobbyKind,
  queueMode: zQueueMode,
  hostId: zId,
  successorId: zId.nullable(),
  version: z.number().int().min(0),
  open: z.boolean(),
  players: z.array(zLobbyPlayer).max(24),
  options: zLobbyOptions,
  deck: zKey,
  stake: zStake,
  mpStake: zMpStake.nullable(),
  challenge: zKey.nullable(),
  started: zStartedMatch.nullable(),
  setup: zSetupView.nullable(),
  kicked: z.array(zId).max(256),
  /** userId → runId they forfeited. */
  forfeited: z.record(zId, zRunId),
});
export type LobbyState = z.infer<typeof zLobbyState>;

/* ─── Results, cards, replays ────────────────────────────────────────────── */

/** One opponent hand, for the reconnect tail (NET-07) and replay projection. */
export const zHandResult = z.object({
  ante: z.number().int().min(0),
  score: zScoreStr,
  hands_left: zHands,
  skips: z.number().int().min(0),
  lives: zLives.optional(),
  /** Host receive time (ms since the match started). */
  at: z.number().min(0),
});
export type HandResult = z.infer<typeof zHandResult>;

export const zJokerSummary = z.object({
  key: zKey,
  edition: z.string().max(32).nullable(),
  eternal: z.boolean(),
  perishable: z.boolean(),
});

/** §3.b `player_result`, kept per player for the end screen. */
export const zPlayerResult = z.object({
  jokers: z.array(zJokerSummary).max(64),
  deck_back: zKey,
  highest_pvp_score: zScoreStr,
  interim: z.boolean(),
});
export type PlayerResult = z.infer<typeof zPlayerResult>;

/**
 * A schema-validated card (traps, Magnet copies, phantoms). Never a Lua
 * table dump: WS6's `MP.card.build` rejects keys that are not in the
 * mounted registry.
 */
export const zSafeCard = z.object({
  key: zKey,
  edition: z.enum(['foil', 'holo', 'polychrome', 'negative']).nullable().optional(),
  seal: z.enum(['Red', 'Blue', 'Gold', 'Purple']).nullable().optional(),
  enhancement: zKey.nullable().optional(),
  /** Playing cards only. */
  front: z
    .object({
      suit: z.enum(['Hearts', 'Diamonds', 'Clubs', 'Spades']),
      rank: z.enum(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace']),
    })
    .optional(),
  eternal: z.boolean().optional(),
  perishable: z.boolean().optional(),
  rental: z.boolean().optional(),
  /** Whitelisted numeric/string ability fields (codec-owned, WS6). */
  extra: z
    .record(z.string().max(32), z.union([z.number(), z.string().max(64), z.boolean()]))
    .optional(),
});
export type SafeCard = z.infer<typeof zSafeCard>;

/** REP-01 opcodes (+ `net_trap`). */
export const zReplayOp = z.enum([
  'match_manifest',
  'lobby_info',
  'run_info',
  'manifest',
  'end',
  'chk',
  'money_delta',
  'sell',
  'cashout',
  'reroll',
  'hand_scored',
  'buy',
  'open_pack',
  'voucher',
  'use',
  'pack_pick',
  'pack_skip',
  'reorder',
  'play',
  'discard',
  'select_blind',
  'skip_blind',
  'leave_shop',
  'ready_blind',
  'set_ante_key',
  'hand_result',
  'round_dollars',
  'net_pizza',
  'net_magnet',
  'life_lost',
  'net_trap',
  /**
   * WS13: a network input as Lua received it (`{k:'outcome'|'peer'|'tail', d}`), so
   * playback re-applies referee outcomes and peer messages without the other peers.
   */
  'net_in',
]);
export type ReplayOp = z.infer<typeof zReplayOp>;

export const zReplayEvent = z.object({
  /** Per-player monotonic index. */
  i: z.number().int().min(0),
  /** ms since the run started. */
  t: z.number().min(0),
  op: zReplayOp,
  /** Op-specific payload (WS13 owns the per-op shapes). */
  d: z.record(z.string().max(64), z.unknown()),
});
export type ReplayEvent = z.infer<typeof zReplayEvent>;

/** One player's log so far (spectator `welcome`). */
export const zReplayBatch = z.object({
  id: zId,
  runId: zRunId,
  events: z.array(zReplayEvent).max(20_000),
});
export type ReplayBatch = z.infer<typeof zReplayBatch>;
