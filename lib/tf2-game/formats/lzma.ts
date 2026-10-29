/**
 * LZMA ("LZMA1", the .lzma / 7-Zip algorithm) decoder, written from the public
 * LZMA specification. Valve compresses BSP lumps with it (the 17-byte "LZMA"
 * header of lzma_header_t, tier1/lzmaDecoder.h) and the pakfile lump's zip
 * entries may use it as zip method 14.
 *
 * The output buffer doubles as the dictionary, which is enough because every
 * caller knows the decompressed size up front.
 */

const NUM_STATES = 12;
const PROB_INIT = 1024;
const NUM_POS_BITS_MAX = 4;
const END_POS_MODEL_INDEX = 14;
const NUM_FULL_DISTANCES = 1 << (END_POS_MODEL_INDEX >> 1);
const NUM_ALIGN_BITS = 4;
const MATCH_MIN_LEN = 2;

class RangeDecoder {
  range = 0xffffffff;
  code = 0;
  pos: number;
  readonly src: Uint8Array;

  constructor(src: Uint8Array, start: number) {
    this.src = src;
    this.pos = start;
    if (src[this.pos++] !== 0) throw new Error('lzma: bad range coder header');
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.next()) >>> 0;
    if (this.code === this.range) throw new Error('lzma: corrupt stream');
  }

  next(): number {
    // Reading past the end feeds zeros; a well-formed stream never needs them.
    return this.pos < this.src.length ? this.src[this.pos++] : (this.pos++, 0);
  }

  bit(probs: Uint16Array, i: number): number {
    const p = probs[i];
    const bound = (this.range >>> 11) * p;
    let b: number;
    if (this.code < bound) {
      probs[i] = p + ((2048 - p) >>> 5);
      this.range = bound;
      b = 0;
    } else {
      probs[i] = p - (p >>> 5);
      this.code -= bound;
      this.range -= bound;
      b = 1;
    }
    if (this.range < 0x1000000) {
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | this.next()) >>> 0;
    }
    return b;
  }

  /**
   * Decodes a plain literal (8 bits through the bit tree at `base`), with the
   * range coder state held in locals — literals are most of the bits.
   */
  literal(probs: Uint16Array, base: number): number {
    let range = this.range;
    let code = this.code;
    let pos = this.pos;
    const src = this.src;
    const srcLen = src.length;
    let sym = 1;
    while (sym < 0x100) {
      const i = base + sym;
      const p = probs[i];
      const bound = (range >>> 11) * p;
      if (code < bound) {
        probs[i] = p + ((2048 - p) >>> 5);
        range = bound;
        sym <<= 1;
      } else {
        probs[i] = p - (p >>> 5);
        code -= bound;
        range -= bound;
        sym = (sym << 1) | 1;
      }
      if (range < 0x1000000) {
        range = (range << 8) >>> 0;
        code = ((code << 8) | (pos < srcLen ? src[pos] : 0)) >>> 0;
        pos++;
      }
    }
    this.range = range;
    this.code = code;
    this.pos = pos;
    return sym & 0xff;
  }

  direct(numBits: number): number {
    let res = 0;
    for (let i = 0; i < numBits; i++) {
      this.range >>>= 1;
      let b = 0;
      if (this.code >= this.range) {
        this.code -= this.range;
        b = 1;
      }
      res = ((res << 1) | b) >>> 0;
      if (this.range < 0x1000000) {
        this.range = (this.range << 8) >>> 0;
        this.code = ((this.code << 8) | this.next()) >>> 0;
      }
    }
    return res;
  }

  bitTree(probs: Uint16Array, base: number, numBits: number): number {
    let m = 1;
    for (let i = 0; i < numBits; i++) m = (m << 1) + this.bit(probs, base + m);
    return m - (1 << numBits);
  }

  bitTreeReverse(probs: Uint16Array, base: number, numBits: number): number {
    let m = 1;
    let sym = 0;
    for (let i = 0; i < numBits; i++) {
      const b = this.bit(probs, base + m);
      m = (m << 1) + b;
      sym |= b << i;
    }
    return sym;
  }
}

// Length decoder layout in one array: choice, choice2, low[16][8], mid[16][8], high[256].
const LEN_LOW = 2;
const LEN_MID = LEN_LOW + (16 << 3);
const LEN_HIGH = LEN_MID + (16 << 3);
const LEN_PROBS = LEN_HIGH + 256;

function decodeLen(rc: RangeDecoder, probs: Uint16Array, posState: number): number {
  if (rc.bit(probs, 0) === 0) return rc.bitTree(probs, LEN_LOW + (posState << 3), 3);
  if (rc.bit(probs, 1) === 0) return 8 + rc.bitTree(probs, LEN_MID + (posState << 3), 3);
  return 16 + rc.bitTree(probs, LEN_HIGH, 8);
}

/**
 * Decodes a raw LZMA stream (no header) with the given 5 property bytes
 * (lc/lp/pb byte + u32 dictionary size) into exactly `outSize` bytes.
 */
export function lzmaDecodeRaw(
  src: Uint8Array,
  srcOffset: number,
  props: Uint8Array,
  outSize: number,
): Uint8Array {
  let d = props[0];
  if (d >= 9 * 5 * 5) throw new Error('lzma: bad properties');
  const lc = d % 9;
  d = (d / 9) | 0;
  const lp = d % 5;
  const pb = (d / 5) | 0;

  const out = new Uint8Array(outSize);
  if (outSize === 0) return out;
  const rc = new RangeDecoder(src, srcOffset);

  const literalProbs = new Uint16Array(0x300 << (lc + lp)).fill(PROB_INIT);
  const isMatch = new Uint16Array(NUM_STATES << NUM_POS_BITS_MAX).fill(PROB_INIT);
  const isRep = new Uint16Array(NUM_STATES).fill(PROB_INIT);
  const isRepG0 = new Uint16Array(NUM_STATES).fill(PROB_INIT);
  const isRepG1 = new Uint16Array(NUM_STATES).fill(PROB_INIT);
  const isRepG2 = new Uint16Array(NUM_STATES).fill(PROB_INIT);
  const isRep0Long = new Uint16Array(NUM_STATES << NUM_POS_BITS_MAX).fill(PROB_INIT);
  const posSlot = new Uint16Array(4 << 6).fill(PROB_INIT);
  const posDecoders = new Uint16Array(1 + NUM_FULL_DISTANCES - END_POS_MODEL_INDEX).fill(PROB_INIT);
  const alignDecoder = new Uint16Array(1 << NUM_ALIGN_BITS).fill(PROB_INIT);
  const lenProbs = new Uint16Array(LEN_PROBS).fill(PROB_INIT);
  const repLenProbs = new Uint16Array(LEN_PROBS).fill(PROB_INIT);

  const pbMask = (1 << pb) - 1;
  const lpMask = (1 << lp) - 1;
  let state = 0;
  let rep0 = 0;
  let rep1 = 0;
  let rep2 = 0;
  let rep3 = 0;
  let pos = 0;

  while (pos < outSize) {
    const posState = pos & pbMask;
    if (rc.bit(isMatch, (state << NUM_POS_BITS_MAX) + posState) === 0) {
      // Literal.
      const prevByte = pos > 0 ? out[pos - 1] : 0;
      const base = 0x300 * (((pos & lpMask) << lc) + (prevByte >>> (8 - lc)));
      if (state < 7) {
        out[pos++] = rc.literal(literalProbs, base);
      } else {
        let sym = 1;
        let matchByte = out[pos - rep0 - 1];
        do {
          const matchBit = (matchByte >>> 7) & 1;
          matchByte <<= 1;
          const b = rc.bit(literalProbs, base + ((1 + matchBit) << 8) + sym);
          sym = (sym << 1) | b;
          if (matchBit !== b) break;
        } while (sym < 0x100);
        while (sym < 0x100) sym = (sym << 1) | rc.bit(literalProbs, base + sym);
        out[pos++] = sym & 0xff;
      }
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }

    let len: number;
    if (rc.bit(isRep, state) !== 0) {
      if (pos === 0) throw new Error('lzma: rep match at stream start');
      if (rc.bit(isRepG0, state) === 0) {
        if (rc.bit(isRep0Long, (state << NUM_POS_BITS_MAX) + posState) === 0) {
          // Short rep: one byte at rep0.
          state = state < 7 ? 9 : 11;
          out[pos] = out[pos - rep0 - 1];
          pos++;
          continue;
        }
      } else {
        let dist: number;
        if (rc.bit(isRepG1, state) === 0) {
          dist = rep1;
        } else {
          if (rc.bit(isRepG2, state) === 0) {
            dist = rep2;
          } else {
            dist = rep3;
            rep3 = rep2;
          }
          rep2 = rep1;
        }
        rep1 = rep0;
        rep0 = dist;
      }
      len = decodeLen(rc, repLenProbs, posState);
      state = state < 7 ? 8 : 11;
    } else {
      rep3 = rep2;
      rep2 = rep1;
      rep1 = rep0;
      len = decodeLen(rc, lenProbs, posState);
      state = state < 7 ? 7 : 10;
      // Distance.
      const lenState = len < 3 ? len : 3;
      const slot = rc.bitTree(posSlot, lenState << 6, 6);
      if (slot < 4) {
        rep0 = slot;
      } else {
        const numDirectBits = (slot >>> 1) - 1;
        let dist = ((2 | (slot & 1)) << numDirectBits) >>> 0;
        if (slot < END_POS_MODEL_INDEX) {
          dist += rc.bitTreeReverse(posDecoders, dist - slot, numDirectBits);
        } else {
          dist += rc.direct(numDirectBits - NUM_ALIGN_BITS) * (1 << NUM_ALIGN_BITS);
          dist += rc.bitTreeReverse(alignDecoder, 0, NUM_ALIGN_BITS);
        }
        rep0 = dist >>> 0;
        if (rep0 === 0xffffffff) break; // end marker
      }
      if (rep0 >= pos) throw new Error('lzma: match distance out of range');
    }

    len += MATCH_MIN_LEN;
    let from = pos - rep0 - 1;
    const end = pos + len < outSize ? pos + len : outSize;
    while (pos < end) out[pos++] = out[from++];
  }
  return out;
}

/** Valve's lzma_header_t id ('LZMA' little-endian). */
export const LZMA_ID = 0x414d5a4c;

/** True if `bytes` starts with Valve's 17-byte LZMA header. */
export function isValveLzma(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 17 &&
    bytes[0] === 0x4c &&
    bytes[1] === 0x5a &&
    bytes[2] === 0x4d &&
    bytes[3] === 0x41
  );
}

/**
 * Decodes Valve's LZMA container: u32 id 'LZMA', u32 actualSize, u32 lzmaSize,
 * u8 properties[5], then the raw stream (SDK: CLZMA::Uncompress).
 */
export function decodeValveLzma(bytes: Uint8Array): Uint8Array {
  if (!isValveLzma(bytes)) throw new Error('lzma: missing LZMA header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const actualSize = view.getUint32(4, true);
  return lzmaDecodeRaw(bytes, 17, bytes.subarray(12, 17), actualSize);
}
