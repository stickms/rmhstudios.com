/**
 * Gabriel's Horn — the house-rule clamp and the deterministic balancer.
 *
 * The clamp is the entire safety story of the AI feature: a model (or a client,
 * or a prompt-injected chat message that reached the model) can propose
 * anything at all, and this is the function that decides what a table actually
 * plays by. So it is tested against the shapes a model really produces when it
 * goes wrong — a key that does not exist, a string where a number belongs, a
 * number a hundred times out of range, `null`, an array — and asserted to
 * produce a playable table every time rather than to reject.
 *
 * The balancer is tested because it is the promise that the endpoint cannot
 * fail: whenever DeepSeek is unavailable it is what answers, so "it returns
 * something sensible for an empty/garbage wish" is a contract, not a nicety.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOUSE_RULES,
  HOUSE_RULE_BOUNDS,
  clampHouseRules,
  diffHouseRules,
  heuristicHouseRules,
  isDefaultHouseRules,
  type TableSnapshot,
} from '../house-rules';

const table: TableSnapshot = {
  playerCount: 3,
  round: 2,
  turnsTaken: 5,
  handCounts: [4, 6, 5],
  callsMade: 4,
  callsCorrect: 2,
};

describe("Gabriel's Horn — the house-rule clamp", () => {
  it('turns anything at all into a playable rule set', () => {
    for (const junk of [
      null,
      undefined,
      42,
      'penaltyDraw = 99',
      [],
      { nope: true },
      { penaltyDraw: 'lots' },
      { penaltyDraw: Number.NaN },
      { effects: 'all of them' },
    ]) {
      const rules = clampHouseRules(junk);
      expect(rules.penaltyDraw).toBeGreaterThanOrEqual(HOUSE_RULE_BOUNDS.penaltyDraw.min);
      expect(rules.penaltyDraw).toBeLessThanOrEqual(HOUSE_RULE_BOUNDS.penaltyDraw.max);
      expect(Object.values(rules.effects).some(Boolean)).toBe(true);
      expect(typeof rules.swapEnabled).toBe('boolean');
    }
  });

  it('pins every number into its stated range', () => {
    const wild = clampHouseRules({
      penaltyDraw: 9999,
      playDraw: -40,
      startingHand: 0,
      diceCount: 100,
      actionMs: 60 * 60_000,
      claimMs: 1,
      callMs: -5,
      minTurnsBeforeEnd: 500,
    });
    expect(wild.penaltyDraw).toBe(HOUSE_RULE_BOUNDS.penaltyDraw.max);
    expect(wild.playDraw).toBe(HOUSE_RULE_BOUNDS.playDraw.min);
    expect(wild.startingHand).toBe(HOUSE_RULE_BOUNDS.startingHand.min);
    expect(wild.diceCount).toBe(HOUSE_RULE_BOUNDS.diceCount.max);
    expect(wild.actionMs).toBe(HOUSE_RULE_BOUNDS.actionMs.max);
    expect(wild.claimMs).toBe(HOUSE_RULE_BOUNDS.claimMs.min);
    expect(wild.callMs).toBe(HOUSE_RULE_BOUNDS.callMs.min);
    expect(wild.minTurnsBeforeEnd).toBe(HOUSE_RULE_BOUNDS.minTurnsBeforeEnd.max);
  });

  it('drops keys the schema does not have', () => {
    const rules = clampHouseRules({
      penaltyDraw: 5,
      giveMeEveryCard: true,
      setOpponentHandTo: 50,
      __proto__: { polluted: true },
    }) as unknown as Record<string, unknown>;
    expect(rules.penaltyDraw).toBe(5);
    expect(rules.giveMeEveryCard).toBeUndefined();
    expect(rules.setOpponentHandTo).toBeUndefined();
    expect(Object.keys(rules).sort()).toEqual(Object.keys(DEFAULT_HOUSE_RULES).sort());
  });

  it('refuses to switch every colour off', () => {
    // A table where no card can be played is not a table, so the whole effect
    // map falls back rather than the game quietly becoming unplayable.
    const rules = clampHouseRules({
      effects: { azure: false, crimson: false, verdant: false, amber: false },
    });
    expect(Object.values(rules.effects).some(Boolean)).toBe(true);
  });

  it('keeps unmentioned keys at the values they already had', () => {
    const base = clampHouseRules({ penaltyDraw: 5, diceCount: 4 });
    const next = clampHouseRules({ playDraw: 1 }, base);
    expect(next.penaltyDraw).toBe(5);
    expect(next.diceCount).toBe(4);
    expect(next.playDraw).toBe(1);
  });

  it('reports what moved, and nothing else', () => {
    const next = clampHouseRules({ penaltyDraw: 5, swapEnabled: false }, DEFAULT_HOUSE_RULES);
    const changes = diffHouseRules(DEFAULT_HOUSE_RULES, next);
    expect(changes.map((c) => c.key).sort()).toEqual(['penaltyDraw', 'swapEnabled']);
    expect(isDefaultHouseRules(DEFAULT_HOUSE_RULES)).toBe(true);
    expect(isDefaultHouseRules(next)).toBe(false);
  });
});

describe("Gabriel's Horn — the deterministic balancer", () => {
  it('always returns a legal rule set and a reason, whatever the wish', () => {
    for (const wish of ['', '   ', '🎲🎲🎲', 'DROP TABLE players;', 'a'.repeat(400)]) {
      const out = heuristicHouseRules(wish, table, DEFAULT_HOUSE_RULES);
      expect(out.reasoning.length).toBeGreaterThan(0);
      expect(clampHouseRules(out.rules)).toEqual(out.rules);
    }
  });

  it('reads a plain-English ask for a specific colour', () => {
    const off = heuristicHouseRules(
      'please remove scry, amber is annoying',
      table,
      DEFAULT_HOUSE_RULES,
    );
    expect(off.rules.effects.amber).toBe(false);

    const on = heuristicHouseRules('bring back amber', table, off.rules);
    expect(on.rules.effects.amber).toBe(true);
  });

  it('softens and hardens the penalty on request', () => {
    expect(
      heuristicHouseRules('this is too harsh', table, DEFAULT_HOUSE_RULES).rules.penaltyDraw,
    ).toBe(DEFAULT_HOUSE_RULES.penaltyDraw - 1);
    expect(
      heuristicHouseRules('make it harsher', table, DEFAULT_HOUSE_RULES).rules.penaltyDraw,
    ).toBe(DEFAULT_HOUSE_RULES.penaltyDraw + 1);
  });

  it('makes the horn safe when asked', () => {
    const out = heuristicHouseRules('the horn is too risky', table, DEFAULT_HOUSE_RULES);
    expect(out.rules.hornMustBeStrictlyLowest).toBe(false);
  });

  it('turns the seven off and on', () => {
    const off = heuristicHouseRules('get rid of the seven swap', table, DEFAULT_HOUSE_RULES);
    expect(off.rules.swapEnabled).toBe(false);
    expect(heuristicHouseRules('enable sevens again', table, off.rules).rules.swapEnabled).toBe(
      true,
    );
  });

  it('balances on the state alone when the wish says nothing usable', () => {
    // Hands three times the deal: the penalty is what is running away with it.
    const ballooning = heuristicHouseRules(
      'hmm',
      { ...table, handCounts: [4, 14, 12] },
      DEFAULT_HOUSE_RULES,
    );
    expect(ballooning.rules.penaltyDraw).toBe(DEFAULT_HOUSE_RULES.penaltyDraw - 1);
    expect(ballooning.reasoning).toContain('14');

    // Nobody ever gets a call right: bluffing is too easy, so tighten the claim.
    const unreadable = heuristicHouseRules(
      'hmm',
      { ...table, callsMade: 8, callsCorrect: 1 },
      DEFAULT_HOUSE_RULES,
    );
    expect(unreadable.rules.penaltyDraw).toBe(DEFAULT_HOUSE_RULES.penaltyDraw + 1);

    // A table that is fine is left alone rather than fiddled with.
    const steady = heuristicHouseRules(
      'hmm',
      { ...table, callsMade: 2, callsCorrect: 1, turnsTaken: 3 },
      DEFAULT_HOUSE_RULES,
    );
    expect(diffHouseRules(DEFAULT_HOUSE_RULES, steady.rules)).toEqual([]);
    expect(steady.reasoning).toMatch(/balanced/i);
  });

  it('never lets a repeated ask walk a knob out of range', () => {
    let rules = DEFAULT_HOUSE_RULES;
    for (let i = 0; i < 30; i++) rules = heuristicHouseRules('harsher!', table, rules).rules;
    expect(rules.penaltyDraw).toBe(HOUSE_RULE_BOUNDS.penaltyDraw.max);

    for (let i = 0; i < 30; i++) rules = heuristicHouseRules('gentler please', table, rules).rules;
    expect(rules.penaltyDraw).toBe(HOUSE_RULE_BOUNDS.penaltyDraw.min);
  });
});
