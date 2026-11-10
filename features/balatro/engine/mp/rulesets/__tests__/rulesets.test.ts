/**
 * Rulesets and layers (RS-01…RS-16, LY-01…LY-25): every ruleset resolves to a
 * schema-valid bundle with the exact chain, flags, timer and forced options;
 * composition rules hold; every vanilla key the data names exists in the
 * shipped game source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { zResolvedRuleset, type LobbyOptions } from '../../types';
import {
  ADVANCED_LAYERS,
  ATTRITION_BANS,
  EXPERIMENTAL_STICKERS,
  EXTRA_CREDIT_JOKERS,
  LAYERS,
  LAYER_NAMES,
  SANDBOX_ACTIVE_JOKERS,
  TRAP_CARDS,
  TRAP_PACKS,
  getLayer,
} from '../layers';
import {
  DEFAULT_LOBBY_OPTIONS,
  applyForcedOptions,
  applyPracticeOptions,
  defaultOptionsFor,
  defaultRulesetFor,
  maxPlayersFor,
  sanitizeModifierLayers,
  sanitizeOptions,
  shapeFor,
} from '../options';
import {
  UnknownRulesetError,
  layerChain,
  modifierLayersOf,
  mpContentPooled,
  mpDecksVisible,
  resolveDef,
  resolveRuleset,
} from '../resolve';
import {
  CASUAL_VOTE_RULESETS,
  EXTRA_RULESETS,
  PRACTICE_RULESETS,
  PRIVATE_RULESETS,
  RULESETS,
  RULESET_KEYS,
  TRAP_VOTE_RULESETS,
  getRuleset,
  requiredPacks,
  type RulesetDef,
} from '../rulesets';

const opts = (o: Partial<LobbyOptions> = {}): LobbyOptions => ({
  ...DEFAULT_LOBBY_OPTIONS,
  modifierLayers: [],
  ...o,
});
const resolve = (ruleset: string, o: Partial<LobbyOptions> = {}, practice = false) =>
  resolveRuleset({ options: opts({ ruleset, ...o }), practice });

/** Golden table: chain, MP content, the_order, comeback, timer essentials (A1 §3.2, A2 §0.2). */
const GOLDEN: Record<
  string,
  {
    chain: string[];
    mp: boolean;
    order: boolean;
    comeback: 'default' | 'majorleague' | 'sandbox';
    timer: Partial<{
      enabled: boolean;
      base: number;
      forgiveness: number;
      pvpBase: number | null;
      mode: string;
      mult: number;
    }>;
    hooks: string[];
    locked: string[];
  }
> = {
  ruleset_mp_vanilla: {
    chain: [],
    mp: false,
    order: false,
    comeback: 'default',
    timer: { base: 150, pvpBase: null, mode: 'default' },
    hooks: [],
    locked: ['theOrder'],
  },
  ruleset_mp_balanced: {
    chain: ['standard', 'ranked', 'pvp_timer'],
    mp: true,
    order: true,
    comeback: 'default',
    timer: { base: 150, pvpBase: 60 },
    hooks: [],
    locked: ['theOrder'],
  },
  ruleset_mp_expanded: {
    chain: ['standard'],
    mp: true,
    order: true,
    comeback: 'default',
    timer: { base: 150, pvpBase: null },
    hooks: [],
    locked: [],
  },
  ruleset_mp_smallworld: {
    chain: ['standard', 'smallworld'],
    mp: true,
    order: true,
    comeback: 'default',
    timer: { pvpBase: null },
    hooks: ['smallworld'],
    locked: [],
  },
  ruleset_mp_majorleague: {
    chain: ['majorleague'],
    mp: false,
    order: false,
    comeback: 'majorleague',
    timer: { base: 180, forgiveness: 0 },
    hooks: [],
    locked: ['timerBaseSeconds', 'timerForgiveness', 'theOrder', 'previewDisabled'],
  },
  ruleset_mp_minorleague: {
    chain: [],
    mp: false,
    order: true,
    comeback: 'default',
    timer: { base: 210, forgiveness: 1 },
    hooks: [],
    locked: ['timerBaseSeconds', 'timerForgiveness', 'theOrder'],
  },
  ruleset_mp_sandbox: {
    chain: ['sandbox'],
    mp: true,
    order: true,
    comeback: 'sandbox',
    timer: {},
    hooks: ['sandbox'],
    locked: ['theOrder', 'startingLives', 'previewDisabled'],
  },
  ruleset_mp_badlatro: {
    chain: ['badlatro'],
    mp: true,
    order: true,
    comeback: 'default',
    timer: {},
    hooks: [],
    locked: [],
  },
  ruleset_mp_chaos: {
    chain: ['standard', 'sandbox', 'smallworld', 'speedlatro_timer'],
    mp: true,
    order: true,
    comeback: 'sandbox',
    timer: { mode: 'speedlatro' },
    hooks: ['sandbox', 'smallworld'],
    locked: [],
  },
  ruleset_mp_speedlatro: {
    chain: ['standard', 'speedlatro_timer'],
    mp: true,
    order: true,
    comeback: 'default',
    timer: { mode: 'speedlatro' },
    hooks: [],
    locked: [],
  },
  ruleset_mp_traditional: {
    chain: ['standard'],
    mp: true,
    order: true,
    comeback: 'default',
    timer: { enabled: false },
    hooks: [],
    locked: ['timer'],
  },
  ruleset_mp_legacy_ranked: {
    chain: ['classic', 'ranked'],
    mp: false,
    order: true,
    comeback: 'default',
    timer: {},
    hooks: [],
    locked: ['theOrder'],
  },
  ruleset_mp_wsob: {
    chain: ['ranked', 'wsob'],
    mp: false,
    order: true,
    comeback: 'default',
    timer: {},
    hooks: [],
    locked: ['theOrder'],
  },
  ruleset_mp_experimental: {
    chain: ['experimental', 'pvp_timer', 'pressure_timer'],
    mp: true,
    order: true,
    comeback: 'default',
    timer: { mode: 'pressure', mult: 2, base: 300, pvpBase: 60 },
    hooks: ['experimental'],
    locked: ['theOrder'],
  },
  ruleset_mp_experimental_legacy: {
    chain: ['classic'],
    mp: true,
    order: true,
    comeback: 'default',
    timer: {},
    hooks: [],
    locked: ['theOrder'],
  },
  // RS-17 (EX-14 lifted): nothing forced (The Order keeps its reset-to-on default).
  ruleset_mp_release: {
    chain: ['release'],
    mp: false,
    order: true,
    comeback: 'default',
    timer: {},
    hooks: ['release'],
    locked: [],
  },
};

describe('every ruleset (RS-01…RS-15, RS-17)', () => {
  it('the golden table covers every registered ruleset', () => {
    expect(Object.keys(GOLDEN).sort()).toEqual([...RULESET_KEYS].sort());
    expect(RULESET_KEYS).toHaveLength(16);
  });

  for (const [key, g] of Object.entries(GOLDEN)) {
    describe(key, () => {
      const { resolved, options, locked } = resolve(key, { theOrder: !g.order });
      it('validates against the frozen schema', () => {
        expect(zResolvedRuleset.safeParse(resolved).success).toBe(true);
        expect(resolved.key).toBe(key);
      });
      it('has the documented chain, content flag and the_order', () => {
        expect(resolved.layers).toEqual(g.chain);
        expect(resolved.multiplayerContent).toBe(g.mp);
        expect(resolved.flags.theOrder).toBe(g.order);
        expect(options.theOrder).toBe(g.order);
        expect(resolved.flags.comeback).toBe(g.comeback);
        expect(resolved.setupHooks).toEqual(g.hooks);
        expect([...locked].sort()).toEqual([...g.locked].sort());
      });
      it('has the documented timer', () => {
        expect(resolved.timer).toMatchObject(g.timer);
        expect(resolved.timer.countdown).toBe(3);
        expect(resolved.timer.increment).toBe(60);
      });
      it('always carries the Attrition bans first (FL-04)', () => {
        expect(resolved.banned.slice(0, ATTRITION_BANS.length)).toEqual([...ATTRITION_BANS]);
      });
      it('has no duplicates in any list and no banned key left in reworked/included', () => {
        for (const list of [
          resolved.banned,
          resolved.bannedSilent,
          resolved.reworked,
          resolved.included,
          resolved.stickers,
        ]) {
          expect(new Set(list).size).toBe(list.length);
        }
        const bans = new Set([...resolved.banned, ...resolved.bannedSilent]);
        for (const k of [...resolved.reworked, ...resolved.included])
          expect(bans.has(k)).toBe(false);
      });
      it('bans the trap packs unless traps is on (LY-11)', () => {
        expect(resolved.bannedSilent).toEqual(expect.arrayContaining([...TRAP_PACKS]));
        expect(resolved.included.some((k) => k.startsWith('c_mp_trap_'))).toBe(false);
        const withTraps = resolve(key, { trapCards: true }).resolved;
        expect(withTraps.layers[withTraps.layers.length - 1]).toBe('traps');
        expect(
          withTraps.bannedSilent.some((k) => (TRAP_PACKS as readonly string[]).includes(k)),
        ).toBe(false);
        expect(withTraps.included).toEqual(expect.arrayContaining([...TRAP_CARDS, ...TRAP_PACKS]));
      });
      it('is idempotent and deterministic', () => {
        expect(resolve(key, { theOrder: !g.order })).toEqual(resolve(key, { theOrder: !g.order }));
      });
    });
  }
});

describe('layer contents', () => {
  it('standard: silent vanilla bans with MP reworks, loud bans, Glass rework (LY-01)', () => {
    const r = resolve('ruleset_mp_expanded').resolved;
    expect(r.bannedSilent).toEqual(
      expect.arrayContaining([
        'j_hanging_chad',
        'j_ticket',
        'j_selzer',
        'j_turtle_bean',
        'j_bloodstone',
        'c_ouija',
      ]),
    );
    expect(r.banned).toEqual(
      expect.arrayContaining([
        'j_mp_speedrun',
        'j_mp_conjoined_joker',
        'j_mp_defensive_joker',
        'c_justice',
      ]),
    );
    expect(r.reworked).toEqual(
      expect.arrayContaining([
        'j_mp_hanging_chad',
        'j_mp_ticket',
        'j_mp_seltzer',
        'j_mp_turtle_bean',
        'j_mp_bloodstone',
        'c_mp_ouija_standard',
        'm_glass',
      ]),
    );
    expect(r.stickers).toEqual(['mp_sticker_balanced']);
  });
  it('majorleague: enemy location off, threshold 180, comeback (LY-05)', () => {
    const r = resolve('ruleset_mp_majorleague').resolved;
    expect(r.flags).toMatchObject({
      enemyLocationDisabled: true,
      timerDisplayThreshold: 180,
      comeback: 'majorleague',
    });
    expect(r.bannedSilent).toContain('j_bloodstone');
    expect(r.reworked).toEqual(['j_mp_bloodstone']);
  });
  it('experimental: Glass ban wins over its rework (D-23), stickers and params (LY-10)', () => {
    const r = resolve('ruleset_mp_experimental').resolved;
    expect(r.banned).toContain('m_glass');
    expect(r.reworked).not.toContain('m_glass');
    expect(r.reworked).toEqual(
      expect.arrayContaining(['j_mp_idol_rare', 'j_mp_todo_list', 'j_mp_ticket_experimental']),
    );
    expect(r.stickers).toEqual(expect.arrayContaining([...EXPERIMENTAL_STICKERS]));
    expect(r.gameModifiers).toMatchObject({
      mp_shop_slots_bonus: 1,
      mp_ante_scaling_mult: 1.15,
      mp_reroll_increment_bonus: 1,
    });
    expect(r.gameModifiers.mp_sticker_chance).toBeCloseTo(1 / 3);
  });
  it('sandbox: active sandbox jokers + 25 Extra Credit jokers, tag swaps, idols (LY-09)', () => {
    const r = resolve('ruleset_mp_sandbox').resolved;
    expect(EXTRA_CREDIT_JOKERS).toHaveLength(25);
    expect(r.reworked).toEqual(
      expect.arrayContaining([...SANDBOX_ACTIVE_JOKERS, ...EXTRA_CREDIT_JOKERS]),
    );
    expect(r.banned).toEqual(
      expect.arrayContaining(['tag_rare', 'tag_juggle', 'tag_investment', 'c_ectoplasm']),
    );
    expect(r.bannedSilent).toEqual(
      expect.arrayContaining(['j_misprint', 'j_idol', 'j_mp_conjoined_joker']),
    );
    expect(r.stickers).toEqual(['mp_sticker_balanced', 'mp_sticker_extra_credit']);
  });
  it('badlatro: 38 jokers + consumables + tags, Glass off spectral rolls (LY-08)', () => {
    const r = resolve('ruleset_mp_badlatro').resolved;
    expect(r.banned.filter((k) => k.startsWith('j_'))).toHaveLength(38 + 4); // + Attrition's 4 jokers
    expect(r.spectralBannedEnhancements).toEqual(['m_glass']);
    expect(r.banned).toEqual(
      expect.arrayContaining(['c_deja_vu', 'c_trance', 'v_magic_trick', 'tag_handy']),
    );
  });
  it('experimental legacy: ruleset-level bans; only Let’s Go Gambling survives', () => {
    const r = resolve('ruleset_mp_experimental_legacy').resolved;
    expect(r.bannedSilent).toEqual(
      expect.arrayContaining(['j_mp_pizza', 'j_mp_taxes', 'j_mp_pacifist']),
    );
    expect(r.banned).toEqual(expect.arrayContaining(['c_justice', 'c_mp_asteroid']));
    expect(r.reworked).toEqual(['m_glass', 'j_mp_hanging_chad', 'j_mp_lets_go_gambling']);
    expect(r.multiplayerContent).toBe(true); // ruleset beats the classic layer
  });
  it('wsob, classic, ranked', () => {
    expect(resolve('ruleset_mp_wsob').resolved.bannedSilent).toEqual(
      expect.arrayContaining(['j_hanging_chad', 'j_bloodstone']),
    );
    expect(resolve('ruleset_mp_legacy_ranked').resolved.reworked).toEqual(['m_glass']);
    expect(getLayer('ranked')?.forceOptions).toEqual({ theOrder: true });
  });
  it('every layer has a unique name and the advanced list is LY-12…18, 22…24', () => {
    expect(new Set(LAYER_NAMES).size).toBe(LAYER_NAMES.length);
    expect([...ADVANCED_LAYERS]).toEqual([
      'wraith_rework',
      'no_red_seals',
      'eeeee',
      'polymorph_spam',
      'score_instability',
      'shared_pockets',
      'glass_cannon',
      'glass_vanilla',
      'glass_standard',
      'glass_legacy',
      'glass_experimental',
      'inflation',
      'no_interest',
      'discard_tax',
      'frugal',
      'spartan',
      'pricey_packs',
      'flipped_cards',
      'debuff_played_cards',
      'all_eternal',
      'chip_cap',
      'shrinking_hand',
      'gambling_opportunity',
      'no_uncommons',
      'bigger_shop',
      'nemesis_sticker',
      'judgement_rework',
    ]);
    expect(getLayer('nope')).toBeUndefined();
    expect(getLayer('toString')).toBeUndefined();
  });
  it('the D-39 mutators map onto vanilla G.GAME.modifiers keys', () => {
    const r = resolve('ruleset_mp_vanilla', {
      modifierLayers: ['spartan', 'discard_tax', 'frugal', 'pricey_packs', 'flipped_cards'],
    }).resolved;
    expect(r.gameModifiers).toEqual({
      'no_blind_reward.Small': true,
      'no_blind_reward.Big': true,
      discard_cost: 1,
      money_per_discard: 1,
      booster_ante_scaling: true,
      flipped_cards: 4,
    });
  });
  it('chip_cap and shrinking_hand are vanilla challenge modifiers (EX-18 lifted)', () => {
    const r = resolve('ruleset_mp_vanilla', {
      modifierLayers: ['shrinking_hand', 'chip_cap'],
    }).resolved;
    expect(r.gameModifiers).toEqual({ chips_dollar_cap: true, minus_hand_size_per_X_dollar: 10 });
    expect(r.layers.slice(-2)).toEqual(['chip_cap', 'shrinking_hand']);
    expect(r.setupHooks).not.toContain('chip_cap');
  });
});

describe('EX-18 lifted: no_uncommons and the Glass cycle', () => {
  it('no_uncommons bans the Uncommon Tag and runs its Lua wrap', () => {
    const r = resolve('ruleset_mp_balanced', { modifierLayers: ['no_uncommons'] }).resolved;
    expect(r.banned).toContain('tag_uncommon');
    expect(r.setupHooks).toContain('no_uncommons');
    expect(r.layers.at(-1)).toBe('no_uncommons');
  });
  it('glass_vanilla clears the ruleset rework and bans', () => {
    expect(resolve('ruleset_mp_balanced').resolved.reworked).toContain('m_glass');
    const bal = resolve('ruleset_mp_balanced', { modifierLayers: ['glass_vanilla'] }).resolved;
    expect(bal.reworked).not.toContain('m_glass');
    expect(bal.banned).not.toContain('m_glass');
    const bad = resolve('ruleset_mp_badlatro', { modifierLayers: ['glass_vanilla'] }).resolved;
    expect(bad.banned).not.toContain('m_glass');
    expect(bad.spectralBannedEnhancements).not.toContain('m_glass');
    // Everything else the ruleset bans stays banned.
    expect(bad.banned).toContain('c_justice');
    expect(bad.banned).toContain('tag_uncommon');
  });
  it('glass_standard and glass_legacy rework Glass even where the ruleset bans it', () => {
    for (const layer of ['glass_standard', 'glass_legacy']) {
      const exp = resolve('ruleset_mp_experimental', { modifierLayers: [layer] }).resolved;
      expect(exp.banned).not.toContain('m_glass');
      expect(exp.reworked).toContain('m_glass');
      // The Experimental layer's own Justice ban is not Glass's to undo.
      expect(exp.banned).toContain('c_justice');
      const van = resolve('ruleset_mp_vanilla', { modifierLayers: [layer] }).resolved;
      expect(van.reworked).toEqual(['m_glass']);
    }
  });
  it('glass_experimental bans Glass and Justice and drops the rework', () => {
    const r = resolve('ruleset_mp_balanced', { modifierLayers: ['glass_experimental'] }).resolved;
    expect(r.banned).toEqual(expect.arrayContaining(['m_glass', 'c_justice']));
    expect(r.reworked).not.toContain('m_glass');
  });
  it('the Glass cycle is one choice: only the first picked survives sanitizing', () => {
    expect(
      sanitizeModifierLayers([
        'glass_experimental',
        'no_uncommons',
        'glass_standard',
        'glass_cannon',
      ]),
    ).toEqual(['glass_cannon', 'glass_standard', 'no_uncommons']);
    const r = resolve('ruleset_mp_balanced', {
      modifierLayers: ['glass_vanilla', 'glass_experimental'],
    }).resolved;
    expect(r.layers.filter((l) => l.startsWith('glass_'))).toEqual(['glass_vanilla']);
    expect(r.banned).not.toContain('m_glass');
  });
  it('a ruleset without Glass choices is unchanged by overrides of absent keys', () => {
    const a = resolve('ruleset_mp_vanilla').resolved;
    const b = resolve('ruleset_mp_vanilla', { modifierLayers: ['glass_vanilla'] }).resolved;
    expect(b.banned).toEqual(a.banned);
    expect(b.reworked).toEqual(a.reworked);
  });
});

describe('composition rules (RS-16)', () => {
  const synthetic = (over: Partial<RulesetDef>): RulesetDef => ({
    key: 'ruleset_mp_test',
    short: 'test',
    layers: [],
    extra: true,
    ...over,
  });

  it('chain order: layers, own-name layer, default modifiers, traps, advanced — deduplicated', () => {
    const rs = synthetic({
      short: 'smallworld',
      layers: ['standard', 'smallworld', 'standard'],
      defaultModifiers: ['smallworld', 'pvp_timer'],
    });
    const chain = layerChain(
      rs,
      opts({ trapCards: true, modifierLayers: ['bigger_shop', 'eeeee', 'bigger_shop'] }),
    );
    expect(chain).toEqual(['standard', 'smallworld', 'pvp_timer', 'traps', 'eeeee', 'bigger_shop']);
  });
  it('the own-name layer joins the chain when the ruleset does not list it', () => {
    expect(layerChain(synthetic({ short: 'majorleague' }), opts())).toEqual(['majorleague']);
  });
  it('unknown layer names are skipped; non-advanced modifier toggles are ignored', () => {
    expect(
      layerChain(
        synthetic({ layers: ['standard', 'nope'] }),
        opts({ modifierLayers: ['pvp_timer', 'standard', 'eeeee'] }),
      ),
    ).toEqual(['standard', 'eeeee']);
  });
  it('dicts merge key-wise: later layer wins, ruleset wins over every layer', () => {
    const r = resolveDef(
      synthetic({
        layers: ['experimental', 'bigger_shop'],
        gameModifiers: { mp_reroll_increment_bonus: 7 },
        startingParams: { hands: 3 },
      }),
      { options: opts() },
    ).resolved;
    expect(r.gameModifiers.mp_shop_slots_bonus).toBe(1);
    expect(r.gameModifiers.mp_reroll_increment_bonus).toBe(7);
    expect(r.startingParams).toEqual({ hands: 3 });
  });
  it('scalars: last layer wins; the ruleset value beats layers', () => {
    expect(
      resolveDef(synthetic({ layers: ['standard', 'classic'] }), { options: opts() }).resolved
        .multiplayerContent,
    ).toBe(false);
    expect(
      resolveDef(synthetic({ layers: ['classic', 'standard'] }), { options: opts() }).resolved
        .multiplayerContent,
    ).toBe(true);
    expect(
      resolveDef(synthetic({ layers: ['standard'], multiplayerContent: false }), {
        options: opts(),
      }).resolved.multiplayerContent,
    ).toBe(false);
    const t = resolveDef(
      synthetic({ layers: ['pressure_timer', 'no_animation_timer', 'pressure_timer_plus'] }),
      { options: opts() },
    ).resolved.timer;
    expect(t).toMatchObject({ mode: 'no_animation', mult: 2 / 3, base: 100, pressurePlusHand: 15 });
  });
  it('arrays concatenate in chain order, Attrition first, ruleset lists last', () => {
    const r = resolveDef(
      synthetic({ layers: ['wsob', 'gambling_opportunity'], banned: ['j_joker'] }),
      { options: opts() },
    ).resolved;
    expect(r.banned).toEqual([...ATTRITION_BANS, 'c_justice', 'm_gold', 'm_lucky', 'j_joker']);
  });
  it('hooks are listed per layer in chain order', () => {
    const r = resolveDef(synthetic({ layers: ['smallworld', 'sandbox'] }), {
      options: opts({ modifierLayers: ['shared_pockets', 'no_red_seals'] }),
    }).resolved;
    expect(r.setupHooks).toEqual(['smallworld', 'sandbox', 'no_red_seals', 'shared_pockets']);
  });
  it('forced options: the_order reset on, layers in order, ruleset last (and locked)', () => {
    const rs = synthetic({
      layers: ['ranked'],
      forceOptions: { theOrder: false, startingLives: 2 },
    });
    const f = applyForcedOptions(opts({ theOrder: false, startingLives: 9 }), rs);
    expect(f.options.theOrder).toBe(false);
    expect(f.options.startingLives).toBe(2);
    expect(f.locked.sort()).toEqual(['startingLives', 'theOrder']);
    expect(
      applyForcedOptions(opts({ ruleset: 'ruleset_mp_expanded', theOrder: false })).options
        .theOrder,
    ).toBe(true);
    expect(applyForcedOptions(opts({ ruleset: 'ruleset_mp_unknown' })).locked).toEqual([]);
  });
  it('modifierLayersOf lists only the runtime modifiers', () => {
    const rs = getRuleset('ruleset_mp_experimental') as RulesetDef;
    expect(modifierLayersOf(rs, opts({ trapCards: true, modifierLayers: ['eeeee'] }))).toEqual([
      'pvp_timer',
      'pressure_timer',
      'traps',
      'eeeee',
    ]);
  });
  it('pool isolation (multiplayer_content × multiplayer_jokers) and deck visibility', () => {
    const bal = resolve('ruleset_mp_balanced');
    expect(mpContentPooled(bal.resolved, bal.options)).toBe(true);
    expect(mpContentPooled(bal.resolved, { ...bal.options, multiplayerJokers: false })).toBe(false);
    const van = resolve('ruleset_mp_vanilla');
    expect(mpContentPooled(van.resolved, van.options)).toBe(false);
    expect(mpDecksVisible(van.resolved)).toBe(false);
    expect(mpDecksVisible(van.resolved, true)).toBe(true);
    expect(mpDecksVisible(bal.resolved)).toBe(true);
  });
  it('practice: The Order on, PvP from ante 2, timer off (PR-02)', () => {
    const r = resolve('ruleset_mp_vanilla', { pvpStartRound: 5, timer: true }, true);
    expect(r.options).toMatchObject({ theOrder: true, pvpStartRound: 2, timer: false });
    expect(r.resolved.flags.theOrder).toBe(true);
    expect(r.resolved.timer.enabled).toBe(false);
    expect(applyPracticeOptions(opts()).timer).toBe(false);
  });
  it('rejects unknown rulesets', () => {
    expect(() => resolve('ruleset_mp_nope')).toThrow(UnknownRulesetError);
  });
  it('Release (EX-14): needs the release pack, pools no MP content, shows the Balanced sticker', () => {
    const r = resolve('ruleset_mp_release').resolved;
    expect(requiredPacks('ruleset_mp_release')).toEqual(['release']);
    expect(r.multiplayerContent).toBe(false);
    expect(r.stickers).toEqual(['mp_sticker_balanced']);
    expect(r.setupHooks).toEqual(['release']);
    for (const k of RULESET_KEYS.filter((k) => k !== 'ruleset_mp_release')) {
      expect(requiredPacks(k)).toEqual([]);
    }
    expect(requiredPacks('ruleset_mp_nope')).toEqual([]);
  });
  it('the nemesis_sticker and judgement_rework Advanced layers (EX-17, Judgement rework)', () => {
    const r = resolve('ruleset_mp_balanced', {
      modifierLayers: ['judgement_rework', 'nemesis_sticker'],
    }).resolved;
    expect(r.layers.slice(-2)).toEqual(['nemesis_sticker', 'judgement_rework']);
    // Neither runs a run-start hook: the sticker and the Judgement roll are behaviour gates.
    expect(r.setupHooks).not.toContain('nemesis_sticker');
    expect(r.setupHooks).not.toContain('judgement_rework');
    // Off by default: no ruleset brings them in.
    for (const k of RULESET_KEYS) {
      const chain = resolve(k).resolved.layers;
      expect(chain).not.toContain('nemesis_sticker');
      expect(chain).not.toContain('judgement_rework');
    }
  });
  it('options carry the Advanced timer/lives values into the resolved timer', () => {
    const r = resolve('ruleset_mp_expanded', {
      timerBaseSeconds: 90,
      timerIncrementSeconds: 0,
      timerForgiveness: 2,
      pvpCountdownSeconds: 5,
      timer: false,
    });
    expect(r.resolved.timer).toMatchObject({
      enabled: false,
      base: 90,
      increment: 0,
      forgiveness: 2,
      countdown: 5,
    });
  });
});

describe('options', () => {
  it('shapes per queue mode (A1 §2.2)', () => {
    expect(shapeFor('pvp_nemesis')).toEqual({
      nemesisPairing: true,
      manhunt: false,
      teamBased: false,
    });
    expect(shapeFor('pvp_royale')).toEqual({
      nemesisPairing: false,
      manhunt: false,
      teamBased: false,
    });
    expect(shapeFor('pvp_smallworld')).toEqual({
      nemesisPairing: false,
      manhunt: false,
      teamBased: false,
    });
    expect(shapeFor('pvp_manhunt')).toMatchObject({ manhunt: true });
    expect(shapeFor('pvp_teams')).toMatchObject({ teamBased: true });
    expect(shapeFor('pvp_nemesis', true).practice).toBe(true);
  });
  it('previewDisabled (M03): off by default, forced on by Major League and Sandbox only', () => {
    expect(DEFAULT_LOBBY_OPTIONS.previewDisabled).toBe(false);
    for (const key of ['ruleset_mp_majorleague', 'ruleset_mp_sandbox']) {
      const { options, locked } = resolve(key, { previewDisabled: false });
      expect(options.previewDisabled).toBe(true);
      expect(locked).toContain('previewDisabled');
    }
    for (const key of ['ruleset_mp_balanced', 'ruleset_mp_minorleague', 'ruleset_mp_experimental']) {
      expect(resolve(key, { previewDisabled: true }).options.previewDisabled).toBe(true);
      expect(resolve(key).options.previewDisabled).toBe(false);
    }
  });
  it('defaults: Balanced except Small World; max players', () => {
    expect(defaultRulesetFor('pvp_royale')).toBe('ruleset_mp_balanced');
    expect(defaultOptionsFor('pvp_smallworld').ruleset).toBe('ruleset_mp_smallworld');
    expect(defaultOptionsFor('pvp_teams')).toMatchObject({
      startingLives: 4,
      pvpStartRound: 2,
      timerBaseSeconds: 150,
      manhuntHunterLives: 7,
      hideScoreUntilPlayed: false,
    });
    expect(maxPlayersFor('pvp_nemesis', 'casual')).toBe(2);
    expect(maxPlayersFor('pvp_nemesis', 'private')).toBe(16);
    expect(maxPlayersFor('pvp_royale', 'casual')).toBe(16);
  });
  it('sanitizeOptions keeps valid fields, drops invalid ones, never throws', () => {
    const base = defaultOptionsFor('pvp_nemesis');
    expect(sanitizeOptions(null, base)).toEqual(base);
    expect(sanitizeOptions('x', base)).toEqual(base);
    const s = sanitizeOptions(
      {
        startingLives: 2,
        pvpStartRound: 0,
        timerBaseSeconds: 'x',
        manhuntHunterLives: 20,
        ruleset: 'ruleset_mp_nope',
        modifierLayers: ['eeeee', 'pvp_timer', 'eeeee'],
        customSeed: 'AB12',
      },
      base,
    );
    expect(s.startingLives).toBe(2);
    expect(s.pvpStartRound).toBe(base.pvpStartRound);
    expect(s.timerBaseSeconds).toBe(150);
    expect(s.manhuntHunterLives).toBe(7);
    expect(s.ruleset).toBe(base.ruleset);
    expect(s.modifierLayers).toEqual(['eeeee']);
    expect(s.customSeed).toBe('AB12');
    expect(sanitizeOptions({ ruleset: 'ruleset_mp_wsob' }).ruleset).toBe('ruleset_mp_wsob');
    expect(sanitizeModifierLayers(['all_eternal', 'inflation'])).toEqual([
      'inflation',
      'all_eternal',
    ]);
  });
  it('pickers (LOB-06, D-17, MM-03, PR-01)', () => {
    expect([...PRIVATE_RULESETS]).toEqual([
      'ruleset_mp_vanilla',
      'ruleset_mp_balanced',
      'ruleset_mp_expanded',
      'ruleset_mp_smallworld',
      'ruleset_mp_majorleague',
    ]);
    expect(EXTRA_RULESETS).toHaveLength(11);
    expect(EXTRA_RULESETS[EXTRA_RULESETS.length - 1]).toBe('ruleset_mp_release');
    expect(new Set([...PRIVATE_RULESETS, ...EXTRA_RULESETS]).size).toBe(16);
    expect([...CASUAL_VOTE_RULESETS]).toEqual([
      'ruleset_mp_vanilla',
      'ruleset_mp_majorleague',
      'ruleset_mp_balanced',
      'ruleset_mp_expanded',
    ]);
    expect([...PRACTICE_RULESETS]).toHaveLength(4);
    expect([...TRAP_VOTE_RULESETS]).toEqual(['ruleset_mp_balanced', 'ruleset_mp_expanded']);
    for (const k of [
      ...PRIVATE_RULESETS,
      ...EXTRA_RULESETS,
      ...CASUAL_VOTE_RULESETS,
      ...PRACTICE_RULESETS,
    ])
      expect(getRuleset(k)).toBeDefined();
    expect(getRuleset('hasOwnProperty')).toBeUndefined();
  });
});

describe('data integrity against the shipped game (data/balatro)', () => {
  const src = ['game.lua']
    .map((f) => readFileSync(join(process.cwd(), 'data/balatro', f), 'utf8'))
    .join('\n');
  const vanillaKeys = new Set(
    [...src.matchAll(/\b([a-z]+_[a-z0-9_]+)\s*=\s*\{/g)].map((m) => m[1] as string),
  );
  const referenced = new Set<string>();
  const add = (keys: readonly string[] | undefined) => keys?.forEach((k) => referenced.add(k));
  for (const l of Object.values(LAYERS)) {
    add(l.banned);
    add(l.bannedSilent);
    add(l.reworked);
    add(l.included);
    add(l.spectralBannedEnhancements);
  }
  for (const r of Object.values(RULESETS)) {
    add(r.banned);
    add(r.bannedSilent);
    add(r.reworked);
  }
  add(ATTRITION_BANS);
  const vanillaOnly = [...referenced].filter((k) => !k.includes('_mp_') && !k.startsWith('mp_'));

  it('references a reasonable number of vanilla keys', () => {
    expect(vanillaOnly.length).toBeGreaterThan(60);
  });
  it.each(vanillaOnly)('%s exists in data/balatro/game.lua', (key) => {
    expect(vanillaKeys.has(key)).toBe(true);
  });
  it('every MP key follows the mod naming (prefix_mp_…)', () => {
    for (const k of referenced)
      if (k.includes('_mp_')) expect(k).toMatch(/^(j|c|p|tag|v|b|bl|m)_mp_[a-z0-9_]+$/);
  });
});
