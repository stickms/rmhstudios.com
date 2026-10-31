/**
 * Balatro multiplayer — layers as data (PLAN §2.9 LY-01…LY-25, A1 §3.3, A2 §0.3).
 *
 * A layer is a bundle of bans, silent bans, reworked/included keys, game
 * modifiers, starting params, timer parameters and forced lobby options.
 * `resolve.ts` composes a ruleset's chain of layers into the ResolvedRuleset
 * the host broadcasts in `start_game`; Lua (WS6) applies it.
 *
 * Conventions shared with WS6 (documented in docs/balatro-mp.md):
 * - `gameModifiers` keys are merged into `G.GAME.modifiers`. A key with a
 *   dot is a nested path: `'no_blind_reward.Small': true` means
 *   `G.GAME.modifiers.no_blind_reward.Small = true` (vanilla stores that
 *   modifier as a table, and the frozen schema only carries scalars).
 *   Keys starting `mp_` are parameters for the layer's own Lua hook.
 * - `hook: true` puts the layer name in `ResolvedRuleset.setupHooks` (in
 *   chain order): Lua must run that layer's module (a run-start hook and/or
 *   a behaviour wrap that is only installed while the layer is active).
 * - D-39: the economy/esoteric mutators are only those vanilla already
 *   implements through `G.GAME.modifiers` (verified against data/balatro):
 *   inflation, no_interest, discard_cost, money_per_discard,
 *   no_blind_reward (spartan), booster_ante_scaling (pricey_packs),
 *   flipped_cards, debuff_played_cards, all_eternal, chips_dollar_cap
 *   (chip_cap: misc_functions.lua mod_chips caps chips at the money held) and
 *   minus_hand_size_per_X_dollar (shrinking_hand: CardArea:update shrinks the
 *   hand by 1 per $10).
 * - EX-18 lifted: the mod declares `no_uncommons` and the Glass cycle
 *   (`glass_vanilla`, `glass_standard`, `glass_legacy`, `glass_experimental`)
 *   as flag-only/empty layers. They are implemented natively from what their
 *   names and the mod's rulesets say (docs/balatro-mp-parity.md EX-18):
 *   no_uncommons remaps an Uncommon rarity roll to Common (rules/misc_layers.lua)
 *   and bans the Uncommon Tag; each glass_* layer gives Glass Cards that
 *   ruleset's treatment, replacing whatever the ruleset chose (`overrides`), and
 *   only one of them can be active (`group`).
 */

import type { LobbyOptions, ResolvedRuleset } from '../types';

export type TimerMode = ResolvedRuleset['timer']['mode'];
export type ComebackKind = ResolvedRuleset['flags']['comeback'];

export interface LayerDef {
  name: string;
  /** Scalar: the last layer that sets it wins; a ruleset's own value always wins. */
  multiplayerContent?: boolean;
  banned?: readonly string[];
  bannedSilent?: readonly string[];
  reworked?: readonly string[];
  included?: readonly string[];
  spectralBannedEnhancements?: readonly string[];
  stickers?: readonly string[];
  gameModifiers?: Readonly<Record<string, number | boolean | string>>;
  startingParams?: Readonly<Record<string, number>>;
  /** Lua must run this layer's module (see the header). */
  hook?: boolean;
  /** Lobby options this layer forces (the ruleset's own forced options win). */
  forceOptions?: Partial<LobbyOptions>;
  flags?: {
    enemyLocationDisabled?: boolean;
    timerDisplayThreshold?: number;
    comeback?: ComebackKind;
  };
  timer?: {
    pvpBase?: number;
    pvpHandIncrement?: number;
    mode?: TimerMode;
    /** Base multiplier (pressure ×2, no-animation ×2/3). */
    mult?: number;
    pressurePlusHand?: number;
  };
  /** May be toggled in private-lobby Advanced options (LY-25). */
  advanced?: boolean;
  /**
   * Advanced layers sharing a group are mutually exclusive: the UI clears the
   * others when one is picked, and sanitizeModifierLayers keeps only the first
   * of a group (in ADVANCED_LAYERS order).
   */
  group?: string;
  /**
   * Keys whose bans, silent bans, reworks and spectral bans from earlier in the
   * chain this layer clears before adding its own lists (a variant selector
   * that replaces the ruleset's choice, e.g. the Glass cycle).
   */
  overrides?: readonly string[];
}

/* ─── Shared key lists ───────────────────────────────────────────────────── */

/** FL-04 / A1 §2.1: Attrition bans every PvP match. */
export const ATTRITION_BANS = [
  'j_mr_bones',
  'j_luchador',
  'j_matador',
  'j_chicot',
  'v_hieroglyph',
  'v_petroglyph',
  'v_directors_cut',
  'v_retcon',
  'tag_boss',
  'bl_wall',
  'bl_final_vessel',
] as const;

export const TRAP_CARDS = [
  'c_mp_trap_glyph_of_warding',
  'c_mp_trap_symbol',
  'c_mp_trap_alarm',
  'c_mp_trap_explosive_runes',
  'c_mp_trap_sepia_snake_sigil',
  'c_mp_trap_fire_trap',
  'c_mp_trap_guards_and_wards',
  'c_mp_trap_magic_mouth',
  'c_mp_trap_snare',
  'c_mp_trap_arcane_lock',
  'c_mp_trap_programmed_illusion',
  'c_mp_trap_web',
  'c_mp_trap_forbiddance',
  'c_mp_trap_faithful_hound',
  'c_mp_trap_phase_door',
  'c_mp_trap_mental_prison',
] as const;

export const TRAP_PACKS = ['p_mp_trap_normal', 'p_mp_trap_jumbo'] as const;

export const STICKER_BALANCED = 'mp_sticker_balanced';
export const STICKER_EXTRA_CREDIT = 'mp_sticker_extra_credit';
export const EXPERIMENTAL_STICKERS = [
  'mp_sticker_persistent',
  'mp_sticker_unreliable',
  'mp_sticker_draining',
] as const;

/** A2 §0.3 badlatro joker bans (38). */
const BADLATRO_JOKERS = [
  'j_caino',
  'j_perkeo',
  'j_triboulet',
  'j_yorick',
  'j_blueprint',
  'j_ancient',
  'j_baron',
  'j_baseball',
  'j_dna',
  'j_family',
  'j_trio',
  'j_vagabond',
  'j_acrobat',
  'j_card_sharp',
  'j_cartomancer',
  'j_certificate',
  'j_dusk',
  'j_fibonacci',
  'j_hologram',
  'j_loyalty_card',
  'j_lucky_cat',
  'j_midas_mask',
  'j_bloodstone',
  'j_arrowhead',
  'j_onyx_agate',
  'j_selzer',
  'j_trading',
  'j_abstract',
  'j_blue_joker',
  'j_cavendish',
  'j_photograph',
  'j_hanging_chad',
  'j_mail',
  'j_brainstorm',
  'j_mime',
  'j_steel_joker',
  'j_reserved_parking',
  'j_mp_defensive_joker',
] as const;

/** Sandbox jokers in rotation (A2 §2.4, `active = true`). */
export const SANDBOX_ACTIVE_JOKERS = [
  'j_mp_misprint_sandbox',
  'j_mp_castle_sandbox',
  'j_mp_mail_sandbox',
  'j_mp_square_sandbox',
  'j_mp_throwback_sandbox',
  'j_mp_vampire_sandbox',
  'j_mp_steel_joker_sandbox',
  'j_mp_baseball_sandbox',
  'j_mp_hit_the_road_sandbox',
  'j_mp_golden_ticket_sandbox',
  'j_mp_idol_sandbox_zealot',
  'j_mp_idol_sandbox_collector',
] as const;

/** The two idols — the sandbox run-start hook keeps exactly one (LY-09). */
export const SANDBOX_IDOLS = ['j_mp_idol_sandbox_zealot', 'j_mp_idol_sandbox_collector'] as const;

/** Extra Credit jokers (A2 §2.5), 25 active (Alloy is not in rotation). */
export const EXTRA_CREDIT_JOKERS = [
  'j_mp_forklift_sandbox',
  'j_mp_doublerainbow_sandbox',
  'j_mp_starfruit_sandbox',
  'j_mp_pocketaces_sandbox',
  'j_mp_warlock_sandbox',
  'j_mp_candynecklace_sandbox',
  'j_mp_clowncollege_sandbox',
  'j_mp_montehaul_sandbox',
  'j_mp_espresso_sandbox',
  'j_mp_trafficlight_sandbox',
  'j_mp_farmer_sandbox',
  'j_mp_werewolf_sandbox',
  'j_mp_tuxedo_sandbox',
  'j_mp_ambrosia_sandbox',
  'j_mp_clowncar_sandbox',
  'j_mp_shipoftheseus_sandbox',
  'j_mp_gofish_sandbox',
  'j_mp_bobby_sandbox',
  'j_mp_pyromancer_sandbox',
  'j_mp_chainlightning_sandbox',
  'j_mp_jokalisa_sandbox',
  'j_mp_jokeroftheyear_sandbox',
  'j_mp_lucky7_sandbox',
  'j_mp_couponsheet_sandbox',
  'j_mp_hoarder_sandbox',
] as const;

/* ─── The layers ─────────────────────────────────────────────────────────── */

const defs: LayerDef[] = [
  // LY-01
  {
    name: 'standard',
    multiplayerContent: true,
    bannedSilent: [
      'j_hanging_chad',
      'j_ticket',
      'j_selzer',
      'j_turtle_bean',
      'j_bloodstone',
      'c_ouija',
    ],
    banned: ['j_mp_speedrun', 'j_mp_conjoined_joker', 'j_mp_defensive_joker', 'c_justice'],
    reworked: [
      'j_mp_hanging_chad',
      'j_mp_ticket',
      'j_mp_seltzer',
      'j_mp_turtle_bean',
      'j_mp_bloodstone',
      'c_mp_ouija_standard',
      'm_glass',
    ],
    stickers: [STICKER_BALANCED],
  },
  // LY-02 (`the_order` only; the engine-version check is OUT)
  { name: 'ranked', forceOptions: { theOrder: true } },
  // LY-03
  { name: 'pvp_timer', timer: { pvpBase: 60, pvpHandIncrement: 10 } },
  // LY-04 (the cull itself runs in Lua: it needs the game's pools and pseudoseed)
  { name: 'smallworld', hook: true, gameModifiers: { mp_smallworld_cull: 0.75 } },
  // LY-05
  {
    name: 'majorleague',
    bannedSilent: ['j_bloodstone'],
    reworked: ['j_mp_bloodstone'],
    stickers: [STICKER_BALANCED],
    flags: { enemyLocationDisabled: true, timerDisplayThreshold: 180, comeback: 'majorleague' },
  },
  // LY-06
  {
    name: 'classic',
    multiplayerContent: false,
    reworked: ['m_glass'],
    stickers: [STICKER_BALANCED],
  },
  // LY-07
  {
    name: 'wsob',
    bannedSilent: ['j_hanging_chad', 'j_bloodstone'],
    banned: ['c_justice'],
    reworked: ['j_mp_hanging_chad', 'j_mp_bloodstone', 'm_glass'],
    stickers: [STICKER_BALANCED],
  },
  // LY-08
  {
    name: 'badlatro',
    banned: [
      ...BADLATRO_JOKERS,
      'c_justice',
      'c_deja_vu',
      'c_trance',
      'v_magic_trick',
      'm_glass',
      'tag_uncommon',
      'tag_meteor',
      'tag_garbage',
      'tag_top_up',
      'tag_handy',
    ],
    spectralBannedEnhancements: ['m_glass'],
  },
  // LY-09 (idol keep-one runs in Lua; the "real EC mod present" rule is n/a)
  {
    name: 'sandbox',
    multiplayerContent: true,
    hook: true,
    bannedSilent: [
      'j_misprint',
      'j_castle',
      'j_mail',
      'j_square',
      'j_throwback',
      'j_vampire',
      'j_steel_joker',
      'j_baseball',
      'j_hit_the_road',
      'j_ticket',
      'j_idol',
      // Conjoined Joker's own gate excludes the sandbox layer (A2 §2.1).
      'j_mp_conjoined_joker',
    ],
    banned: [
      'j_hanging_chad',
      'c_ouija',
      'c_ectoplasm',
      'tag_rare',
      'tag_juggle',
      'tag_investment',
    ],
    reworked: [
      ...SANDBOX_ACTIVE_JOKERS,
      ...EXTRA_CREDIT_JOKERS,
      'j_mp_hanging_chad',
      'c_mp_ouija_standard',
      'c_mp_ectoplasm_sandbox',
      'm_glass',
      'tag_mp_gambling_sandbox',
      'tag_mp_juggle_sandbox',
      'tag_mp_investment_sandbox',
    ],
    stickers: [STICKER_BALANCED, STICKER_EXTRA_CREDIT],
    flags: { comeback: 'sandbox' },
  },
  // LY-10 (the run-start effects run in Lua; their numbers travel as mp_* params)
  {
    name: 'experimental',
    multiplayerContent: true,
    hook: true,
    bannedSilent: [
      'j_hanging_chad',
      'j_ticket',
      'j_selzer',
      'j_bloodstone',
      'c_ouija',
      'j_todo_list',
      'j_idol',
    ],
    banned: ['j_mp_speedrun', 'c_justice', 'm_glass'],
    reworked: [
      'j_mp_hanging_chad',
      'j_mp_ticket_experimental',
      'j_mp_seltzer',
      'j_mp_todo_list',
      'j_mp_bloodstone',
      'j_mp_idol_rare',
      'c_mp_ouija_standard',
      // D-23: listed as reworked AND banned; resolve() lets the ban win.
      'm_glass',
    ],
    stickers: [STICKER_BALANCED, ...EXPERIMENTAL_STICKERS],
    gameModifiers: {
      mp_shop_slots_bonus: 1,
      mp_ante_scaling_mult: 1.15,
      mp_reroll_increment_bonus: 1,
      mp_sticker_chance: 1 / 3,
    },
  },
  // LY-11 (trap packs are banned by resolve() whenever this layer is absent)
  { name: 'traps', included: [...TRAP_CARDS, ...TRAP_PACKS] },
  // LY-12
  { name: 'wraith_rework', advanced: true, bannedSilent: ['c_wraith'], reworked: ['c_mp_wraith'] },
  // LY-13
  { name: 'no_red_seals', advanced: true, hook: true, banned: ['c_deja_vu'] },
  // LY-14
  { name: 'eeeee', advanced: true, hook: true, gameModifiers: { mp_eeeee_chance: 0.4 } },
  // LY-15
  { name: 'polymorph_spam', advanced: true, hook: true },
  // LY-16 (D-03: as coded)
  { name: 'score_instability', advanced: true, hook: true },
  // LY-17
  {
    name: 'shared_pockets',
    advanced: true,
    hook: true,
    banned: ['j_stencil'],
    gameModifiers: { mp_shared_slots: 15 },
  },
  // LY-18 (D-03: ×4 Mult only)
  { name: 'glass_cannon', advanced: true, hook: true, gameModifiers: { mp_glass_cannon_xmult: 4 } },
  // EX-18 lifted: the Glass cycle. Each picks the Glass Card of the ruleset it
  // is named after, whatever the lobby's ruleset says (content/enhancements.lua):
  //   vanilla       X2 Mult, breaks 1 in 4 (no rework)
  //   standard      X1.5 Mult, breaks 1 in 4 (the standard/classic/wsob rework)
  //   legacy        Legacy Ranked's Glass (its `classic` layer): X1.5, 1 in 4
  //   experimental  the Experimental layer's ban (D-23): no Glass Cards, and
  //                 Justice (whose only effect makes Glass) is banned with them
  { name: 'glass_vanilla', advanced: true, group: 'glass', overrides: ['m_glass'] },
  {
    name: 'glass_standard',
    advanced: true,
    group: 'glass',
    overrides: ['m_glass'],
    reworked: ['m_glass'],
  },
  {
    name: 'glass_legacy',
    advanced: true,
    group: 'glass',
    overrides: ['m_glass'],
    reworked: ['m_glass'],
  },
  {
    name: 'glass_experimental',
    advanced: true,
    group: 'glass',
    overrides: ['m_glass'],
    banned: ['m_glass', 'c_justice'],
  },
  // LY-19
  { name: 'pressure_timer', timer: { mode: 'pressure', mult: 2 } },
  { name: 'pressure_timer_plus', timer: { pressurePlusHand: 15 } },
  // LY-20
  { name: 'no_animation_timer', timer: { mode: 'no_animation', mult: 2 / 3 } },
  // LY-21
  { name: 'speedlatro_timer', timer: { mode: 'speedlatro' } },
  // LY-22 economy mutators (D-39)
  { name: 'inflation', advanced: true, gameModifiers: { inflation: true } },
  { name: 'no_interest', advanced: true, gameModifiers: { no_interest: true } },
  { name: 'discard_tax', advanced: true, gameModifiers: { discard_cost: 1 } },
  { name: 'frugal', advanced: true, gameModifiers: { money_per_discard: 1 } },
  {
    name: 'spartan',
    advanced: true,
    gameModifiers: { 'no_blind_reward.Small': true, 'no_blind_reward.Big': true },
  },
  { name: 'pricey_packs', advanced: true, gameModifiers: { booster_ante_scaling: true } },
  // LY-22 esoteric mutators (D-39)
  { name: 'flipped_cards', advanced: true, gameModifiers: { flipped_cards: 4 } },
  { name: 'debuff_played_cards', advanced: true, gameModifiers: { debuff_played_cards: true } },
  { name: 'all_eternal', advanced: true, gameModifiers: { all_eternal: true } },
  { name: 'chip_cap', advanced: true, gameModifiers: { chips_dollar_cap: true } },
  { name: 'shrinking_hand', advanced: true, gameModifiers: { minus_hand_size_per_X_dollar: 10 } },
  // LY-23
  { name: 'gambling_opportunity', advanced: true, banned: ['m_gold', 'm_lucky'] },
  // EX-18 lifted: no Uncommon Jokers in shops, packs or Judgement — an
  // Uncommon rarity roll becomes Common (rules/misc_layers.lua) — and the
  // Uncommon Tag, which exists only to hand one out, is banned.
  { name: 'no_uncommons', advanced: true, hook: true, banned: ['tag_uncommon'] },
  // LY-24
  { name: 'bigger_shop', advanced: true, hook: true, gameModifiers: { mp_shop_slots_bonus: 1 } },
];

export const LAYERS: Readonly<Record<string, LayerDef>> = Object.freeze(
  Object.fromEntries(defs.map((d) => [d.name, Object.freeze(d)])),
);

export const LAYER_NAMES: readonly string[] = defs.map((d) => d.name);

/** Layers a private-lobby host may toggle in Advanced options (LY-25). */
export const ADVANCED_LAYERS: readonly string[] = defs.filter((d) => d.advanced).map((d) => d.name);

export function getLayer(name: string): LayerDef | undefined {
  return Object.prototype.hasOwnProperty.call(LAYERS, name) ? LAYERS[name] : undefined;
}
