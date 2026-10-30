import { describe, expect, it } from 'vitest';
import { patchMain, readGameSource, saveImportPath } from '@/lib/balatro/runtime';
import { crc32, extractEntry, readZip, writeZip } from '@/lib/balatro/zip';

/**
 * The Balatro loader touches user data in two places: the player's saves (export
 * to a zip, import from one, replacing what is in IndexedDB) and the game file
 * they pick. These pin the parts that can lose or misplace a save.
 */

const enc = new TextEncoder();

describe('balatro zip', () => {
  it('round-trips a stored zip', async () => {
    const files = [
      { name: 'Balatro/settings.jkr', data: enc.encode('settings') },
      { name: 'Balatro/1/save.jkr', data: new Uint8Array([0, 1, 2, 255]) },
    ];
    const zip = readZip(writeZip(files));
    expect(zip.prefix).toBe(0);
    expect(zip.entries.map((e) => e.name)).toEqual(files.map((f) => f.name));
    for (const [i, entry] of zip.entries.entries()) {
      expect(await extractEntry(zip, entry)).toEqual(files[i].data);
    }
  });

  it('finds a zip appended to an executable (a fused LÖVE game)', async () => {
    const inner = writeZip([{ name: 'main.lua', data: enc.encode('print(1)') }]);
    const exe = new Uint8Array(4096 + inner.length);
    exe.set(enc.encode('MZ'), 0);
    exe.set(inner, 4096);
    const zip = readZip(exe);
    expect(zip.prefix).toBe(4096);
    expect(new TextDecoder().decode(await extractEntry(zip, zip.entries[0]))).toBe('print(1)');
  });

  it('computes the standard CRC-32', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  });

  it('rejects a file with no zip', () => {
    expect(() => readZip(enc.encode('not a zip at all'))).toThrow();
  });
});

describe('balatro game source', () => {
  it('accepts Balatro and cuts the executable off', async () => {
    const inner = writeZip(
      ['main.lua', 'game.lua', 'globals.lua'].map((name) => ({ name, data: enc.encode('--') })).concat([
        { name: 'version.jkr', data: enc.encode('1.0.1o-FULL\n1.0.1o\n') },
      ]),
    );
    const exe = new Uint8Array(100 + inner.length);
    exe.set(inner, 100);
    const source = await readGameSource(exe);
    expect(source.version).toBe('1.0.1o-FULL');
    expect(source.zip.length).toBe(inner.length);
  });

  it('rejects another LÖVE game', async () => {
    const other = writeZip([{ name: 'main.lua', data: enc.encode('--') }]);
    await expect(readGameSource(other)).rejects.toMatchObject({ code: 'not-balatro' });
  });

  it('prefixes the platform layer without moving any line', () => {
    const main = 'line1\nline2';
    const patched = patchMain(main);
    expect(patched.split('\n')).toHaveLength(2);
    expect(patched.startsWith('require "rmh_web";')).toBe(true);
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
