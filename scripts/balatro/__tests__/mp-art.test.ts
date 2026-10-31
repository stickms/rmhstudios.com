/**
 * MP art references against the pack (the owner's "every MP joker has the same art").
 *
 * Every atlas the MP Lua names (`atlas = 'mp_…'`, `G.ASSET_ATLAS.mp_…`, `ANIMATION_ATLAS[…]`) must
 * be an entry of data/balatro-mp/atlases.json, shipped in the committed MP pack at 1x and 2x
 * (2x exactly twice 1x, whole cells of the entry's px × py), and present in the generated
 * rmh_mp/data/atlases.lua — a missing file or entry makes the Lua alias the vanilla placeholder
 * sheet at {0,0}, which draws every MP joker as the plain Joker. Per-definition positions are
 * checked in Lua (lib/balatro/lua/spec/mp_atlas_art_spec.lua), where the definitions live.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import pack from '@/lib/balatro/game-pack.json';
import { extractEntry, readZip } from '@/lib/balatro/zip';

const ROOT = join(import.meta.dirname, '../../..');
const MP_DATA = join(ROOT, 'data', 'balatro-mp');
const LUA_ROOT = join(ROOT, 'lib', 'balatro', 'lua', 'mp', 'rmh_mp');

interface Atlas {
  file: string;
  px: number;
  py: number;
  kind: 'card' | 'animation' | 'tag' | 'asset';
  frames: number | null;
  variants?: Record<string, string>;
}

const atlases = (
  JSON.parse(readFileSync(join(MP_DATA, 'atlases.json'), 'utf8')) as {
    atlases: Record<string, Atlas>;
  }
).atlases;

function luaFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return luaFiles(p);
    return name.endsWith('.lua') ? [p] : [];
  });
}

// Strip Lua comments so documentation that names an atlas does not count as a use.
function code(src: string): string {
  return src.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, '').replace(/--[^\n]*/g, '');
}

const sources = luaFiles(LUA_ROOT).map((p) => ({
  file: relative(ROOT, p),
  text: code(readFileSync(p, 'utf8')),
}));

/** Atlas keys used in an atlas position: `atlas = 'k'`, `atlas or 'k'`, `_ATLAS.k`, `_ATLAS['k']`. */
const ATLAS_USE =
  /(?:\batlas\s*=\s*|\batlas\s+or\s+|_ATLAS\.|_ATLAS\[\s*)['"]?(mp_[A-Za-z0-9_]+)\b/g;

const used = new Map<string, string>();
for (const { file, text } of sources) {
  for (const m of text.matchAll(ATLAS_USE)) if (!used.has(m[1])) used.set(m[1], file);
}

function pngSize(buf: Uint8Array): [number, number] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  expect(Buffer.from(buf.subarray(12, 16)).toString('latin1')).toBe('IHDR');
  return [view.getUint32(16), view.getUint32(20)];
}

const zipBytes = readFileSync(join(ROOT, 'data', 'balatro-pack', pack.mp.file));
const mpZip = readZip(new Uint8Array(zipBytes));
const member = async (name: string): Promise<Uint8Array | null> => {
  const entry = mpZip.entries.find((e) => e.name === name);
  return entry ? extractEntry(mpZip, entry) : null;
};

describe('MP art references', () => {
  it('finds the atlases the content uses (sanity: jokers, traps, decks, blinds, tags, stakes)', () => {
    for (const key of [
      'mp_j_pacifist',
      'mp_ec_jokers_sandbox',
      'mp_Trap',
      'mp_decks',
      'mp_player_blind_chip',
      'mp_tag_gambling_sandbox',
      'mp_stakes_chips',
    ])
      expect(used.has(key), key).toBe(true);
  });

  it('names only atlases the registry has', () => {
    const unknown = [...used].filter(([key]) => !atlases[key]).map(([k, f]) => `${k} (${f})`);
    expect(unknown).toEqual([]);
  });

  it('uses every registry entry (no art shipped for nothing)', () => {
    const all = sources.map((s) => s.text).join('\n');
    const unused = Object.keys(atlases).filter((key) => !new RegExp(`\\b${key}\\b`).test(all));
    expect(unused).toEqual([]);
  });

  it('ships every referenced atlas in the pack at 1x and 2x with matching dimensions', async () => {
    const bad: string[] = [];
    for (const key of [...used.keys()].sort()) {
      const e = atlases[key];
      if (!e) continue;
      const files = [e.file, ...Object.values(e.variants ?? {})];
      for (const file of files) {
        const one = await member(`rmh_mp/assets/1x/${file}`);
        const two = await member(`rmh_mp/assets/2x/${file}`);
        if (!one || !two) {
          bad.push(`${key}: ${file} missing at ${one ? '2x' : '1x'}`);
          continue;
        }
        const [w1, h1] = pngSize(one);
        const [w2, h2] = pngSize(two);
        if (w2 !== 2 * w1 || h2 !== 2 * h1)
          bad.push(`${key}: 2x ${w2}x${h2} is not 2 × ${w1}x${h1}`);
        if (w1 % e.px || h1 % e.py)
          bad.push(`${key}: ${w1}x${h1} is not whole ${e.px}x${e.py} cells`);
        if (e.kind === 'animation' && w1 / e.px !== e.frames)
          bad.push(`${key}: ${w1 / e.px} frames, registry says ${e.frames}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('lists every referenced atlas in the generated rmh_mp/data/atlases.lua', async () => {
    const lua = new TextDecoder().decode(
      (await member('rmh_mp/data/atlases.lua')) ?? new Uint8Array(),
    );
    const missing = [...used.keys()].filter((key) => !new RegExp(`\\b${key}\\s*=`).test(lua));
    expect(missing).toEqual([]);
  });
});
