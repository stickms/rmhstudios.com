import { readFileSync } from 'node:fs';
import path from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  gameAssetCacheControl,
  gameAssetContentType,
  isContentAddressed,
  isSafeGameAssetPath,
} from './paths';
import { formatUsage, GB, overBudget, projectedUsage, storedUsage } from './storage';
import {
  clearGameAssetCache,
  fetchGameJson,
  GAME_ASSET_API,
  gameAssetApi,
  gameAssetUrl,
  loadUiIndex,
  particleAssetUrl,
  soundUrl,
  uiAssetUrl,
} from './urls';
import { CSGO_MAPS, findGameMap, GAME_MAPS } from './game-maps';
import {
  channelPrefix,
  channelPublishPrefix,
  channelStateKey,
  COUNTED_CHANNELS,
  GAME_ASSET_CHANNELS,
  GAME_IDS,
  GAME_STORAGE_BUDGET_GB,
  type GameId,
} from './versions';

const SHA = 'a'.repeat(64);

describe('game asset paths', () => {
  it.each([
    `snd/${SHA}.mp3`,
    'snd/index.json',
    `particles/effects/${SHA}.json`,
    `particles/tex/${SHA}.webp`,
    'particles/index.json',
    `mdl/${SHA}.glb`,
    'mdl/index.json',
    'mdl/players/scout.anims.json',
    `tex/${SHA}.webp`,
    'maps/ctf_2fort.bsp',
    `maps/ctf_2fort/${SHA}.bin`,
    // CS:GO's ui channel: sanitised Panorama icons, localisation and weapon data.
    'ui/index.json',
    `ui/icons/${SHA}.svg`,
    `ui/lang/${SHA}.json`,
    `ui/data/${SHA}.json`,
  ])('serves %s', (p) => expect(isSafeGameAssetPath(p)).toBe(true));

  it.each([
    '',
    'index.json',
    'snd',
    'snd/',
    'sounds/index.json',
    'snd/../snd/index.json',
    'snd/..json',
    'snd//index.json',
    'snd/_state.json',
    'mdl/_state.json',
    'snd/.hidden.mp3',
    'snd/Index.json',
    '/snd/index.json',
    'snd\\index.json',
    'snd/index.json?x=1',
    'snd/a b.mp3',
    'snd/wanted.txt',
    'maps/ctf_2fort.vmt',
    'snd/noext',
    'ui/_state.json',
    'ui/icons/x.svgz',
    'ui/lang/csgo_english.txt',
    'ui/icons/X.svg',
    `snd/${'a'.repeat(600)}.mp3`,
  ])('refuses %j', (p) => expect(isSafeGameAssetPath(p)).toBe(false));

  it('maps extensions to content types', () => {
    expect(gameAssetContentType('mdl/x.glb')).toBe('model/gltf-binary');
    expect(gameAssetContentType('tex/x.webp')).toBe('image/webp');
    expect(gameAssetContentType('snd/index.json')).toBe('application/json');
    expect(gameAssetContentType('snd/x.mp3')).toBe('audio/mpeg');
    expect(gameAssetContentType('maps/x.bin')).toBe('application/octet-stream');
    expect(gameAssetContentType('maps/x.bsp')).toBe('application/octet-stream');
    expect(gameAssetContentType('maps/x.vtf')).toBeNull();
    expect(gameAssetContentType(`ui/icons/${SHA}.svg`)).toBe('image/svg+xml');
    expect(gameAssetContentType('maps.d/x')).toBeNull();
  });

  it('caches content-addressed files for a year and entry points for five minutes', () => {
    expect(isContentAddressed(`snd/${SHA}.mp3`)).toBe(true);
    expect(isContentAddressed(`particles/effects/${SHA}.json`)).toBe(true);
    expect(isContentAddressed('snd/index.json')).toBe(false);
    expect(isContentAddressed(`snd/${SHA.slice(1)}.mp3`)).toBe(false);
    expect(gameAssetCacheControl(`tex/${SHA}.webp`)).toBe('public, max-age=31536000, immutable');
    expect(gameAssetCacheControl('mdl/index.json')).toBe(
      'public, max-age=300, stale-while-revalidate=3600',
    );
  });
});

describe('browser urls', () => {
  beforeEach(() => clearGameAssetCache());

  it('builds API urls and refuses unsafe paths', () => {
    expect(GAME_ASSET_API).toBe('/api/tf2-game/assets/');
    expect(gameAssetApi('hl2')).toBe('/api/hl2-game/assets/');
    expect(gameAssetApi('csgo')).toBe('/api/csgo-game/assets/');
    expect(uiAssetUrl(`icons/${SHA}.svg`)).toBe(`/api/csgo-game/assets/ui/icons/${SHA}.svg`);
    expect(soundUrl(SHA, 'csgo')).toBe(`/api/csgo-game/assets/snd/${SHA}.mp3`);
    expect(() => uiAssetUrl('../maps/index.json')).toThrow();
    expect(soundUrl(SHA)).toBe(`/api/tf2-game/assets/snd/${SHA}.mp3`);
    expect(soundUrl(`${SHA}.mp3`)).toBe(`/api/tf2-game/assets/snd/${SHA}.mp3`);
    expect(particleAssetUrl(`tex/${SHA}.webp`)).toBe(
      `/api/tf2-game/assets/particles/tex/${SHA}.webp`,
    );
    expect(() => gameAssetUrl('snd/../../secret.json')).toThrow();
  });

  it('fetches an index once, maps 404 to null and retries after an error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"v":1}', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('{"v":1,"systems":{}}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const a = await fetchGameJson('snd/index.json');
      const b = await fetchGameJson('snd/index.json');
      expect(a).toEqual({ v: 1 });
      expect(b).toBe(a);
      expect(await fetchGameJson('mdl/index.json')).toBeNull();
      await expect(fetchGameJson('particles/index.json')).rejects.toThrow('HTTP 500');
      expect(await fetchGameJson('particles/index.json')).toEqual({ v: 1, systems: {} });
      expect(fetchMock).toHaveBeenCalledTimes(4);
      fetchMock.mockResolvedValueOnce(new Response('{"v":1,"icons":{},"lang":{},"weapons":null}'));
      expect(await loadUiIndex()).toEqual({ v: 1, icons: {}, lang: {}, weapons: null });
      expect(fetchMock).toHaveBeenLastCalledWith('/api/csgo-game/assets/ui/index.json');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('storage budget', () => {
  const state = {
    models: {
      'a.mp3': { src: '1', size: 100 },
      'b.mp3': { src: '2', size: 200 },
      'stale.mp3': { src: '3', size: 50 },
    },
  };

  it('sums stored sizes from the state file', () => {
    expect(storedUsage('tf2-game/snd/', state)).toEqual({
      name: 'tf2-game/snd/',
      files: 3,
      bytes: 350,
    });
  });

  it('projects a push: unchanged keep their stored size, changed and new count raw, stale stay', () => {
    const usage = projectedUsage('snd', state, {
      wanted: { 'a.mp3': { src: '1' }, 'b.mp3': { src: 'new' }, 'c.mp3': { src: '4' } },
      localSizes: { 'b.mp3': 300, 'c.mp3': 1000 },
    });
    expect(usage).toEqual({ name: 'snd', files: 4, bytes: 100 + 300 + 50 + 1000 });
  });

  it('fails past the budget', () => {
    expect(overBudget([{ name: 'x', files: 1, bytes: 12 * GB }], 12).over).toBe(false);
    expect(overBudget([{ name: 'x', files: 1, bytes: 12 * GB + 1 }], 12).over).toBe(true);
    expect(formatUsage([{ name: 'x', files: 1, bytes: 13 * GB }], 12)).toContain('OVER BUDGET');
    expect(GAME_STORAGE_BUDGET_GB).toBe(12);
  });

  it("counts every game's channels once, the model and map channels' shared tex/ once per game", () => {
    // storage-report.ts walks GAME_ASSET_CHANNELS with one `seen` set: CS:GO is counted like the rest.
    const games = new Set(Object.values(GAME_ASSET_CHANNELS).map((c) => c.game));
    expect([...games].sort()).toEqual([...GAME_IDS].sort());
    const tex = `tex/${'c'.repeat(40)}.webp`;
    const seen = new Set<string>();
    const usage = (name: keyof typeof GAME_ASSET_CHANNELS, files: Record<string, number>) => {
      const c = GAME_ASSET_CHANNELS[name];
      const st = {
        models: Object.fromEntries(Object.entries(files).map(([f, size]) => [f, { src: f, size }])),
      };
      return storedUsage(channelPrefix(c), st, { root: channelPublishPrefix(c), seen });
    };
    const maps = usage('csgo-maps', { [tex]: 1000, 'maps/index.json': 10 });
    const mdl = usage('csgo-models', { [tex]: 1000, 'mdl/index.json': 20 });
    const ui = usage('csgo-ui', { 'index.json': 5, [`icons/${SHA}.svg`]: 300 });
    // The same tex/ name under TF2 is another object.
    const tf2 = usage('game-models', { [tex]: 1000 });
    expect([maps.bytes, mdl.bytes, ui.bytes, tf2.bytes]).toEqual([1010, 20, 305, 1000]);
    expect(channelPublishPrefix(GAME_ASSET_CHANNELS['csgo-ui'])).toBe('csgo-game/ui/');
    expect(channelPublishPrefix(GAME_ASSET_CHANNELS['csgo-maps'])).toBe('csgo-game/');
  });
});

describe('CS:GO', () => {
  it('publishes de_dust2 only (deathmatch reuses it)', () => {
    expect(CSGO_MAPS).toEqual([{ name: 'de_dust2', title: 'Dust II', mode: 'de' }]);
    expect(GAME_MAPS.csgo).toBe(CSGO_MAPS);
    expect(findGameMap('csgo', 'de_dust2')?.title).toBe('Dust II');
    expect(findGameMap('csgo', 'de_inferno')).toBeNull();
  });

  it('has a thin asset route like the other games', () => {
    const route = readFileSync(
      path.resolve(import.meta.dirname, '../../../app/routes/api/csgo-game/assets/$.ts'),
      'utf8',
    );
    expect(route).toContain("createFileRoute('/api/csgo-game/assets/$')");
    expect(route).toContain("'csgo',");
    expect(route).toContain('rateLimit: GAME_ASSET_RATE_LIMIT');
    const tree = readFileSync(
      path.resolve(import.meta.dirname, '../../../app/routeTree.gen.ts'),
      'utf8',
    );
    expect(tree).toContain("'/api/csgo-game/assets/$'");
  });
});

describe('channels and the sync workflow', () => {
  const read = (name: string) =>
    readFileSync(path.resolve(import.meta.dirname, `../../../.github/workflows/${name}`), 'utf8');
  const workflow = read('tf2-assets-sync.yml');
  // CS:GO runs in its own workflow, so the TF2 job keeps its time and disk budget.
  const csgoWorkflow = read('csgo-assets-sync.yml');
  const workflowOf = (game: GameId) => (game === 'csgo' ? csgoWorkflow : workflow);

  it('gates and pushes every channel with its builder version from versions.ts', () => {
    for (const channel of Object.values(GAME_ASSET_CHANNELS)) {
      const workflow = workflowOf(channel.game);
      const key = channelStateKey(channel);
      const gate = new RegExp(`gate --as \\w+ --state-key ${key} .*--builder "\\$${channel.env}"`);
      const push = new RegExp(`--state-key ${key} [^\\n]*\\n[^\\n]*--builder "\\$${channel.env}"`);
      expect(workflow, `gate for ${key}`).toMatch(gate);
      expect(workflow, `push for ${key}`).toMatch(push);
      expect(workflow, `budget for ${key}`).toContain(`--pending ${channelPrefix(channel)}=`);
    }
    expect(workflow).toContain('scripts/tf2-game/storage-report.ts builders');
    expect(csgoWorkflow).toContain('scripts/tf2-game/storage-report.ts builders');
    expect(csgoWorkflow).toContain('scripts/tf2-game/storage-report.ts report');
    // The CS:GO job never downloads or publishes another game.
    expect(csgoWorkflow).not.toMatch(/app_update (440|219|410)\b/);
    expect(csgoWorkflow).not.toMatch(/--prefix (tf2|hl2|portal)-game\//);
  });

  it('counts the HUD base (and the game localisation it publishes) against the same budget', () => {
    expect(COUNTED_CHANNELS).toContain('tf2-hud-base/');
    for (const prefix of COUNTED_CHANNELS) {
      expect(workflow, `budget for ${prefix}`).toContain(`--pending ${prefix}=`);
      // Published by the same tool, so its state file has the shape the guard reads.
      expect(workflow).toContain(
        `--prefix ${prefix} \\\n            --state-key ${prefix}_state.json`,
      );
    }
  });

  it('keeps every state key distinct and under its game prefix', () => {
    const keys = Object.values(GAME_ASSET_CHANNELS).map(channelStateKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys)
      expect(k).toMatch(
        /^(tf2|hl2|portal|csgo)-game\/(maps|mdl|tex|snd|particles|ui)\/_state\.json$/,
      );
  });
});

describe('readGameAsset', () => {
  it('passes Brotli through when accepted and inflates otherwise', async () => {
    vi.resetModules();
    const raw = Buffer.from('{"v":1}');
    const readStored = vi.fn(async (key: string) =>
      key === 'tf2-game/snd/index.json'
        ? {
            body: brotliCompressSync(raw),
            contentType: 'application/json',
            contentEncoding: 'br',
            etag: 'x',
          }
        : null,
    );
    vi.doMock('@/lib/tf2-loadout/stored-cache.server', () => ({ readStored }));
    const { readGameAsset, gameAssetHeaders } = await import('./store.server');
    const br = await readGameAsset('snd/index.json', 'gzip, br');
    expect(br?.contentEncoding).toBe('br');
    expect(gameAssetHeaders('snd/index.json', br!)).toMatchObject({
      'Content-Type': 'application/json',
      'Content-Encoding': 'br',
      Vary: 'Accept-Encoding',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    });
    const plain = await readGameAsset('snd/index.json', 'gzip, br;q=0');
    expect(plain?.contentEncoding).toBeUndefined();
    expect(plain?.body.equals(raw)).toBe(true);
    expect(await readGameAsset('snd/_state.json', 'br')).toBeNull();
    expect(await readGameAsset(`snd/${SHA}.mp3`, 'br')).toBeNull();
    expect(readStored).toHaveBeenCalledTimes(3);
    expect(readStored).toHaveBeenLastCalledWith(`tf2-game/snd/${SHA}.mp3`);
    // CS:GO's assets are read from csgo-game/; its icons are served with a sandboxing CSP.
    readStored.mockResolvedValueOnce({
      body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      contentType: 'image/svg+xml',
      contentEncoding: undefined as unknown as string,
      etag: 'y',
    });
    const svg = await readGameAsset(`ui/icons/${SHA}.svg`, 'br', 'csgo');
    expect(readStored).toHaveBeenLastCalledWith(`csgo-game/ui/icons/${SHA}.svg`);
    expect(gameAssetHeaders(`ui/icons/${SHA}.svg`, svg!)).toMatchObject({
      'Content-Type': 'image/svg+xml',
      'Content-Security-Policy': expect.stringContaining('sandbox'),
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    expect(gameAssetHeaders('snd/index.json', br!)['Content-Security-Policy']).toBeUndefined();
    vi.doUnmock('@/lib/tf2-loadout/stored-cache.server');
  });
});
