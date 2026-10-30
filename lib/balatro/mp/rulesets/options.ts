/**
 * Balatro multiplayer — lobby options: defaults, shapes, forced options (A1 §1.3, §2.2; LOB-06/07).
 *
 * Forced options (A1 §1.3): `the_order` is first reset to on, then every
 * layer of the ruleset's chain applies its `forceOptions` in chain order,
 * then the ruleset's own `forceOptions` (which win). The forced keys are
 * reported as `locked` so the UI shows them locked (LOB-07).
 */

import {
  zLobbyOptions,
  type LobbyOptionKey,
  type LobbyOptions,
  type QueueMode,
  type Shape,
} from '../types';
import { ADVANCED_LAYERS, getLayer } from './layers';
import { getRuleset, type RulesetDef } from './rulesets';

/** A1 §1.3 defaults (seatGraceMs = the production 120 s grace). */
export const DEFAULT_LOBBY_OPTIONS: Readonly<LobbyOptions> = Object.freeze({
  ruleset: 'ruleset_mp_balanced',
  gamemode: 'gamemode_mp_attrition',
  trapCards: false,
  manhuntHunterLives: 7,
  startingLives: 4,
  pvpStartRound: 2,
  timer: true,
  timerBaseSeconds: 150,
  timerIncrementSeconds: 60,
  timerForgiveness: 0,
  pvpCountdownSeconds: 3,
  deathOnRoundLoss: true,
  goldOnLifeLoss: true,
  noGoldOnRoundLoss: false,
  customSeed: 'random',
  theOrder: true,
  hideScoreUntilPlayed: false,
  normalBosses: false,
  differentSeeds: false,
  differentDecks: false,
  randomLoadout: false,
  multiplayerJokers: true,
  modifierLayers: [],
  seatGraceMs: 120_000,
} satisfies LobbyOptions);

/** A1 §2.2: the shape flags for each queue mode. */
export function shapeFor(queueMode: QueueMode, practice = false): Shape {
  const shape: Shape = {
    nemesisPairing: queueMode === 'pvp_nemesis',
    manhunt: queueMode === 'pvp_manhunt',
    teamBased: queueMode === 'pvp_teams',
  };
  if (practice) shape.practice = true;
  return shape;
}

/** A1 §2.2: every queue mode defaults to Balanced except Small World. */
export function defaultRulesetFor(queueMode: QueueMode): string {
  return queueMode === 'pvp_smallworld' ? 'ruleset_mp_smallworld' : 'ruleset_mp_balanced';
}

/** Fresh options for a new lobby of this queue mode. */
export function defaultOptionsFor(queueMode: QueueMode): LobbyOptions {
  return { ...DEFAULT_LOBBY_OPTIONS, modifierLayers: [], ruleset: defaultRulesetFor(queueMode) };
}

/** Max players (A1 §1.1): public Nemesis is 1v1; everything else up to 16. */
export function maxPlayersFor(queueMode: QueueMode, kind: 'private' | 'casual' | 'party'): number {
  if (kind === 'casual' && queueMode === 'pvp_nemesis') return 2;
  return 16;
}

/**
 * Keep only Advanced-toggleable layers, in a stable order, deduplicated
 * (LY-25). Ruleset defaults and `traps` are added by resolve(), not here.
 */
export function sanitizeModifierLayers(layers: readonly string[]): string[] {
  const want = new Set(layers);
  return ADVANCED_LAYERS.filter((l) => want.has(l));
}

/**
 * Parse untrusted options (e.g. a host's edit) over a base, field by field:
 * a field that fails validation keeps the base value. Never throws.
 */
export function sanitizeOptions(
  input: unknown,
  base: LobbyOptions = DEFAULT_LOBBY_OPTIONS,
): LobbyOptions {
  const out: LobbyOptions = { ...base, modifierLayers: [...base.modifierLayers] };
  if (!input || typeof input !== 'object') return out;
  const shape = zLobbyOptions.shape;
  const rec = input as Record<string, unknown>;
  for (const key of Object.keys(shape) as LobbyOptionKey[]) {
    if (!(key in rec)) continue;
    const parsed = shape[key].safeParse(rec[key]);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }
  if (!getRuleset(out.ruleset)) out.ruleset = base.ruleset;
  out.modifierLayers = sanitizeModifierLayers(out.modifierLayers);
  return out;
}

export interface ForcedResult {
  options: LobbyOptions;
  locked: LobbyOptionKey[];
}

/**
 * Apply a ruleset's forced options (A1 §1.3; RS-16). Unknown rulesets are
 * left as they are (resolve() rejects them separately).
 */
export function applyForcedOptions(options: LobbyOptions, def?: RulesetDef): ForcedResult {
  const out: LobbyOptions = {
    ...options,
    modifierLayers: [...options.modifierLayers],
    theOrder: true,
  };
  const locked = new Set<LobbyOptionKey>();
  const rs = def ?? getRuleset(options.ruleset);
  if (!rs) return { options: out, locked: [] };
  const forced: Partial<LobbyOptions>[] = [];
  for (const name of rs.layers) {
    const l = getLayer(name);
    if (l?.forceOptions) forced.push(l.forceOptions);
  }
  const own = getLayer(rs.short);
  if (own?.forceOptions && !rs.layers.includes(rs.short)) forced.push(own.forceOptions);
  if (rs.forceOptions) forced.push(rs.forceOptions);
  for (const f of forced) {
    for (const [k, v] of Object.entries(f) as [LobbyOptionKey, unknown][]) {
      (out as Record<string, unknown>)[k] = v;
      locked.add(k);
    }
  }
  return { options: out, locked: [...locked] };
}

/**
 * Practice (PR-02): The Order always on, PvP from ante 2, no timer. Lives
 * and fails are switched off by the referee's practice shape.
 */
export function applyPracticeOptions(options: LobbyOptions): LobbyOptions {
  return { ...options, theOrder: true, pvpStartRound: 2, timer: false };
}
