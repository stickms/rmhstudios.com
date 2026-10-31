/**
 * Content parity with the reference mod: every layer and ruleset the mod registers has a native
 * definition (lib/balatro/mp/__fixtures__/mod-inventory.json). Objects, stickers, stakes and reworks
 * are checked against the Lua registry by lib/balatro/lua/spec/mp_content_parity_spec.lua.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAYER_NAMES } from '../layers';
import { RULESET_KEYS } from '../rulesets';

interface Entry {
  mod: string;
  native: string;
}
interface Excluded {
  mod: string;
  kind: string;
  ex: string;
}
interface Inventory {
  layers: Entry[];
  rulesets: Entry[];
  excluded: Excluded[];
}

const inventory = JSON.parse(
  readFileSync(join(__dirname, '../../__fixtures__/mod-inventory.json'), 'utf8'),
) as Inventory;

describe('mod inventory: layers and rulesets', () => {
  it('every mod layer is a native layer (the diff is empty)', () => {
    expect(inventory.layers.length).toBeGreaterThanOrEqual(40);
    const missing = inventory.layers
      .filter((e) => !LAYER_NAMES.includes(e.native))
      .map((e) => e.mod);
    expect(missing).toEqual([]);
  });

  it('every mod ruleset is a native ruleset (the diff is empty)', () => {
    expect(inventory.rulesets.length).toBe(15);
    const missing = inventory.rulesets
      .filter((e) => !RULESET_KEYS.includes(e.native))
      .map((e) => e.mod);
    expect(missing).toEqual([]);
  });

  it('every native layer and ruleset comes from the mod', () => {
    const layers = new Set(inventory.layers.map((e) => e.native));
    const rulesets = new Set(inventory.rulesets.map((e) => e.native));
    expect(LAYER_NAMES.filter((n) => !layers.has(n))).toEqual([]);
    expect(RULESET_KEYS.filter((k) => !rulesets.has(k))).toEqual([]);
  });

  it('only the Release ruleset and layer are excluded (EX-14), and they are not defined', () => {
    const ex = inventory.excluded.filter((e) => e.kind === 'Ruleset' || e.kind === 'Layer');
    expect(ex.map((e) => `${e.kind}:${e.mod}:${e.ex}`).sort()).toEqual([
      'Layer:release:EX-14',
      'Ruleset:release:EX-14',
    ]);
    expect(LAYER_NAMES).not.toContain('release');
    expect(RULESET_KEYS).not.toContain('ruleset_mp_release');
  });
});
