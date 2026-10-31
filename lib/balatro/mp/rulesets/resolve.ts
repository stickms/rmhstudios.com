/**
 * Balatro multiplayer — ruleset resolution (PLAN §0.10, RS-16, A1 §3.1).
 *
 * Composition rules:
 * - Chain = the ruleset's layers in order, then the layer named after the
 *   ruleset's short name (if one exists), then the runtime modifiers: the
 *   ruleset's `defaultModifiers`, `traps` (when `trapCards`), then the
 *   host's Advanced toggles. **Deduplicated** keeping the first occurrence
 *   (Small World's cull is not idempotent).
 * - Arrays concatenate across the chain (Attrition first, the ruleset's own
 *   lists last), deduplicated keeping first occurrence.
 * - Dicts (`gameModifiers`, `startingParams`) merge key-wise; a later layer
 *   wins; the ruleset's own dict wins over every layer.
 * - Scalars (`multiplayerContent`, flags, timer params): the last layer
 *   that sets one wins; the ruleset's own value always wins.
 * - Hooks are never merged: every hooked layer is listed in `setupHooks`.
 * - Pool isolation: trap packs are silently banned unless `traps` is in the
 *   chain; MP-original content is in the pool only when
 *   `resolved.multiplayerContent && options.multiplayerJokers`
 *   (`mpContentPooled`).
 * - D-23: a key that is both banned and reworked is dropped from `reworked`
 *   (the ban wins).
 * - A layer's `overrides` keys are first removed from every list built so far
 *   (bans, silent bans, reworks, included, spectral bans, Attrition's too), then the
 *   layer adds its own: the Glass cycle replaces the ruleset's Glass choice.
 */

import { requireResolvedRuleset } from '../wire-codec';
import type { LobbyOptionKey, LobbyOptions, ResolvedRuleset } from '../types';
import {
  ATTRITION_BANS,
  TRAP_PACKS,
  getLayer,
  type ComebackKind,
  type LayerDef,
  type TimerMode,
} from './layers';
import { applyForcedOptions, applyPracticeOptions, sanitizeModifierLayers } from './options';
import { getRuleset, type RulesetDef } from './rulesets';

export interface ResolveInput {
  options: LobbyOptions;
  /** Practice session (PR-02). */
  practice?: boolean;
}

export interface ResolveResult {
  resolved: ResolvedRuleset;
  /** The options with the forced values applied (what goes into StartedMatch.options). */
  options: LobbyOptions;
  /** Option keys the ruleset forced (shown locked, LOB-07). */
  locked: LobbyOptionKey[];
}

export class UnknownRulesetError extends Error {
  constructor(key: string) {
    super(`unknown ruleset ${key}`);
    this.name = 'UnknownRulesetError';
  }
}

function pushUnique(out: string[], seen: Set<string>, keys: readonly string[] | undefined): void {
  if (!keys) return;
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
}

/** The active layer chain for a ruleset and options (deduplicated, A1 §3.1). */
export function layerChain(rs: RulesetDef, options: LobbyOptions): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  const add = (names: readonly string[]) => {
    for (const n of names) {
      if (!getLayer(n) || seen.has(n)) continue;
      seen.add(n);
      chain.push(n);
    }
  };
  add(rs.layers);
  add([rs.short]);
  add(rs.defaultModifiers ?? []);
  if (options.trapCards) add(['traps']);
  add(sanitizeModifierLayers(options.modifierLayers));
  return chain;
}

/** Runtime modifiers that end up active (LY-25 `modifier_layers`, for the replay manifest). */
export function modifierLayersOf(rs: RulesetDef, options: LobbyOptions): string[] {
  const base = new Set([...rs.layers, rs.short]);
  return layerChain(rs, options).filter((l) => !base.has(l));
}

export function resolveRuleset(input: ResolveInput): ResolveResult {
  const rs = getRuleset(input.options.ruleset);
  if (!rs) throw new UnknownRulesetError(input.options.ruleset);
  return resolveDef(rs, input);
}

/** Resolve an explicit ruleset definition (resolveRuleset looks it up by key). */
export function resolveDef(rs: RulesetDef, input: ResolveInput): ResolveResult {
  const forced = applyForcedOptions(input.options, rs);
  const options = input.practice ? applyPracticeOptions(forced.options) : forced.options;
  const chain = layerChain(rs, options);
  const layers = chain.map((n) => getLayer(n) as LayerDef);
  const sources: Pick<
    LayerDef,
    | 'banned'
    | 'bannedSilent'
    | 'reworked'
    | 'included'
    | 'spectralBannedEnhancements'
    | 'stickers'
    | 'gameModifiers'
    | 'startingParams'
    | 'overrides'
  >[] = [...layers, rs];

  const lists = {
    banned: [] as string[],
    bannedSilent: [] as string[],
    reworked: [] as string[],
    included: [] as string[],
    spectralBannedEnhancements: [] as string[],
    stickers: [] as string[],
  };
  const seen = {
    banned: new Set<string>(),
    bannedSilent: new Set<string>(),
    reworked: new Set<string>(),
    included: new Set<string>(),
    spectralBannedEnhancements: new Set<string>(),
    stickers: new Set<string>(),
  };
  pushUnique(lists.banned, seen.banned, ATTRITION_BANS);
  for (const src of sources) {
    if (src.overrides && src.overrides.length > 0) {
      const drop = new Set(src.overrides);
      for (const f of Object.keys(lists) as (keyof typeof lists)[]) {
        lists[f] = lists[f].filter((k) => !drop.has(k));
        for (const k of drop) seen[f].delete(k);
      }
    }
    for (const f of Object.keys(lists) as (keyof typeof lists)[])
      pushUnique(lists[f], seen[f], src[f]);
  }
  if (!chain.includes('traps')) pushUnique(lists.bannedSilent, seen.bannedSilent, TRAP_PACKS);
  const allBans = new Set([...lists.banned, ...lists.bannedSilent]);
  lists.reworked = lists.reworked.filter((k) => !allBans.has(k));
  lists.included = lists.included.filter((k) => !allBans.has(k));

  const gameModifiers: Record<string, number | boolean | string> = {};
  const startingParams: Record<string, number> = {};
  for (const src of sources) {
    Object.assign(gameModifiers, src.gameModifiers ?? {});
    Object.assign(startingParams, src.startingParams ?? {});
  }

  let multiplayerContent = false;
  let enemyLocationDisabled = false;
  let timerDisplayThreshold: number | null = null;
  let comeback: ComebackKind = 'default';
  let pvpBase: number | null = null;
  let pvpHandIncrement = 0;
  let mode: TimerMode = 'default';
  let mult = 1;
  let pressurePlusHand = 0;
  for (const l of layers) {
    if (l.multiplayerContent !== undefined) multiplayerContent = l.multiplayerContent;
    if (l.flags?.enemyLocationDisabled !== undefined)
      enemyLocationDisabled = l.flags.enemyLocationDisabled;
    if (l.flags?.timerDisplayThreshold !== undefined)
      timerDisplayThreshold = l.flags.timerDisplayThreshold;
    if (l.flags?.comeback !== undefined) comeback = l.flags.comeback;
    if (l.timer?.pvpBase !== undefined) pvpBase = l.timer.pvpBase;
    if (l.timer?.pvpHandIncrement !== undefined) pvpHandIncrement = l.timer.pvpHandIncrement;
    if (l.timer?.mode !== undefined) mode = l.timer.mode;
    if (l.timer?.mult !== undefined) mult = l.timer.mult;
    if (l.timer?.pressurePlusHand !== undefined) pressurePlusHand = l.timer.pressurePlusHand;
  }
  if (rs.multiplayerContent !== undefined) multiplayerContent = rs.multiplayerContent;

  const resolved: ResolvedRuleset = {
    key: rs.key,
    layers: chain,
    multiplayerContent,
    ...lists,
    gameModifiers,
    startingParams,
    setupHooks: layers.filter((l) => l.hook).map((l) => l.name),
    flags: {
      theOrder: options.theOrder,
      enemyLocationDisabled,
      timerDisplayThreshold,
      comeback,
    },
    timer: {
      enabled: options.timer,
      // Rounded to 1e-6 so ×2/3 gives 100, not 99.99999999999999.
      base: Math.round(options.timerBaseSeconds * mult * 1e6) / 1e6,
      increment: options.timerIncrementSeconds,
      forgiveness: options.timerForgiveness,
      pvpBase,
      pvpHandIncrement,
      mode,
      pressurePlusHand,
      countdown: options.pvpCountdownSeconds,
      mult,
    },
  };
  // The frozen schema is the contract with Lua: fail loudly here, never on the wire.
  return { resolved: requireResolvedRuleset(resolved), options, locked: forced.locked };
}

/** RS-16 pool isolation: MP-original content is pooled only with both gates on. */
export function mpContentPooled(resolved: ResolvedRuleset, options: LobbyOptions): boolean {
  return resolved.multiplayerContent && options.multiplayerJokers;
}

/** LOB-08: MP decks/stakes/challenges show in the run-setup overlay. */
export function mpDecksVisible(resolved: ResolvedRuleset, showAnyway = false): boolean {
  return resolved.multiplayerContent || showAnyway;
}
