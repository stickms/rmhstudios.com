/**
 * The map channel against real installs. Each game's block skips unless its install is given:
 * TF2_ROOT (a TF2 or dedicated-server install: no texture data, so its maps build untextured),
 * HL2_ROOT (Half-Life 2 demo, app 219) and PORTAL_ROOT (Portal: First Slice, app 410).
 *
 *   HL2_ROOT=… PORTAL_ROOT=… TF2_ROOT=… pnpm test:tf2 scripts/tf2-game/build-maps.test.ts
 *
 * Prints each map's sizes and the projection for the game's whole list (docs/tf2-game.md "Maps").
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LUMP, parseBsp, texInfoMaterial, type BspFile } from '../../lib/tf2-game/formats/bsp';
import { materialPath, parseVmt, texturePath } from '../../lib/tf2-game/formats/vmt';
import { loadPropCollisionModel } from '../../lib/tf2-game/world/prop-collision';
import { GAME_MAPS } from '../../lib/tf2-game/assets/game-maps';
import {
  mapIndexSchema,
  mapManifestSchema,
  parseHullsBin,
  writeHullsBin,
  type MapManifest,
} from '../../lib/tf2-game/assets/map-manifest';
import { isContentAddressed } from '../../lib/tf2-game/assets/paths';
import type { GameId } from '../../lib/tf2-game/assets/versions';
import {
  buildMaps,
  materialKey,
  openGameFileSystem,
  stripBsp,
  TEX_VERSION,
  textureSize,
  type BuildResult,
  type MapReport,
} from './build-maps';

const ROOTS: Record<GameId, string> = {
  tf2: process.env.TF2_ROOT ?? '',
  hl2: process.env.HL2_ROOT ?? '',
  portal: process.env.PORTAL_ROOT ?? '',
};
const MAPS_DIR: Record<GameId, string> = { tf2: 'tf/maps', hl2: 'hl2/maps', portal: 'portal/maps' };
const mib = (b: number) => (b / 1048576).toFixed(1);

describe('map package pieces', () => {
  it('names textures with models.py TEX_VERSION', () => {
    const py = readFileSync(path.join(import.meta.dirname, 'models.py'), 'utf8');
    expect(py).toMatch(new RegExp(`^TEX_VERSION = ${TEX_VERSION}$`, 'm'));
  });

  it('picks the largest mip within the cap', () => {
    expect(textureSize({ width: 2048, height: 1024, numMipLevels: 12 })).toEqual({
      mip: 1,
      w: 1024,
      h: 512,
    });
    expect(textureSize({ width: 512, height: 512, numMipLevels: 10 })).toEqual({
      mip: 0,
      w: 512,
      h: 512,
    });
    expect(textureSize({ width: 2048, height: 2048, numMipLevels: 1 })).toEqual({
      mip: 0,
      w: 1024,
      h: 1024,
    });
  });

  it('round-trips hulls.bin', () => {
    const table = [
      [new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])],
      [],
      [new Float32Array(3), new Float32Array(6)],
    ];
    const back = parseHullsBin(writeHullsBin(table));
    expect(back.map((e) => e.map((c) => [...c]))).toEqual(table.map((e) => e.map((c) => [...c])));
    expect(() => parseHullsBin(new Uint8Array(2))).toThrow();
  });

  it('treats map files and model-channel textures as immutable', () => {
    expect(isContentAddressed(`maps/${'a'.repeat(64)}.hulls.bin`)).toBe(true);
    expect(isContentAddressed(`tex/${'b'.repeat(40)}.webp`)).toBe(true);
    expect(isContentAddressed('maps/index.json')).toBe(false);
  });
});

/** Original vs stripped BSP: everything the game reads is identical. */
function expectSameMap(a: BspFile, b: BspFile, lighting: 'hdr' | 'ldr'): void {
  expect(b.version).toBe(a.version);
  expect(b.mapRevision).toBe(a.mapRevision);
  expect(b.entityText).toBe(a.entityText);
  expect(b.faces).toEqual(a.faces);
  expect(b.facesHdr).toEqual(a.facesHdr);
  expect(b.planes).toEqual(a.planes);
  expect(b.brushes).toEqual(a.brushes);
  expect(b.brushSides).toEqual(a.brushSides);
  expect(b.nodes).toEqual(a.nodes);
  expect(b.leafs).toEqual(a.leafs);
  expect(b.models).toEqual(a.models);
  expect(b.texInfo).toEqual(a.texInfo);
  expect(b.texData).toEqual(a.texData);
  expect(b.vertexes).toEqual(a.vertexes);
  expect(b.dispInfos).toEqual(a.dispInfos);
  expect(b.dispVerts).toEqual(a.dispVerts);
  expect(b.overlays).toEqual(a.overlays);
  expect(b.staticProps).toEqual(a.staticProps);
  expect(b.worldLights).toEqual(a.worldLights);
  expect(b.worldLightsHdr).toEqual(a.worldLightsHdr);
  expect(b.visibility?.numClusters).toBe(a.visibility?.numClusters);
  if (lighting === 'hdr') {
    expect(Buffer.from(b.lightingHdr).equals(Buffer.from(a.lightingHdr))).toBe(true);
    expect(b.lighting.length).toBe(0);
    expect(b.leafAmbientHdr).toEqual(a.leafAmbientHdr);
  } else {
    expect(Buffer.from(b.lighting).equals(Buffer.from(a.lighting))).toBe(true);
    expect(b.leafAmbientLdr).toEqual(a.leafAmbientLdr);
  }
  expect(b.pakfile.length).toBe(0);
  expect(b.cubemaps.length).toBe(0);
  for (let i = 0; i < 64; i++) expect(b.lumps[i].uncompressedSize).toBe(0);
}

const suites: Array<{ game: GameId; maps: string[]; textured: boolean }> = [
  { game: 'hl2', maps: ['d1_trainstation_01'], textured: true },
  { game: 'portal', maps: ['testchmb_a_00', 'testchmb_a_01'], textured: true },
  { game: 'tf2', maps: ['ctf_2fort'], textured: false },
];

const table: string[] = [];

for (const suite of suites) {
  const root = ROOTS[suite.game];
  const run =
    root && suite.maps.every((m) => existsSync(path.join(root, MAPS_DIR[suite.game], `${m}.bsp`)));
  describe.skipIf(!run)(`${suite.game} maps (${suite.maps.join(', ')})`, () => {
    let out = '';
    let result: BuildResult;
    const manifests = new Map<string, MapManifest>();

    beforeAll(async () => {
      out = mkdtempSync(path.join(os.tmpdir(), `maps-${suite.game}-`));
      result = await buildMaps({
        root,
        game: suite.game,
        maps: suite.maps,
        out,
        propsListOut: path.join(out, 'props.list'),
        sizes: true,
        log: () => {},
      });
      for (const r of result.reports)
        manifests.set(
          r.map,
          JSON.parse(readFileSync(path.join(out, r.manifest), 'utf8')) as MapManifest,
        );
    }, 600_000);

    afterAll(() => {
      if (out) rmSync(out, { recursive: true, force: true });
    });

    it('builds every map and validates the manifests and the index (schema v1)', () => {
      expect(result.failed).toEqual([]);
      for (const m of suite.maps) {
        const manifest = manifests.get(m)!;
        expect(() => mapManifestSchema.strict().parse(manifest)).not.toThrow();
        expect(manifest.game).toBe(suite.game);
        expect(manifest.nav).toBeNull();
      }
      const index = mapIndexSchema.parse(
        JSON.parse(readFileSync(path.join(out, 'maps/index.json'), 'utf8')),
      );
      expect(Object.keys(index.maps).sort()).toEqual([...suite.maps].sort());
      for (const m of suite.maps) {
        const entry = index.maps[m];
        const listed = GAME_MAPS[suite.game].find((g) => g.name === m)!;
        expect(entry).toMatchObject({ title: listed.title, mode: listed.mode });
        expect(entry.bytes).toBeGreaterThan(0);
      }
      // wanted.json lists every file the packages reference, with bytes for those written.
      const wanted = JSON.parse(readFileSync(path.join(out, 'wanted.json'), 'utf8')) as Record<
        string,
        { src: string; bytes?: number }
      >;
      for (const manifest of manifests.values()) {
        for (const f of [
          manifest.bsp,
          manifest.hulls,
          ...Object.values(manifest.textures).map((t) => t.file),
        ])
          if (f) expect(wanted[f]?.bytes, f).toBeGreaterThan(0);
      }
      expect(JSON.parse(readFileSync(path.join(out, 'failed.json'), 'utf8'))).toEqual([]);
      const props = readFileSync(path.join(out, 'props.list'), 'utf8').trim().split('\n');
      expect(props.length).toBeGreaterThan(5);
      expect(props.every((p) => /^models\/.+\.mdl$/.test(p))).toBe(true);
    });

    it('writes a stripped BSP that re-parses to the same map', () => {
      for (const m of suite.maps) {
        const manifest = manifests.get(m)!;
        const raw = new Uint8Array(readFileSync(path.join(root, MAPS_DIR[suite.game], `${m}.bsp`)));
        const original = parseBsp(raw);
        const stripped = new Uint8Array(readFileSync(path.join(out, manifest.bsp)));
        expect(stripped.length).toBe(manifest.bspBytes);
        const again = parseBsp(stripped);
        expectSameMap(original, again, manifest.lighting);
        expect(manifest.lighting).toBe(
          original.lumps[LUMP.LIGHTING_HDR].length > 0 ? 'hdr' : 'ldr',
        );
        // Deterministic: stripping again gives the same bytes.
        expect(Buffer.from(stripBsp(raw, original).data).equals(Buffer.from(stripped))).toBe(true);
      }
    });

    it('covers every face material, and textures every drawable material whose VTF exists', async () => {
      const fs = openGameFileSystem(root, suite.game);
      for (const m of suite.maps) {
        const manifest = manifests.get(m)!;
        const bsp = parseBsp(
          new Uint8Array(readFileSync(path.join(root, MAPS_DIR[suite.game], `${m}.bsp`))),
        );
        for (const f of bsp.faces) {
          const name = texInfoMaterial(bsp, f.texInfo);
          if (name) expect(manifest.materials[materialKey(name)], name).toBeDefined();
        }
        expect(manifest.materials['tools/toolsnodraw']?.nodraw ?? true).toBe(true);
        if (manifest.materials['tools/toolsskybox'])
          expect(manifest.materials['tools/toolsskybox'].sky).toBe(true);
        let textured = 0;
        const pak = (await import('../../lib/tf2-game/formats/bsp')).openPakfile(bsp);
        fs.addFront({ kind: 'loose', read: (p) => (pak.has(p) ? pak.read(p) : null) });
        try {
          for (const [key, mat] of Object.entries(manifest.materials)) {
            expect(mat.color.every((c) => c >= 0 && c <= 1)).toBe(true);
            if (mat.nodraw || mat.sky || key.startsWith('tools/')) continue;
            const text = fs.readText(materialPath(key));
            if (!text) continue;
            const base = parseVmt(text, (p) => fs.readText(p)).params['$basetexture'];
            if (!base || /^_rt_|^env_cubemap$/i.test(base)) continue;
            if (!fs.read(texturePath(base))) continue;
            expect(mat.base, key).toBeDefined();
            expect(manifest.textures[mat.base!]).toBeDefined();
            textured++;
          }
        } finally {
          fs.paths.shift();
        }
        if (suite.textured) {
          expect(textured).toBeGreaterThan(20);
          expect(manifest.sky && Object.keys(manifest.sky.faces).length).toBe(6);
        } else {
          expect(Object.keys(manifest.textures)).toEqual([]);
        }
      }
    });

    it('writes each texture once, at the size the manifest says', async () => {
      // Identical VTF bytes (even under two paths) are one file; every reference agrees on its size.
      const seen = new Map<string, string>();
      for (const manifest of manifests.values()) {
        for (const t of Object.values(manifest.textures)) {
          const shape = `${t.w}x${t.h}:${t.alpha}`;
          expect(seen.get(t.file) ?? shape, t.file).toBe(shape);
          seen.set(t.file, shape);
        }
      }
      const wanted = JSON.parse(readFileSync(path.join(out, 'wanted.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      expect(Object.keys(wanted).filter((k) => k.startsWith('tex/')).length).toBe(seen.size);
      if (suite.maps.length > 1) {
        const [a, b] = [...manifests.values()].map(
          (x) => new Set(Object.values(x.textures).map((t) => t.file)),
        );
        expect([...a].filter((f) => b.has(f)).length).toBeGreaterThan(5);
      }
      const all = [...manifests.values()].flatMap((x) => Object.values(x.textures));
      for (const t of all.filter((_, i) => i % 7 === 0).slice(0, 40)) {
        const meta = await sharp(path.join(out, t.file)).metadata();
        expect([meta.width, meta.height]).toEqual([t.w, t.h]);
        expect(meta.format).toBe('webp');
        if (!t.alpha) expect(meta.hasAlpha).toBe(false);
      }
    });

    it('stores prop hulls that parse back to the .phy', () => {
      const fs = openGameFileSystem(root, suite.game);
      for (const manifest of manifests.values()) {
        expect(manifest.hulls).not.toBeNull();
        const hulls = parseHullsBin(new Uint8Array(readFileSync(path.join(out, manifest.hulls!))));
        const withHull = Object.entries(manifest.props).filter(([, p]) => p.hull !== undefined);
        expect(withHull.length).toBe(hulls.length);
        for (const [model, p] of withHull.slice(0, 10)) {
          const cm = loadPropCollisionModel(fs, model);
          if (!cm) continue; // packed in the map's pakfile
          expect(hulls[p.hull!].map((c) => [...c])).toEqual(cm.hulls.map((c) => [...c]));
        }
        for (const h of hulls) for (const c of h) expect(c.length % 3).toBe(0);
      }
    });

    it('rebuilds nothing when the state already holds the packages', async () => {
      const wanted = JSON.parse(readFileSync(path.join(out, 'wanted.json'), 'utf8')) as Record<
        string,
        { src: string; bytes?: number }
      >;
      const state = Object.fromEntries(
        Object.entries(wanted).map(([k, v]) => [k, { src: v.src, size: v.bytes ?? 0 }]),
      );
      const again = mkdtempSync(path.join(os.tmpdir(), `maps-${suite.game}-again-`));
      try {
        const r = await buildMaps({
          root,
          game: suite.game,
          maps: suite.maps,
          out: again,
          state,
          log: () => {},
        });
        expect(r.reports.map((x) => x.written)).toEqual(suite.maps.map(() => 0));
        expect(r.reports.map((x) => x.manifest)).toEqual(result.reports.map((x) => x.manifest));
        const next = JSON.parse(readFileSync(path.join(again, 'wanted.json'), 'utf8')) as Record<
          string,
          { src: string }
        >;
        expect(Object.keys(next).sort()).toEqual(Object.keys(wanted).sort());
      } finally {
        rmSync(again, { recursive: true, force: true });
      }
    }, 600_000);

    it('reports sizes', () => {
      const rows = result.reports.map((r: MapReport) => {
        table.push(
          `${suite.game} ${r.map}: bsp ${mib(r.bspBytes)} MiB raw / ${mib(r.bspBrotli ?? 0)} MiB brotli, ` +
            `textures ${r.textures} (${mib(r.textureBytes)} MiB), hulls ${mib(r.hullsBytes)} MiB`,
        );
        return r;
      });
      const n = GAME_MAPS[suite.game].length;
      const bsp = rows.reduce((s, r) => s + (r.bspBrotli ?? 0), 0) / rows.length;
      const tex = rows.reduce((s, r) => s + r.textureBytes, 0) / rows.length;
      table.push(
        `${suite.game}: projected for ${n} maps ≈ ${mib(bsp * n)} MiB BSP (brotli) + ≤ ${mib(tex * n)} MiB textures (before cross-map dedupe)`,
      );
      process.stdout.write(table.splice(0).join('\n') + '\n');
    });
  });
}
