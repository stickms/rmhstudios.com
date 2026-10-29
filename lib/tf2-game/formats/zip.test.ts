import { describe, expect, it } from 'vitest';
import { parseBsp, openPakfile } from './bsp';
import { parseZip, ZIP_METHOD_LZMA, ZIP_METHOD_STORED } from './zip';
import { readMap } from './tf2-root.test-support';

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const text = (b: Uint8Array) => new TextDecoder().decode(b);

/** Props (5 bytes: lc3 lp0 pb2, dict 64 KiB) + raw LZMA stream of LZMA_TEXT (Python FORMAT_RAW). */
const LZMA_PROPS_AND_STREAM =
  'XQAAAQAAERMJJnNuq+sTcqcI35CSvY1+3ohwBlAKodh8eoF2Z1Y0DMzSgg7pX9lEzAfICezLifDHd9AlrdOIzwKX///rf4AA';
const LZMA_TEXT = '"LightmappedGeneric" { "$basetexture" "maps/test/foo" } '.repeat(8);

interface Entry {
  name: string;
  method: number;
  data: Uint8Array;
  size: number;
}

/** Writes a minimal zip (local headers, central directory, EOCD with a comment). */
function buildZip(entries: Entry[]): Uint8Array {
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v: number) =>
    out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const name = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  };
  const offsets: number[] = [];
  for (const e of entries) {
    offsets.push(out.length);
    u32(0x04034b50);
    u16(20);
    u16(0);
    u16(e.method);
    u16(0);
    u16(0);
    u32(0);
    u32(e.data.length);
    u32(e.size);
    u16(e.name.length);
    u16(0);
    name(e.name);
    out.push(...e.data);
  }
  const cd = out.length;
  entries.forEach((e, i) => {
    u32(0x02014b50);
    u16(20);
    u16(20);
    u16(0);
    u16(e.method);
    u16(0);
    u16(0);
    u32(0);
    u32(e.data.length);
    u32(e.size);
    u16(e.name.length);
    u16(0);
    u16(0);
    u16(0);
    u16(0);
    u32(0);
    u32(offsets[i]);
    name(e.name);
  });
  const cdSize = out.length - cd;
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(entries.length);
  u16(entries.length);
  u32(cdSize);
  u32(cd);
  const comment = 'XZP1 0';
  u16(comment.length);
  name(comment);
  return new Uint8Array(out);
}

describe('zip', () => {
  it('lists and reads stored and LZMA (method 14) entries', () => {
    const stored = new TextEncoder().encode('hello pakfile');
    const raw = fromBase64(LZMA_PROPS_AND_STREAM);
    // zip LZMA payload: version (2 bytes), props size (u16), props, stream.
    const lzmaPayload = new Uint8Array(4 + raw.length);
    lzmaPayload.set([9, 20, 5, 0]);
    lzmaPayload.set(raw, 4);
    const zip = parseZip(
      buildZip([
        {
          name: 'Materials/Maps/Test/Foo.VMT',
          method: ZIP_METHOD_LZMA,
          data: lzmaPayload,
          size: LZMA_TEXT.length,
        },
        { name: 'readme.txt', method: ZIP_METHOD_STORED, data: stored, size: stored.length },
        { name: 'materials/', method: ZIP_METHOD_STORED, data: new Uint8Array(0), size: 0 },
      ]),
    );
    expect(zip.list().sort()).toEqual(['materials/maps/test/foo.vmt', 'readme.txt']);
    expect(zip.list('materials', 'vmt')).toEqual(['materials/maps/test/foo.vmt']);
    expect(text(zip.read('readme.txt')!)).toBe('hello pakfile');
    expect(text(zip.read('MATERIALS\\maps\\test\\foo.vmt')!)).toBe(LZMA_TEXT);
    expect(zip.read('nope')).toBeNull();
  });

  it('treats an empty lump as an empty archive and rejects garbage', () => {
    expect(parseZip(new Uint8Array(0)).entries.size).toBe(0);
    expect(() => parseZip(new Uint8Array(100))).toThrow();
  });
});

describe.skipIf(!process.env.TF2_ROOT)('zip pakfile (TF2_ROOT)', () => {
  it.each(['ctf_2fort', 'koth_viaduct'])('lists and reads the %s pakfile', (map) => {
    const pak = openPakfile(parseBsp(readMap(map)));
    expect(pak.entries.size).toBeGreaterThan(20);
    const vmts = pak.list('materials', 'vmt');
    expect(vmts.length).toBeGreaterThan(5);
    for (const p of vmts.slice(0, 20)) {
      const t = text(pak.read(p)!);
      expect(t).toMatch(/[{]/);
    }
  });
});
