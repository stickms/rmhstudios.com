import { describe, expect, it } from 'vitest';
import { decodeValveLzma, isValveLzma, lzmaDecodeRaw } from './lzma';

/** The data the vectors were made from (Python's lzma, FORMAT_ALONE): text, LCG bytes, text. */
function sourceData(): Uint8Array {
  const out: number[] = [];
  const text = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  };
  for (let i = 0; i < 40; i++) text(`The quick brown fox ${i} jumps over the lazy dog. `);
  let x = 12345;
  for (let i = 0; i < 1500; i++) {
    x = Number((BigInt(x) * 1103515245n + 12345n) & 0x7fffffffn);
    out.push((x >> 16) & 0xff);
  }
  for (let i = 0; i < 50; i++) text('tail ');
  return new Uint8Array(out);
}

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// lc=3 lp=0 pb=2, dict 64 KiB, end marker present.
const VECTOR_A =
  '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' +
  'mEqqqTLrPO1NVQidmwSRqwRsQgnlIT///7e9LgA=';
// lc=0 lp=2 pb=0 (exercises literal position bits).
const VECTOR_B =
  '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';

describe('lzma', () => {
  const expected = sourceData();

  it('decodes .lzma (alone) streams with different lc/lp/pb', () => {
    for (const v of [VECTOR_A, VECTOR_B]) {
      const c = fromBase64(v);
      // .lzma header: props(1) dictSize(4) size(8), then the raw stream.
      const out = lzmaDecodeRaw(c, 13, c.subarray(0, 5), expected.length);
      expect(out).toEqual(expected);
    }
  });

  it("decodes Valve's LZMA container", () => {
    const c = fromBase64(VECTOR_A);
    const valve = new Uint8Array(17 + c.length - 13);
    const view = new DataView(valve.buffer);
    valve.set([0x4c, 0x5a, 0x4d, 0x41]); // 'LZMA'
    view.setUint32(4, expected.length, true);
    view.setUint32(8, c.length - 13, true);
    valve.set(c.subarray(0, 5), 12);
    valve.set(c.subarray(13), 17);
    expect(isValveLzma(valve)).toBe(true);
    expect(decodeValveLzma(valve)).toEqual(expected);
  });

  it('rejects bad streams', () => {
    expect(() =>
      lzmaDecodeRaw(new Uint8Array([1, 0, 0, 0, 0]), 0, new Uint8Array([93, 0, 0, 1, 0]), 10),
    ).toThrow();
    expect(() =>
      lzmaDecodeRaw(new Uint8Array(8), 0, new Uint8Array([255, 0, 0, 1, 0]), 10),
    ).toThrow();
  });
});
