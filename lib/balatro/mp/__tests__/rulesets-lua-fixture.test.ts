/**
 * The real ResolvedRuleset bundles the Lua specs apply (M1, WS4 ↔ WS6 conventions).
 *
 * lib/balatro/lua/spec/mp_rulesets_spec.lua applies every bundle in
 * lib/balatro/mp/__fixtures__/rulesets-resolved.json with fake_g and asserts its
 * effects (dot-path gameModifiers, `mp_` layer params, setupHooks order, the
 * MP-content pool gate, trap packs). This test keeps that fixture identical to
 * what resolveRuleset() produces today, so a change to layers.ts cannot leave
 * the Lua side checking a stale bundle.
 *
 * Regenerate after a deliberate ruleset change:
 *   RMH_UPDATE_FIXTURES=1 pnpm exec vitest run --config vitest.balatro.config.ts \
 *     lib/balatro/mp/__tests__/rulesets-lua-fixture.test.ts
 *   then `pnpm exec prettier --write lib/balatro/mp/__fixtures__/rulesets-resolved.json`
 *   (the comparison is on parsed JSON, so formatting never fails it).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADVANCED_LAYERS } from '../rulesets/layers';
import { defaultOptionsFor } from '../rulesets/options';
import { mpContentPooled, resolveRuleset } from '../rulesets/resolve';
import { RULESET_KEYS } from '../rulesets/rulesets';
import type { LobbyOptions } from '../types';

const FIXTURE = join(import.meta.dirname, '../__fixtures__/rulesets-resolved.json');

interface Case {
  name: string;
  options: Partial<LobbyOptions>;
  practice?: boolean;
}

const CASES: Case[] = [
  ...RULESET_KEYS.map((ruleset) => ({ name: ruleset, options: { ruleset } })),
  {
    name: 'balanced+traps+advanced',
    options: {
      ruleset: 'ruleset_mp_balanced',
      trapCards: true,
      modifierLayers: [...ADVANCED_LAYERS],
    },
  },
  {
    name: 'experimental+bigger_shop',
    options: { ruleset: 'ruleset_mp_experimental', modifierLayers: ['bigger_shop'] },
  },
  {
    name: 'sandbox-no-mp-jokers',
    options: { ruleset: 'ruleset_mp_sandbox', multiplayerJokers: false },
  },
  { name: 'practice-balanced', options: { ruleset: 'ruleset_mp_balanced' }, practice: true },
];

function build() {
  const out: Record<string, unknown> = {};
  for (const c of CASES) {
    const r = resolveRuleset({
      options: { ...defaultOptionsFor('pvp_nemesis'), ...c.options },
      practice: c.practice,
    });
    out[c.name] = {
      resolved: r.resolved,
      options: r.options,
      mpContentPooled: mpContentPooled(r.resolved, r.options),
    };
  }
  return out;
}

describe('Lua ruleset fixture', () => {
  it('matches resolveRuleset() for every ruleset (regenerate with RMH_UPDATE_FIXTURES=1)', () => {
    const want = build();
    if (process.env.RMH_UPDATE_FIXTURES === '1') {
      writeFileSync(FIXTURE, JSON.stringify(want, null, 1) + '\n');
    }
    const have = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    expect(have).toEqual(want);
  });
});
