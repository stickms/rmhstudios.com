/**
 * Balatro multiplayer — rulesets as data (PLAN §2.9 RS-01…RS-15, A1 §3.2, A2 §0.2).
 *
 * A ruleset = an ordered list of layers, an optional explicit
 * `multiplayerContent`, the runtime modifiers it always adds
 * (`defaultModifiers`) and the lobby options it forces. Ban/rework lists
 * may also sit on the ruleset itself (Experimental Legacy).
 *
 * Where each is reachable (D-17): the five player-facing rulesets are in
 * the private picker; the ten dormant ones form the "Extra rulesets"
 * sub-cycle (private Lobby Options and Practice). Release is EX-14.
 */

import type { LobbyOptions } from '../types';
import type { LayerDef } from './layers';

export interface RulesetDef extends Pick<
  LayerDef,
  | 'banned'
  | 'bannedSilent'
  | 'reworked'
  | 'included'
  | 'spectralBannedEnhancements'
  | 'stickers'
  | 'gameModifiers'
  | 'startingParams'
> {
  key: string;
  /** The `ruleset_mp_<short>` suffix; a layer with this name joins the chain (A1 §3.1). */
  short: string;
  layers: readonly string[];
  /** Explicit value; beats every layer. */
  multiplayerContent?: boolean;
  defaultModifiers?: readonly string[];
  forceOptions?: Partial<LobbyOptions>;
  /** Extra-rulesets sub-cycle (D-17) rather than the main picker. */
  extra: boolean;
}

const defs: RulesetDef[] = [
  // RS-01
  {
    key: 'ruleset_mp_vanilla',
    short: 'vanilla',
    layers: [],
    multiplayerContent: false,
    forceOptions: { theOrder: false },
    extra: false,
  },
  // RS-02
  {
    key: 'ruleset_mp_balanced',
    short: 'balanced',
    layers: ['standard', 'ranked', 'pvp_timer'],
    extra: false,
  },
  // RS-03
  { key: 'ruleset_mp_expanded', short: 'expanded', layers: ['standard'], extra: false },
  // RS-04
  {
    key: 'ruleset_mp_smallworld',
    short: 'smallworld',
    layers: ['standard', 'smallworld'],
    extra: false,
  },
  // RS-05
  {
    key: 'ruleset_mp_majorleague',
    short: 'majorleague',
    layers: ['majorleague'],
    multiplayerContent: false,
    forceOptions: { timerBaseSeconds: 180, timerForgiveness: 0, theOrder: false },
    extra: false,
  },
  // RS-06
  {
    key: 'ruleset_mp_minorleague',
    short: 'minorleague',
    layers: [],
    multiplayerContent: false,
    forceOptions: { timerBaseSeconds: 210, timerForgiveness: 1, theOrder: true },
    extra: true,
  },
  // RS-07
  {
    key: 'ruleset_mp_sandbox',
    short: 'sandbox',
    layers: ['sandbox'],
    forceOptions: { theOrder: true, startingLives: 4 },
    extra: true,
  },
  // RS-08
  {
    key: 'ruleset_mp_badlatro',
    short: 'badlatro',
    layers: ['badlatro'],
    multiplayerContent: true,
    extra: true,
  },
  // RS-09
  {
    key: 'ruleset_mp_chaos',
    short: 'chaos',
    layers: ['standard', 'sandbox', 'smallworld', 'speedlatro_timer'],
    extra: true,
  },
  // RS-10
  {
    key: 'ruleset_mp_speedlatro',
    short: 'speedlatro',
    layers: ['standard', 'speedlatro_timer'],
    extra: true,
  },
  // RS-11
  {
    key: 'ruleset_mp_traditional',
    short: 'traditional',
    layers: ['standard'],
    forceOptions: { timer: false },
    extra: true,
  },
  // RS-12 (the `the_order` part only)
  {
    key: 'ruleset_mp_legacy_ranked',
    short: 'legacy_ranked',
    layers: ['classic', 'ranked'],
    multiplayerContent: false,
    forceOptions: { theOrder: true },
    extra: true,
  },
  // RS-13
  {
    key: 'ruleset_mp_wsob',
    short: 'wsob',
    layers: ['ranked', 'wsob'],
    multiplayerContent: false,
    extra: true,
  },
  // RS-14
  {
    key: 'ruleset_mp_experimental',
    short: 'experimental',
    layers: ['experimental'],
    multiplayerContent: true,
    defaultModifiers: ['pvp_timer', 'pressure_timer'],
    forceOptions: { theOrder: true },
    extra: true,
  },
  // RS-15
  {
    key: 'ruleset_mp_experimental_legacy',
    short: 'experimental_legacy',
    layers: ['classic'],
    multiplayerContent: true,
    forceOptions: { theOrder: true },
    bannedSilent: [
      'j_mp_pizza',
      'j_mp_penny_pincher',
      'j_mp_conjoined_joker',
      'j_mp_pacifist',
      'j_mp_defensive_joker',
      'j_mp_speedrun',
      'j_mp_skip_off',
      'j_mp_taxes',
      'j_hanging_chad',
    ],
    banned: ['c_justice', 'c_mp_asteroid'],
    reworked: ['j_mp_hanging_chad', 'j_mp_lets_go_gambling'],
    extra: true,
  },
];

export const RULESETS: Readonly<Record<string, RulesetDef>> = Object.freeze(
  Object.fromEntries(defs.map((d) => [d.key, Object.freeze(d)])),
);

export const RULESET_KEYS: readonly string[] = defs.map((d) => d.key);

export function getRuleset(key: string): RulesetDef | undefined {
  return Object.prototype.hasOwnProperty.call(RULESETS, key) ? RULESETS[key] : undefined;
}

/** LOB-06: the private-lobby ruleset cycle (Major League added by D-17). */
export const PRIVATE_RULESETS = [
  'ruleset_mp_vanilla',
  'ruleset_mp_balanced',
  'ruleset_mp_expanded',
  'ruleset_mp_smallworld',
  'ruleset_mp_majorleague',
] as const;

/** D-17: the "Extra rulesets" sub-cycle (private Lobby Options and Practice). */
export const EXTRA_RULESETS: readonly string[] = defs.filter((d) => d.extra).map((d) => d.key);

/** MM-03: the casual ruleset vote, in panel order. */
export const CASUAL_VOTE_RULESETS = [
  'ruleset_mp_vanilla',
  'ruleset_mp_majorleague',
  'ruleset_mp_balanced',
  'ruleset_mp_expanded',
] as const;

/** HUD-19 / PR-01: the Practice pillars (plus the extras). */
export const PRACTICE_RULESETS = [
  'ruleset_mp_balanced',
  'ruleset_mp_expanded',
  'ruleset_mp_vanilla',
  'ruleset_mp_smallworld',
] as const;

/** MM-04: the trap vote is only offered after one of these rolled. */
export const TRAP_VOTE_RULESETS = ['ruleset_mp_balanced', 'ruleset_mp_expanded'] as const;
