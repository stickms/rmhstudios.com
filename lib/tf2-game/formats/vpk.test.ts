import { describe, expect, it } from 'vitest';
import { GameFileSystem, normalizeGamePath, parseVpkDir, VPK_DIR_ARCHIVE } from './vpk';
import { gameFileSystem, readGameFile, vpkSearchPath } from './tf2-root.test-support';

interface FakeFile {
  ext: string;
  dir: string;
  name: string;
  preload: number[];
  archive: number;
  offset: number;
  length: number;
}

/** Builds a VPK directory (v1 or v2) with optional embedded data after the tree. */
function buildVpk(version: 1 | 2, files: FakeFile[], embedded: number[] = []): Uint8Array {
  const tree: number[] = [];
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) tree.push(s.charCodeAt(i));
    tree.push(0);
  };
  const u16 = (v: number) => tree.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v: number) =>
    tree.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const exts = [...new Set(files.map((f) => f.ext))];
  for (const ext of exts) {
    str(ext);
    const dirs = [...new Set(files.filter((f) => f.ext === ext).map((f) => f.dir))];
    for (const dir of dirs) {
      str(dir);
      for (const f of files.filter((x) => x.ext === ext && x.dir === dir)) {
        str(f.name);
        u32(0xdeadbeef);
        u16(f.preload.length);
        u16(f.archive);
        u32(f.offset);
        u32(f.length);
        u16(0xffff);
        tree.push(...f.preload);
      }
      str('');
    }
    str('');
  }
  str('');
  const header = version === 1 ? 12 : 28;
  const out = new Uint8Array(header + tree.length + embedded.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x55aa1234, true);
  view.setUint32(4, version, true);
  view.setUint32(8, tree.length, true);
  if (version === 2) view.setUint32(12, embedded.length, true);
  out.set(tree, header);
  out.set(embedded, header + tree.length);
  return out;
}

describe('vpk', () => {
  const files: FakeFile[] = [
    {
      ext: 'vmt',
      dir: 'materials/Foo',
      name: 'Bar',
      preload: [1, 2, 3],
      archive: 0,
      offset: 10,
      length: 4,
    },
    { ext: 'txt', dir: ' ', name: 'readme', preload: [65, 66], archive: 0, offset: 0, length: 0 },
    {
      ext: 'res',
      dir: 'resource',
      name: 'embedded',
      preload: [],
      archive: VPK_DIR_ARCHIVE,
      offset: 2,
      length: 3,
    },
    { ext: ' ', dir: 'scripts', name: 'noext', preload: [], archive: 1, offset: 0, length: 2 },
  ];

  for (const version of [1, 2] as const) {
    it(`parses a v${version} directory and reads preload, archive and embedded data`, () => {
      const dir = buildVpk(version, files, [9, 9, 7, 8, 9, 9]);
      const idx = parseVpkDir(dir);
      expect(idx.version).toBe(version);
      expect(idx.size).toBe(4);
      const archives: Record<number, Uint8Array> = {
        0: Uint8Array.from({ length: 32 }, (_, i) => 100 + i),
        1: new Uint8Array([42, 43]),
      };
      const read = (a: number, o: number, l: number) => archives[a].subarray(o, o + l);
      expect([...idx.read('MATERIALS\\foo\\bar.VMT', read)!]).toEqual([
        1, 2, 3, 110, 111, 112, 113,
      ]);
      expect([...idx.read('readme.txt', read)!]).toEqual([65, 66]);
      expect([...idx.read('resource/embedded.res', read)!]).toEqual([7, 8, 9]);
      expect([...idx.read('scripts/noext', read)!]).toEqual([42, 43]);
      expect(idx.read('missing.txt', read)).toBeNull();
      expect(idx.list('materials', 'vmt')).toEqual(['materials/foo/bar.vmt']);
      expect(idx.list('', '.txt')).toEqual(['readme.txt']);
      expect(idx.archiveIndices()).toEqual([0, 1]);
    });
  }

  it('rejects a non-VPK', () => {
    expect(() => parseVpkDir(new Uint8Array(16))).toThrow();
  });

  it('normalizes paths', () => {
    expect(normalizeGamePath('.\\Models//Props\\A.MDL')).toBe('models/props/a.mdl');
  });

  it('GameFileSystem searches paths in order and falls through missing archives', () => {
    const a = parseVpkDir(buildVpk(2, [files[0]]));
    const b = parseVpkDir(buildVpk(1, [files[0], files[1]]));
    const fs = new GameFileSystem();
    fs.add({
      kind: 'vpk',
      index: a,
      readArchive: () => {
        throw new Error('archive missing');
      },
    });
    fs.add({ kind: 'vpk', index: b, readArchive: (_a, o, l) => new Uint8Array(l).fill(o) });
    fs.add({ kind: 'loose', read: (p) => (p === 'loose.txt' ? new Uint8Array([5]) : null) });
    expect([...fs.read('materials/foo/bar.vmt')!]).toEqual([1, 2, 3, 10, 10, 10, 10]);
    expect(fs.readText('readme.txt')).toBe('AB');
    expect(fs.exists('LOOSE.txt')).toBe(true);
    expect(fs.read('nope')).toBeNull();
    fs.addFront({ kind: 'loose', read: (p) => (p === 'readme.txt' ? new Uint8Array([90]) : null) });
    expect(fs.readText('readme.txt')).toBe('Z');
  });
});

describe.skipIf(!process.env.TF2_ROOT)('vpk (TF2_ROOT)', () => {
  it('indexes tf2_misc_dir.vpk', () => {
    const idx = parseVpkDir(readGameFile('tf/tf2_misc_dir.vpk'));
    expect(idx.version).toBe(2);
    expect(idx.size).toBeGreaterThan(50_000);
    expect(idx.has('models/props_farm/wooden_barrel.mdl')).toBe(true);
    expect(idx.list('models/props_farm', 'phy').length).toBeGreaterThan(10);
    expect(idx.list('scripts', 'txt').length).toBeGreaterThan(10);
  });

  it('reads files from the split archives', () => {
    const sp = vpkSearchPath('tf/tf2_misc_dir.vpk')!;
    expect(sp.kind).toBe('vpk');
    const fs = gameFileSystem();
    const mdl = fs.read('models/props_farm/wooden_barrel.mdl')!;
    expect(String.fromCharCode(...mdl.subarray(0, 4))).toBe('IDST');
    const name = sp.kind === 'vpk' ? sp.index.list('scripts', 'txt')[0] : '';
    const text = fs.readText(name);
    expect(text && text.length).toBeGreaterThan(10);
  });
});
