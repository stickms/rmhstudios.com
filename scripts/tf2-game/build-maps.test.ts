/**
 * The map channel against real installs. Each game's block skips unless its install is given:
 * TF2_ROOT (a TF2 or dedicated-server install: no texture data, so its maps build untextured),
 * HL2_ROOT (Half-Life 2 demo, app 219), PORTAL_ROOT (Portal: First Slice, app 410) and CSGO_ROOT
 * (the CS:GO dedicated server, app 740). The overview / radar pieces run on synthetic files.
 *
 *   HL2_ROOT=… PORTAL_ROOT=… TF2_ROOT=… pnpm test:tf2 scripts/tf2-game/build-maps.test.ts
 *
 * Prints each map's sizes and the projection for the game's whole list (docs/tf2-game.md "Maps").
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LUMP, parseBsp, texInfoMaterial, type BspFile } from '../../lib/tf2-game/formats/bsp';
import { materialPath, parseVmt, texturePath } from '../../lib/tf2-game/formats/vmt';
import { GameFileSystem, type SearchPath } from '../../lib/tf2-game/formats/vpk';
import { decodeNavMesh } from '../../lib/tf2-game/bots/nav/serialize';
import { loadPropCollisionModel } from '../../lib/tf2-game/world/prop-collision';
import { GAME_MAPS } from '../../lib/tf2-game/assets/game-maps';
import {
  mapIndexSchema,
  mapManifestSchema,
  parseHullsBin,
  radarToWorld,
  worldToRadar,
  writeHullsBin,
  type MapManifest,
} from '../../lib/tf2-game/assets/map-manifest';
import { isContentAddressed } from '../../lib/tf2-game/assets/paths';
import type { GameId } from '../../lib/tf2-game/assets/versions';
import {
  buildMaps,
  collectActorModels,
  decodeResourceText,
  extractPakModels,
  GAME_ALWAYS_MODELS,
  GAME_SEARCH,
  NAV_HULL_BY_GAME,
  OVERVIEW_SIZE,
  parseOverview,
  RADAR_GAMES,
  resolveRadar,
  listMapProps,
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
  csgo: process.env.CSGO_ROOT ?? '',
};
const MAPS_DIR: Record<GameId, string> = {
  tf2: 'tf/maps',
  hl2: 'hl2/maps',
  portal: 'portal/maps',
  csgo: 'csgo/maps',
};
const mib = (b: number) => (b / 1048576).toFixed(1);

describe('map package pieces', () => {
  it("always lists Portal's portal gun models, which no map names", () => {
    expect(GAME_ALWAYS_MODELS.portal).toEqual([
      'models/weapons/v_portalgun.mdl',
      'models/weapons/w_portalgun.mdl',
    ]);
    for (const list of Object.values(GAME_ALWAYS_MODELS))
      for (const m of list) expect(m).toMatch(/^models\/[a-z0-9_/]+\.mdl$/);
  });

  it("writes a map's embedded models and materials out as loose files and names its models", () => {
    // A stored zip (local headers, central directory, end record) of three entries.
    const files: Array<[string, string]> = [
      ['models/props/autocombine/de_dust2/_autocombine_a_1.mdl', 'IDST'],
      ['materials/models/props/autocombine/a.vmt', '"VertexLitGeneric" {}'],
      ['sound/ambient/x.wav', 'RIFF'],
    ];
    const out: number[] = [];
    const u16 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff);
    const u32 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    const str = (t: string) => {
      for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i));
    };
    // Fields as [bytes, value]: 2- and 4-byte little-endian integers.
    const put = (...fields: Array<[2 | 4, number]>) => {
      for (const [n, v] of fields) (n === 2 ? u16 : u32)(v);
    };
    const at: number[] = [];
    for (const [name, body] of files) {
      at.push(out.length);
      put([4, 0x04034b50], [2, 20], [2, 0], [2, 0], [2, 0], [2, 0], [4, 0], [4, body.length], [4, body.length]);
      put([2, name.length], [2, 0]);
      str(name);
      str(body);
    }
    const cd = out.length;
    files.forEach(([name, body], i) => {
      put([4, 0x02014b50], [2, 20], [2, 20], [2, 0], [2, 0], [2, 0], [2, 0], [4, 0], [4, body.length], [4, body.length]);
      put([2, name.length], [2, 0], [2, 0], [2, 0], [2, 0], [4, 0], [4, at[i]]);
      str(name);
    });
    put([4, 0x06054b50], [2, 0], [2, 0], [2, files.length], [2, files.length], [4, out.length - cd], [4, cd], [2, 0]);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pak-'));
    try {
      const models = extractPakModels({ pakfile: new Uint8Array(out) } as unknown as BspFile, dir);
      expect([...models]).toEqual(['models/props/autocombine/de_dust2/_autocombine_a_1.mdl']);
      expect(readFileSync(path.join(dir, files[0][0]), 'utf8')).toBe('IDST');
      expect(readFileSync(path.join(dir, files[1][0]), 'utf8')).toBe('"VertexLitGeneric" {}');
      expect(existsSync(path.join(dir, files[2][0]))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lists the maps' NPCs' models: the map's, else the class's default", () => {
    const ent = (classname: string, model = '') => ({
      classname,
      get: (k: string) => (k === 'model' ? model : ''),
    });
    const bsp = {
      entities: [
        ent('npc_metropolice'),
        ent('npc_citizen', 'models/Humans/Group01/Female_02.mdl'),
        ent('generic_actor', 'models/kleiner.mdl'),
        ent('prop_dynamic', 'models/props_c17/chair.mdl'),
        ent('npc_unknown'),
      ],
    } as unknown as BspFile;
    expect(collectActorModels(bsp)).toEqual([
      'models/humans/group01/female_02.mdl',
      'models/kleiner.mdl',
      'models/police.mdl',
    ]);
  });

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

// --- CS:GO: search path, nav hull and the overview (radar) ----------------------------------------

/** A 7.2 VTF of `w`×`h` RGBA8888 pixels, one mip, no thumbnail. */
function syntheticVtf(w: number, h: number, alpha = 128): Uint8Array {
  const out = new Uint8Array(80 + w * h * 4);
  const v = new DataView(out.buffer);
  out.set([0x56, 0x54, 0x46, 0]);
  v.setInt32(4, 7, true);
  v.setInt32(8, 2, true);
  v.setInt32(12, 80, true);
  v.setUint16(16, w, true);
  v.setUint16(18, h, true);
  v.setUint16(24, 1, true);
  v.setInt32(52, 0, true); // RGBA8888
  out[56] = 1;
  v.setInt32(57, -1, true); // no low-res image
  v.setUint16(63, 1, true);
  for (let i = 0; i < w * h; i++) out.set([200, 180, 120, alpha], 80 + i * 4);
  return out;
}

function memoryFs(files: Record<string, Uint8Array | string>): GameFileSystem {
  const bytes = (f: Uint8Array | string) => (typeof f === 'string' ? Buffer.from(f, 'latin1') : f);
  const sp: SearchPath = {
    kind: 'loose',
    name: 'memory',
    read: (p) => (files[p] !== undefined ? new Uint8Array(bytes(files[p])) : null),
    exists: (p) => files[p] !== undefined,
  };
  return new GameFileSystem().add(sp);
}

const DUST2_OVERVIEW = `// de_dust2
"de_dust2"
{
	"material"	"overviews/de_dust2"	// texture file
	"pos_x"		"-2476"	// upper left world coordinate
	"pos_y"		"3239"
	"scale"		"4.4"
	"rotate"	"1"
	"zoom"		"1.1"
}
`;

describe('CS:GO map pieces', () => {
  it('searches csgo/pak01 then loose csgo/, builds radars and walks the CS hull', () => {
    expect(GAME_SEARCH.csgo).toEqual({ vpks: ['csgo/pak01'], loose: ['csgo'], maps: 'csgo/maps' });
    expect(RADAR_GAMES.has('csgo')).toBe(true);
    expect(RADAR_GAMES.has('tf2')).toBe(false);
    expect(NAV_HULL_BY_GAME.csgo).toMatchObject({
      halfWidth: 16,
      standHeight: 72,
      crouchHeight: 54,
    });
    expect(NAV_HULL_BY_GAME.tf2).toBeUndefined();
    expect(GAME_ALWAYS_MODELS.csgo).toEqual([]);
  });

  it('parses an overview', () => {
    expect(parseOverview(DUST2_OVERVIEW, 'de_dust2')).toEqual({
      material: 'overviews/de_dust2',
      posX: -2476,
      posY: 3239,
      scale: 4.4,
      rotate: true,
      zoom: 1.1,
      sections: [],
    });
    // Material defaults to overviews/<map>; vertical sections (nuke-style) are read by name.
    const nuke = parseOverview(
      `"de_x" { "pos_x" "-3453" "pos_y" "2887" "scale" "7"
        "verticalsections" { "default" { "AltitudeMax" "10000" "AltitudeMin" "-495" }
                             "lower" { "AltitudeMax" "-495" "AltitudeMin" "-10000" } } }`,
      'de_x',
    );
    expect(nuke?.material).toBe('overviews/de_x');
    expect(nuke?.rotate).toBe(false);
    expect(nuke?.zoom).toBeNull();
    expect(nuke?.sections).toEqual([
      { name: 'default', altitudeMin: -495, altitudeMax: 10000 },
      { name: 'lower', altitudeMin: -10000, altitudeMax: -495 },
    ]);
    expect(parseOverview('"de_x" { "pos_x" "1" "scale" "0" }', 'de_x')).toBeNull();
    expect(parseOverview('not keyvalues', 'de_x')).toBeNull();
  });

  it('decodes UTF-16 resource text', () => {
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('"a" { "b" "c" }', 'utf16le'),
    ]);
    expect(decodeResourceText(new Uint8Array(utf16))).toBe('"a" { "b" "c" }');
    expect(decodeResourceText(new Uint8Array(Buffer.from('plain', 'latin1')))).toBe('plain');
  });

  it("maps world positions onto the radar with the overview's transform", () => {
    const radar = { posX: -2476, posY: 3239, scale: 4.4, size: OVERVIEW_SIZE };
    // The top-left corner is (0, 0); one image width to the right and down is (1, 1).
    expect(worldToRadar(radar, -2476, 3239)).toEqual({ u: 0, v: 0 });
    const far = worldToRadar(radar, -2476 + 4.4 * 1024, 3239 - 4.4 * 1024);
    expect(far.u).toBeCloseTo(1, 10);
    expect(far.v).toBeCloseTo(1, 10);
    // Pixel (512, 256) of the 1024 source.
    const p = worldToRadar(radar, -2476 + 512 * 4.4, 3239 - 256 * 4.4);
    expect(p.u * 1024).toBeCloseTo(512, 6);
    expect(p.v * 1024).toBeCloseTo(256, 6);
    const back = radarToWorld(radar, p.u, p.v);
    expect(back.x).toBeCloseTo(-2476 + 512 * 4.4, 6);
    expect(back.y).toBeCloseTo(3239 - 256 * 4.4, 6);
  });

  it('plans the radar texture and its sections; a missing image means no radar', () => {
    const fs = memoryFs({
      'resource/overviews/de_dust2.txt': DUST2_OVERVIEW,
      'materials/overviews/de_dust2_radar.vtf': syntheticVtf(8, 8),
    });
    const r = resolveRadar(fs, 'de_dust2');
    expect(r.missing).toEqual([]);
    expect(r.textures).toHaveLength(1);
    expect(r.textures[0].keepAlpha).toBe(true);
    expect(r.radar).toMatchObject({ file: r.textures[0].rel, w: 8, h: 8, posX: -2476, posY: 3239 });
    expect(r.radar?.rotate).toBe(true);
    expect(r.radar?.file).toMatch(/^tex\/[a-f0-9]{40}\.webp$/);

    const sections = memoryFs({
      'resource/overviews/de_x.txt':
        '"de_x" { "pos_x" "0" "pos_y" "0" "scale" "5" "verticalsections" { "default" { } "lower" { } } }',
      'materials/overviews/de_x_radar.vtf': syntheticVtf(4, 4, 255),
    });
    const s = resolveRadar(sections, 'de_x');
    expect(s.radar?.sections?.map((x) => x.name)).toEqual(['default', 'lower']);
    expect(s.radar?.sections?.[1].file).toBeUndefined();
    expect(s.missing[0]).toMatch(
      /radar section lower: materials\/overviews\/de_x_lower_radar\.vtf/,
    );

    expect(resolveRadar(memoryFs({}), 'de_dust2').radar).toBeNull();
    expect(
      resolveRadar(memoryFs({ 'resource/overviews/de_dust2.txt': DUST2_OVERVIEW }), 'de_dust2')
        .radar,
    ).toBeNull();
  });

  it('accepts a CS:GO manifest with a radar (and the other games without one)', () => {
    const base = {
      v: 1,
      map: 'de_dust2',
      bsp: `maps/${'a'.repeat(64)}.bsp`,
      bspBytes: 1,
      lighting: 'hdr',
      materials: {},
      textures: {},
      sky: null,
      props: {},
      hulls: null,
      nav: null,
    };
    const radar = {
      file: `tex/${'b'.repeat(40)}.webp`,
      w: 1024,
      h: 1024,
      posX: -2476,
      posY: 3239,
      scale: 4.4,
      size: 1024,
      rotate: true,
    };
    expect(mapManifestSchema.safeParse({ ...base, game: 'csgo', radar }).success).toBe(true);
    expect(mapManifestSchema.safeParse({ ...base, game: 'tf2' }).success).toBe(true);
    expect(
      mapManifestSchema.safeParse({ ...base, game: 'csgo', radar: { ...radar, scale: 0 } }).success,
    ).toBe(false);
    expect(
      mapManifestSchema.safeParse({ ...base, game: 'csgo', radar: { ...radar, file: 'x.webp' } })
        .success,
    ).toBe(false);
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
  // CS:GO's dedicated server ships the full content depot (textures included) — CI verifies it.
  { game: 'csgo', maps: ['de_dust2'], textured: true },
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
        if (suite.game === 'tf2') {
          // The bots' navigation mesh (lib/tf2-game/bots/nav), written and decodable.
          expect(manifest.nav).toMatch(/^maps\/[a-f0-9]{64}\.nav\.bin$/);
          const mesh = decodeNavMesh(new Uint8Array(readFileSync(path.join(out, manifest.nav!))));
          expect(mesh.areaCount).toBeGreaterThan(100);
        } else expect(manifest.nav).toBeNull();
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
      // Models the client draws that no map names (Portal's portal gun) ride along.
      expect(props).toEqual(expect.arrayContaining([...GAME_ALWAYS_MODELS[suite.game]]));
    });

    it('lists the props, and the always-included models, with --props-only', () => {
      const list = path.join(out, 'props-only.list');
      writeFileSync(list, '');
      const n = listMapProps(root, suite.game, suite.maps, list);
      const props = readFileSync(list, 'utf8').trim().split('\n');
      expect(props.length).toBe(n);
      expect(props).toEqual(expect.arrayContaining([...GAME_ALWAYS_MODELS[suite.game]]));
      // The same set the build appended.
      const built = readFileSync(path.join(out, 'props.list'), 'utf8').trim().split('\n');
      expect([...props].sort()).toEqual([...built].sort());
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
