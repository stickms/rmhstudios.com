import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chooseSnapshot, isSavePath, parseSnapshot, toSnapshot, type SaveFile } from '@/lib/balatro/cloud-saves';
import pack from '@/lib/balatro/game-pack.json';
import { patchMain, renderSize, saveImportPath } from '@/lib/balatro/runtime';
import { crc32, extractEntry, readZip, writeZip } from '@/lib/balatro/zip';

/**
 * /balatro touches user data in three places: the account backup of the save
 * directory (snapshot in, snapshot out, which copy wins), save import/export
 * zips, and the game packs a deploy must ship intact. These pin the parts that
 * can lose a save or break the page.
 */

const enc = new TextEncoder();

function file(path: string, text: string, mtime: number): SaveFile {
  return { path, data: enc.encode(text), mtime };
}

describe('balatro cloud saves', () => {
  it('round-trips a snapshot of the save directory', () => {
    const files = [file('settings.jkr', 'settings', 100), file('1/save.jkr', 'run', 200)];
    const snap = toSnapshot(files);
    expect(snap.savedAt).toBe(200);
    // Through JSON, as the shared save table stores it.
    const back = parseSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(back).toEqual(files);
  });

  it('carries binary save data intact', () => {
    const data = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    const back = parseSnapshot(JSON.parse(JSON.stringify(toSnapshot([{ path: '2/meta.jkr', data, mtime: 1 }]))));
    expect(back?.[0].data).toEqual(data);
  });

  it('rejects anything that is not a snapshot it wrote', () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({ v: 2, files: {} })).toBeNull();
    expect(parseSnapshot({ v: 1, files: { '../x.jkr': { data: '', mtime: 1 } } })).toBeNull();
    expect(parseSnapshot({ v: 1, files: { 'settings.jkr': { data: 5, mtime: 1 } } })).toBeNull();
  });

  it('starts from the newer copy, never from nothing over something', () => {
    const local = [file('settings.jkr', 'a', 100)];
    const newer = [file('settings.jkr', 'b', 200)];
    expect(chooseSnapshot(local, newer)).toBe('cloud');
    expect(chooseSnapshot(newer, local)).toBe('local');
    expect(chooseSnapshot([], local)).toBe('cloud');
    expect(chooseSnapshot(local, [])).toBe('local');
    expect(chooseSnapshot(local, null)).toBe('local');
  });

  it('only treats the game’s save files as saves', () => {
    for (const p of ['settings.jkr', 'metrics.jkr', '1/save.jkr', '3/profile.jkr', '2/unlock_notify.jkr']) {
      expect(isSavePath(p)).toBe(true);
    }
    for (const p of ['4/save.jkr', '1/deep/save.jkr', '../evil.jkr', 'readme.txt', '1/', '/settings.jkr']) {
      expect(isSavePath(p)).toBe(false);
    }
  });
});

describe('balatro save import paths', () => {
  it('maps the desktop layout into the save directory', () => {
    expect(saveImportPath('Balatro/settings.jkr')).toBe('settings.jkr');
    expect(saveImportPath('Balatro/1/save.jkr')).toBe('1/save.jkr');
    expect(saveImportPath('AppData/Roaming/Balatro/3/profile.jkr')).toBe('3/profile.jkr');
    expect(saveImportPath('2/meta.jkr')).toBe('2/meta.jkr');
    expect(saveImportPath('Balatro\\1\\save.jkr')).toBe('1/save.jkr');
  });

  it('ignores anything that is not a save, or would leave the directory', () => {
    expect(saveImportPath('Balatro/1/')).toBeNull();
    expect(saveImportPath('Balatro/readme.txt')).toBeNull();
    expect(saveImportPath('Balatro/../evil.jkr')).toBeNull();
    expect(saveImportPath('Balatro/4/save.jkr')).toBeNull();
    expect(saveImportPath('Balatro/1/deep/save.jkr')).toBeNull();
  });
});

describe('balatro zip', () => {
  it('round-trips a stored zip', async () => {
    const files = [
      { name: 'Balatro/settings.jkr', data: enc.encode('settings') },
      { name: 'Balatro/1/save.jkr', data: new Uint8Array([0, 1, 2, 255]) },
    ];
    const zip = readZip(writeZip(files));
    expect(zip.entries.map((e) => e.name)).toEqual(files.map((f) => f.name));
    for (const [i, entry] of zip.entries.entries()) {
      expect(await extractEntry(zip, entry)).toEqual(files[i].data);
    }
  });

  it('finds a zip with bytes in front of it (a fused LÖVE executable)', async () => {
    const inner = writeZip([{ name: 'main.lua', data: enc.encode('print(1)') }]);
    const exe = new Uint8Array(4096 + inner.length);
    exe.set(inner, 4096);
    const zip = readZip(exe);
    expect(zip.prefix).toBe(4096);
    expect(new TextDecoder().decode(await extractEntry(zip, zip.entries[0]))).toBe('print(1)');
  });

  it('computes the standard CRC-32', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('balatro boot', () => {
  it('prefixes the platform layer without moving any line', () => {
    const patched = patchMain('line1\nline2');
    expect(patched.split('\n')).toHaveLength(2);
    expect(patched.startsWith('require "rmh_web";')).toBe(true);
  });

  it('sizes the window in CSS pixels and renders at the device ratio, capped', () => {
    // Hi-DPI: the buffer is CSS × ratio, so a 2× screen draws at device resolution.
    expect(renderSize(1280, 720, 2)).toEqual({ w: 1280, h: 720, ratio: 2 });
    expect(renderSize(1280, 720, 1)).toEqual({ w: 1280, h: 720, ratio: 1 });
    expect(renderSize(1280, 720, 3)).toEqual({ w: 1280, h: 720, ratio: 2 }); // capped at 2
    // A very large frame lowers the ratio to stay under the pixel budget, never below 1.
    const big = renderSize(2560, 1440, 2);
    expect(big.ratio).toBe(1);
    const mid = renderSize(1920, 1080, 2);
    expect(mid.ratio).toBeGreaterThan(1);
    expect(1920 * 1080 * mid.ratio ** 2).toBeLessThanOrEqual(2560 * 1440 + 10_000);
    // A zoomed-out page (ratio < 1) keeps its own ratio.
    expect(renderSize(1280, 720, 0.8).ratio).toBe(0.8);
  });
});

describe('balatro game packs', () => {
  // The route serves exactly these names and the client verifies the hash; a
  // pack rebuilt without its manifest (or the reverse) is a page that never loads.
  for (const kind of ['core', 'audio', 'mp'] as const) {
    it(`ships the ${kind} pack named in game-pack.json`, () => {
      const info = pack[kind];
      const path = join(process.cwd(), 'data', 'balatro-pack', info.file);
      expect(statSync(path).size).toBe(info.bytes);
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(info.sha256);
      expect(info.file).toBe(`${kind}-${info.sha256.slice(0, 12)}.zip`);
    });
  }

  it('keeps the audio out of the core pack and the DLLs out of both', () => {
    const core = readZip(new Uint8Array(readFileSync(join(process.cwd(), 'data', 'balatro-pack', pack.core.file))));
    const names = core.entries.map((e) => e.name);
    expect(names).toContain('main.lua');
    expect(names.some((n) => n.startsWith('resources/sounds/'))).toBe(false);
    expect(names.some((n) => n.startsWith('dlls/'))).toBe(false);
  });

  it('keeps the multiplayer pack under rmh_mp/ and out of the core pack', () => {
    const names = (file: string) =>
      readZip(new Uint8Array(readFileSync(join(process.cwd(), 'data', 'balatro-pack', file)))).entries.map((e) => e.name);
    const mp = names(pack.mp.file);
    expect(mp).toContain('rmh_mp/loc/en-us.lua');
    expect(mp.every((n) => n.startsWith('rmh_mp/'))).toBe(true);
    expect(names(pack.core.file).some((n) => n.startsWith('rmh_mp/'))).toBe(false);
  });
});
