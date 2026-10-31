/**
 * The multiplayer pack and its sources (PLAN WS2, §6.4): the atlas registry, the
 * imported art, the generated localization, the glyph bitmap, the size budgets,
 * and that the committed `mp-<sha>.zip` is what the builder makes from the tree.
 *
 * Two parts need tools beyond node: the builder (python3 with fonttools; the
 * freshness and determinism tests) and PUC Lua 5.1 (loading the generated Lua the
 * way the game will). Both FAIL with an install hint when missing, never skip.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import pack from '@/lib/balatro/game-pack.json';
import { extractEntry, readZip } from '@/lib/balatro/zip';

const ROOT = join(import.meta.dirname, '../../..');
const MP = join(ROOT, 'data', 'balatro-mp');
const PACKS = join(ROOT, 'data', 'balatro-pack');
const BUILDER = join(ROOT, 'scripts', 'balatro', 'build-game-pack.py');
const PYTHON = process.env.PYTHON3 || 'python3';
const LUA = process.env.LUA51 || 'lua5.1';

const PY_HINT =
  'The pack builder needs python3 with fontTools: `pip install fonttools pyoxipng` ' +
  '(or set PYTHON3=/path/to/python3).';
const LUA_HINT =
  'PUC Lua 5.1 is required: `sudo apt-get install -y lua5.1` (or set LUA51=/path/to/lua5.1).';

const pyProbe = spawnSync(PYTHON, ['-I', '-c', 'import fontTools'], { encoding: 'utf8' });
const pythonReady = !pyProbe.error && pyProbe.status === 0;
const luaProbe = spawnSync(LUA, ['-v'], { encoding: 'utf8' });
const luaReady = !luaProbe.error && luaProbe.status === 0;

const budget = z
  .object({
    coreBaselineBytes: z.number().int().positive(),
    coreGrowthMaxBytes: z.number().int().nonnegative(),
    mpMaxBytes: z.number().int().positive(),
    mpMaxExtractedBytes: z.number().int().positive(),
  })
  .parse(JSON.parse(readFileSync(join(MP, 'pack-budget.json'), 'utf8')));

const zAtlas = z
  .object({
    file: z.string().regex(/^[\w-]+\.png$/),
    px: z.number().int().positive(),
    py: z.number().int().positive(),
    kind: z.enum(['card', 'animation', 'tag', 'asset']),
    frames: z.number().int().positive().nullable(),
    placeholder: z.string().min(1),
    variants: z.record(z.string(), z.string().regex(/^[\w-]+\.png$/)).optional(),
  })
  .strict();
const registry = z
  .object({
    $comment: z.string(),
    version: z.literal(1),
    stub: z.literal(false),
    atlases: z.record(z.string().regex(/^mp_\w+$/), zAtlas),
  })
  .strict()
  .parse(JSON.parse(readFileSync(join(MP, 'atlases.json'), 'utf8')));

function pngSize(buf: Buffer): { w: number; h: number } {
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(buf.subarray(12, 16).toString('latin1')).toBe('IHDR');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const mpZip = readZip(new Uint8Array(readFileSync(join(PACKS, pack.mp.file))));
async function mpFile(name: string): Promise<Uint8Array> {
  const entry = mpZip.entries.find((e) => e.name === name);
  if (!entry) throw new Error(`${name} is not in ${pack.mp.file}`);
  return extractEntry(mpZip, entry);
}

/* ─── Atlas registry and art (AS-01..03) ─────────────────────────────────── */

describe('MP atlas registry', () => {
  it('keeps the keys WS0 published in the stub', () => {
    for (const key of [
      'mp_j_pacifist',
      'mp_Trap',
      'mp_player_blind_chip',
      'mp_tag_gambling_sandbox',
    ]) {
      expect(registry.atlases[key], key).toBeDefined();
    }
  });

  it('maps every entry to a 1x and a 2x file, the 2x exactly twice the 1x, on whole cells', () => {
    for (const [key, a] of Object.entries(registry.atlases)) {
      for (const file of [a.file, ...Object.values(a.variants ?? {})]) {
        const one = pngSize(readFileSync(join(MP, '1x', file)));
        const two = pngSize(readFileSync(join(MP, '2x', file)));
        expect(two, `${key} ${file}`).toEqual({ w: one.w * 2, h: one.h * 2 });
        expect(one.w % a.px, `${key} width`).toBe(0);
        expect(one.h % a.py, `${key} height`).toBe(0);
        // WebGL1 guarantees 4096 px textures (R-05).
        expect(Math.max(two.w, two.h), `${key} 2x size`).toBeLessThanOrEqual(4096);
        if (a.kind === 'animation') {
          expect(a.frames, key).not.toBeNull();
          expect(one.w, `${key} frames`).toBe(a.px * (a.frames ?? 0));
        } else {
          expect(a.frames, key).toBeNull();
        }
        if (a.kind === 'tag') expect(one, key).toEqual({ w: 34, h: 34 });
      }
    }
  });

  it('ships no PNG the registry does not name, and none of the EX-20 dead weight', () => {
    const named = new Set(
      Object.values(registry.atlases).flatMap((a) => [a.file, ...Object.values(a.variants ?? {})]),
    );
    for (const scale of ['1x', '2x']) {
      const files = readdirSync(join(MP, scale));
      expect(
        files.filter((f) => !named.has(f)),
        scale,
      ).toEqual([]);
      for (const dead of [
        'release_jokers.png',
        'j_copycat.png',
        'stickers.png',
        'pvp_title_base_left.png',
        'pvp_title_base_right.png',
        'sticker_nemesis.png',
        'alt_mp_stakes.png',
        'modicon.png',
        'icon.png',
        'ec_other_sandbox.png',
      ]) {
        expect(files, `${scale} ${dead}`).not.toContain(dead);
      }
      expect(
        files.some((f) => f.startsWith('alt_t_')),
        `${scale} alt_t_*`,
      ).toBe(false);
    }
  });

  it('crops the two used ec_other_sandbox cells into mp_misc (D-27)', () => {
    expect(registry.atlases.mp_misc).toMatchObject({
      file: 'mp_misc.png',
      px: 71,
      py: 95,
      kind: 'card',
    });
    expect(pngSize(readFileSync(join(MP, '1x', 'mp_misc.png')))).toEqual({ w: 142, h: 95 });
  });
});

/* ─── The committed pack ─────────────────────────────────────────────────── */

describe('MP pack', () => {
  it('is within its budgets (PLAN §6.4, data/balatro-mp/pack-budget.json)', () => {
    expect(pack.core.bytes).toBeLessThanOrEqual(
      budget.coreBaselineBytes + budget.coreGrowthMaxBytes,
    );
    expect(pack.mp.bytes).toBeLessThanOrEqual(budget.mpMaxBytes);
    const extracted = mpZip.entries.reduce((n, e) => n + e.size, 0);
    expect(extracted).toBeLessThanOrEqual(budget.mpMaxExtractedBytes);
  });

  it('holds only rmh_mp/ paths, sorted, with the generated files', () => {
    const names = mpZip.entries.map((e) => e.name);
    expect(names.every((n) => n.startsWith('rmh_mp/'))).toBe(true);
    expect([...names].sort()).toEqual(names);
    for (const n of ['rmh_mp/glyphs.bin', 'rmh_mp/data/atlases.lua', 'rmh_mp/loc/en-us.lua'])
      expect(names).toContain(n);
  });

  it('carries the art byte for byte, PNGs stored (already compressed)', async () => {
    for (const scale of ['1x', '2x']) {
      for (const file of readdirSync(join(MP, scale))) {
        const name = `rmh_mp/assets/${scale}/${file}`;
        const entry = mpZip.entries.find((e) => e.name === name);
        expect(entry?.method, name).toBe(0);
        expect(
          Buffer.from(await mpFile(name)).equals(readFileSync(join(MP, scale, file))),
          name,
        ).toBe(true);
      }
    }
  });
});

describe('MP pack freshness and determinism (python3 + fontTools)', () => {
  if (!pythonReady) {
    it('needs python3 with fontTools', () => {
      throw new Error(PY_HINT);
    });
    return;
  }

  it('is what the builder makes from the tree (build-game-pack.py --check --mp-only)', () => {
    const run = spawnSync(PYTHON, ['-I', BUILDER, '--check', '--mp-only'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(run.status, run.stderr).toBe(0);
  });

  it('builds byte-identical zips twice', () => {
    const dirs = [mkdtempSync(join(tmpdir(), 'mp-pack-')), mkdtempSync(join(tmpdir(), 'mp-pack-'))];
    try {
      const shas = dirs.map((dir) => {
        const run = spawnSync(PYTHON, ['-I', BUILDER, '--mp-only', '--out', dir], {
          cwd: ROOT,
          encoding: 'utf8',
        });
        expect(run.status, run.stderr).toBe(0);
        return JSON.parse(readFileSync(join(dir, 'game-pack.json'), 'utf8')).mp.sha256 as string;
      });
      expect(shas[0]).toBe(shas[1]);
    } finally {
      for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ─── Localization and glyphs (LOC-01, LOC-02, LOC-04) ───────────────────── */

interface Glyphs {
  fonts: { name: string; has: (cp: number) => boolean }[];
  langs: Map<string, number>;
}

function parseGlyphs(buf: Uint8Array): Glyphs {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const text = new TextDecoder();
  expect(text.decode(buf.subarray(0, 4))).toBe('RMHG');
  expect(buf[4]).toBe(1);
  const fontCount = buf[5];
  const langCount = buf[6];
  let o = 8;
  const fonts: Glyphs['fonts'] = [];
  for (let i = 0; i < fontCount; i++) {
    const name = text.decode(buf.subarray(o + 1, o + 1 + buf[o]));
    o += 1 + buf[o];
    const len = view.getUint32(o, true);
    const bits = buf.subarray(o + 4, o + 4 + len);
    o += 4 + len;
    fonts.push({
      name,
      has: (cp) => cp >> 3 < bits.length && (bits[cp >> 3] & (1 << (cp & 7))) !== 0,
    });
  }
  const langs = new Map<string, number>();
  for (let i = 0; i < langCount; i++) {
    const key = text.decode(buf.subarray(o + 1, o + 1 + buf[o]));
    o += 1 + buf[o];
    langs.set(key, buf[o]);
    o += 1;
  }
  expect(o).toBe(buf.length);
  return { fonts, langs };
}

type Loc = Record<string, unknown>;

/** Loads each generated loc file under lua5.1 with an empty environment, as data. */
function loadLocUnderLua(files: Map<string, Uint8Array>): Map<string, Loc> {
  const dir = mkdtempSync(join(tmpdir(), 'mp-loc-'));
  try {
    const dump = `
      local function enc(v, out)
        local t = type(v)
        if t == 'string' then
          out[#out + 1] = '"' .. v:gsub('[%c"\\\\]', function(c) return string.format('\\\\u%04x', c:byte()) end) .. '"'
        elseif t == 'number' or t == 'boolean' then out[#out + 1] = tostring(v)
        elseif t == 'table' then
          if #v > 0 then
            out[#out + 1] = '['
            for i = 1, #v do if i > 1 then out[#out + 1] = ',' end enc(v[i], out) end
            out[#out + 1] = ']'
          else
            out[#out + 1] = '{'
            local first = true
            for k, x in pairs(v) do
              if not first then out[#out + 1] = ',' end
              first = false
              enc(tostring(k), out); out[#out + 1] = ':'; enc(x, out)
            end
            out[#out + 1] = '}'
          end
        else error('unexpected ' .. t) end
      end
      local f = assert(loadfile(arg[1]))
      setfenv(f, {})
      local out = {}
      enc(f(), out)
      io.write(table.concat(out))`;
    writeFileSync(join(dir, 'dump.lua'), dump);
    const out = new Map<string, Loc>();
    for (const [lang, bytes] of files) {
      const path = join(dir, `${lang}.lua`);
      writeFileSync(path, bytes);
      const run = spawnSync(LUA, [join(dir, 'dump.lua'), path], { encoding: 'utf8' });
      expect(run.status, `${lang}: ${run.stderr}`).toBe(0);
      out.set(lang, JSON.parse(run.stdout) as Loc);
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

function leaves(v: unknown, path = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const isEntry = (x: unknown) =>
    typeof x !== 'object' ||
    Array.isArray(x) ||
    (x !== null && Object.keys(x).every((k) => ['name', 'text', 'unlock'].includes(k)));
  if (isEntry(v)) out.set(path, v);
  else
    for (const [k, x] of Object.entries(v as Loc))
      for (const [p, y] of leaves(x, `${path}.${k}`)) out.set(p, y);
  return out;
}

const placeholders = (v: unknown) =>
  new Set(strings(v).flatMap((s) => [...s.matchAll(/#(\d+)#/g)].map((m) => m[1])));

describe('MP localization (lua5.1)', () => {
  if (!luaReady) {
    it('needs lua5.1', () => {
      throw new Error(LUA_HINT);
    });
    return;
  }

  const sources = () =>
    Promise.all(
      mpZip.entries
        .filter((e) => /^rmh_mp\/loc\/[\w-]+\.lua$/.test(e.name))
        .map(
          async (e) =>
            [e.name.slice('rmh_mp/loc/'.length, -4), await extractEntry(mpZip, e)] as const,
        ),
    ).then((pairs) => new Map(pairs));

  it('converted all 16 mod languages to data', () => {
    const langs = readdirSync(join(MP, 'localization')).map((f) => f.replace(/\.json$/, ''));
    expect(langs.sort()).toEqual(
      [
        'de',
        'en-us',
        'es_419',
        'es_ES',
        'fr',
        'it',
        'ja',
        'ko',
        'mi',
        'nl',
        'pl',
        'pt_BR',
        'ru',
        'vi',
        'zh_CN',
        'zh_TW',
      ].sort(),
    );
  });

  it('ships tables that load as plain data, en-us complete and every translation a subset of it', async () => {
    const loc = loadLocUnderLua(await sources());
    const en = loc.get('en-us');
    expect(en).toBeDefined();
    const enLeaves = leaves(en);
    // LOC-02: our own strings are in, and the mod's English is untouched.
    const extras = JSON.parse(readFileSync(join(MP, 'extra-strings.en-us.json'), 'utf8')) as Loc;
    for (const [path, value] of leaves({ misc: extras.misc }))
      expect(enLeaves.get(path), path).toEqual(value);
    const modEn = JSON.parse(readFileSync(join(MP, 'localization', 'en-us.json'), 'utf8')) as Loc;
    expect(enLeaves.get('.descriptions.Joker.j_mp_pizza')).toEqual(
      leaves(modEn).get('.descriptions.Joker.j_mp_pizza'),
    );
    // Content this port excludes (EX-14, EX-16) does not ship; EX-15 (Baron, Mime, White) does.
    for (const path of enLeaves.keys())
      expect(path).not.toMatch(/_release$|j_mp_idol$|stake_mp_plastic$/);
    for (const key of [
      '.descriptions.Joker.j_mp_baron',
      '.descriptions.Joker.j_mp_mime',
      '.descriptions.Back.b_mp_white',
    ])
      expect(enLeaves.has(key), key).toBe(true);
    for (const [lang, table] of loc) {
      if (lang === 'en-us') continue;
      for (const [path, value] of leaves(table)) {
        expect(enLeaves.has(path), `${lang}${path} has no English`).toBe(true);
        for (const p of placeholders(value))
          expect(placeholders(enLeaves.get(path)).has(p), `${lang}${path} #${p}#`).toBe(true);
      }
    }
  });

  it('every MP string a language shows is drawable in that language font (glyphs.bin)', async () => {
    const glyphs = parseGlyphs(await mpFile('rmh_mp/glyphs.bin'));
    expect(glyphs.fonts.length).toBeGreaterThan(0);
    expect(glyphs.langs.get('en-us')).toBeDefined();
    const loc = loadLocUnderLua(await sources());
    const en = strings(loc.get('en-us'));
    for (const [lang, fontIndex] of glyphs.langs) {
      const font = glyphs.fonts[fontIndex];
      const missing = new Set<string>();
      for (const s of [...en, ...strings(loc.get(lang))]) {
        for (const ch of s)
          if (ch.codePointAt(0)! >= 0x20 && !font.has(ch.codePointAt(0)!)) missing.add(ch);
      }
      expect([...missing].join(''), `${lang} in ${font.name}`).toBe('');
    }
    // Every shipped language file is a game language the bitmap knows.
    for (const lang of loc.keys()) expect(glyphs.langs.has(lang), lang).toBe(true);
  });

  it('emits the atlas registry as an equivalent Lua table', async () => {
    const loaded = loadLocUnderLua(
      new Map([['atlases', await mpFile('rmh_mp/data/atlases.lua')]]),
    ).get('atlases') as Loc;
    expect(Object.keys(loaded).sort()).toEqual(Object.keys(registry.atlases).sort());
    for (const [key, a] of Object.entries(registry.atlases)) {
      const { frames, ...rest } = a;
      expect(loaded[key], key).toEqual(frames === null ? rest : a);
    }
  });

  it.todo(
    'every key the registry defines has en-us localization (needs the WS6 defs export, wave 3)',
  );
});

/* ─── The importer and builder helpers (Python unittest) ─────────────────── */

describe('importer and builder helpers (python unittest)', () => {
  it('passes scripts/balatro/__tests__/test_mp_pack.py', () => {
    const run = spawnSync(
      PYTHON,
      [
        '-I',
        '-m',
        'unittest',
        'discover',
        '-s',
        join(ROOT, 'scripts', 'balatro', '__tests__'),
        '-p',
        'test_*.py',
      ],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, LUA51: LUA } },
    );
    if (run.error) throw new Error(`python3 not found: ${PY_HINT}`);
    expect(run.status, run.stderr).toBe(0);
  });
});
