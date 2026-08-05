/**
 * gen-font-metrics.ts — compute the `@font-face` metric-override descriptors for
 * a metric-matched LOCAL fallback face (OPT-17).
 *
 *   pnpm exec tsx scripts/gen-font-metrics.ts
 *
 * ## Why this exists
 *
 * `app/globals.css` loads Inter with `font-display: swap`. `swap` guarantees the
 * words are on screen immediately — and guarantees a REFLOW when the real face
 * arrives, because the system font the browser painted first has different
 * metrics (different average advance width, different ascent/descent). That
 * reflow is the layout shift.
 *
 * The fix is an `@font-face` for the FALLBACK — a face whose `src` is a
 * `local()` system font, carrying `size-adjust` / `ascent-override` /
 * `descent-override` / `line-gap-override` descriptors that bend that system
 * font onto Inter's metrics. The swap then changes the letterforms and nothing
 * else: same line box, same line breaks, zero CLS.
 *
 * The four numbers are NOT hand-tuned and must never be hand-edited. Run this
 * script and paste its output. It reads the metrics out of the actual shipped
 * font binaries, so the values track whatever Fontsource ships rather than a
 * number somebody once copied off a blog post.
 *
 * ## No new dependency
 *
 * `fontkit` / `@capsizecss/metrics` are NOT installed in this workspace and the
 * quality bar says don't add a dependency for a build-time one-liner, so this
 * file carries a small read-only font parser: a WOFF2 container reader (header +
 * table directory + one Brotli inflate via `node:zlib`) and just enough sfnt to
 * read `head`, `hhea`, `hmtx` and `cmap`. It never writes a font, never touches
 * `glyf`/`loca` (the only tables WOFF2 actually transforms in a way that would
 * need reconstructing), and works on `.woff2`, `.ttf` and `.otf` alike.
 *
 * ## The formulas (these are the industry-standard ones)
 *
 * Same derivation `next/font` and `fontaine` use, via `@capsizecss/core`:
 *
 *   sizeAdjust      = (real.xWidthAvg / real.upem) / (fallback.xWidthAvg / fallback.upem)
 *   ascentOverride  =  real.ascent  / (real.upem * sizeAdjust)
 *   descentOverride = |real.descent| / (real.upem * sizeAdjust)
 *   lineGapOverride =  real.lineGap / (real.upem * sizeAdjust)
 *
 * `size-adjust` scales the fallback so its average text run is exactly as wide
 * as Inter's, which is what keeps LINE BREAKS identical across the swap. The
 * three vertical overrides then restate INTER's own line box on the scaled
 * fallback (hence the division by `sizeAdjust` — the descriptors are resolved
 * after the size adjustment, so they have to be pre-divided by it).
 *
 * `xWidthAvg` is a frequency-weighted mean advance width over lowercase English
 * plus the space, NOT the `OS/2.xAvgCharWidth` field: that field is a stored
 * number each foundry computes to a different spec revision, so comparing it
 * across two fonts compares two different definitions. Computing the mean here,
 * from `cmap` + `hmtx`, puts both fonts through identical code — which is the
 * only property the ratio actually needs.
 *
 * ## Which fallback font, and why Liberation Sans is on the list
 *
 * The `local()` list has to resolve on every platform: Arial on Windows and
 * macOS, Helvetica on older macOS, Liberation Sans on Linux, Roboto on Android.
 * Those four are metric-compatible by construction — Liberation Sans was
 * commissioned as a drop-in metric clone of Arial, and Roboto's advances land
 * within a fraction of a percent — so ONE set of overrides serves all of them.
 *
 * That is also what makes this reproducible on a Linux CI box that has no Arial:
 * the widths are read from Liberation Sans, which by design carries Arial's
 * advance widths. Pass `--fallback <path>` to recompute against a real Arial.
 */

import { readFileSync, existsSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { resolve } from 'node:path';

// ── The two inputs ──────────────────────────────────────────────────────────

/** The face the site actually downloads (see globals.css's `@import`). */
const REAL_FONT = 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2';

/**
 * The fallback's METRIC SOURCE. Liberation Sans is a metric-compatible clone of
 * Arial (identical advance widths, identical 2048 upem), so it stands in for
 * Arial on a box that has no Arial. Any of these paths is fine; the first that
 * exists wins.
 */
const FALLBACK_CANDIDATES = [
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf',
  '/Library/Fonts/Arial.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  'C:/Windows/Fonts/arial.ttf',
];

/** The CSS family name the generated face is published under. */
const FALLBACK_FAMILY = 'Inter Fallback';

/** `src: local(...)` list, in resolution order. All metric-compatible. */
const LOCAL_SOURCES = ['Arial', 'Helvetica Neue', 'Helvetica', 'Liberation Sans', 'Roboto'];

/**
 * Relative frequency of each character in English prose, including the space —
 * the weighting `@capsizecss/unpack` uses for `xWidthAvg`. The absolute values
 * do not matter (they are normalised below); what matters is that BOTH fonts are
 * measured with the same weights, so the ratio is a like-for-like comparison.
 */
const WEIGHTS: Record<string, number> = {
  a: 0.0668,
  b: 0.0122,
  c: 0.0228,
  d: 0.0348,
  e: 0.1039,
  f: 0.0182,
  g: 0.0165,
  h: 0.0499,
  i: 0.057,
  j: 0.0009,
  k: 0.0063,
  l: 0.033,
  m: 0.0197,
  n: 0.0552,
  o: 0.0614,
  p: 0.0158,
  q: 0.0008,
  r: 0.0489,
  s: 0.0518,
  t: 0.074,
  u: 0.0226,
  v: 0.008,
  w: 0.0193,
  x: 0.0012,
  y: 0.0162,
  z: 0.0006,
  ' ': 0.1818,
};

// ── A very small read-only font parser ──────────────────────────────────────

/** WOFF2's 63 "known" table tags, indexed by the low 6 bits of the flags byte. */
const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

interface RawFont {
  tables: Map<string, Buffer>;
  /**
   * WOFF2 may store `hmtx` in its transformed form, which prefixes the
   * `advanceWidth` array with one flags byte. Everything else we read is never
   * transformed.
   */
  hmtxAdvanceOffset: number;
}

/** WOFF2's variable-length integer: 7 bits per byte, high bit = continue. */
function readUIntBase128(buf: Buffer, pos: number): [value: number, next: number] {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf.readUInt8(pos + i);
    if (i === 0 && byte === 0x80) throw new Error('WOFF2: leading zeros in UIntBase128');
    if (value > 0x01ffffff) throw new Error('WOFF2: UIntBase128 overflow');
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value >>> 0, pos + i + 1];
  }
  throw new Error('WOFF2: UIntBase128 too long');
}

function readWoff2(buf: Buffer): RawFont {
  const flavor = buf.readUInt32BE(4);
  if (flavor === 0x74746366) throw new Error('WOFF2 font collections are not supported');
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);

  let pos = 48;
  const entries: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf.readUInt8(pos);
    pos += 1;
    const tagIndex = flags & 0x3f;
    let tag: string;
    if (tagIndex === 0x3f) {
      tag = buf.toString('latin1', pos, pos + 4);
      pos += 4;
    } else {
      tag = KNOWN_TAGS[tagIndex]!;
    }
    const transformVersion = (flags >> 6) & 0x03;
    // glyf/loca invert the convention: for them version 0 IS the transform and
    // version 3 is the null transform. Every other table transforms at != 0.
    const transformed =
      tag === 'glyf' || tag === 'loca' ? transformVersion === 0 : transformVersion !== 0;

    let length: number;
    [length, pos] = readUIntBase128(buf, pos);
    if (transformed) [length, pos] = readUIntBase128(buf, pos);
    entries.push({ tag, length });
  }

  const stream = brotliDecompressSync(buf.subarray(pos, pos + totalCompressedSize));

  const tables = new Map<string, Buffer>();
  let offset = 0;
  let hmtxAdvanceOffset = 0;
  for (const entry of entries) {
    tables.set(entry.tag, stream.subarray(offset, offset + entry.length));
    offset += entry.length;
  }
  // Re-walk the directory for the one transform we care about.
  pos = 48;
  for (let i = 0; i < numTables; i++) {
    const flags = buf.readUInt8(pos);
    pos += 1;
    const tagIndex = flags & 0x3f;
    const tag = tagIndex === 0x3f ? buf.toString('latin1', pos, pos + 4) : KNOWN_TAGS[tagIndex]!;
    if (tagIndex === 0x3f) pos += 4;
    const transformVersion = (flags >> 6) & 0x03;
    const transformed =
      tag === 'glyf' || tag === 'loca' ? transformVersion === 0 : transformVersion !== 0;
    let skip: number;
    [skip, pos] = readUIntBase128(buf, pos);
    void skip;
    if (transformed) [skip, pos] = readUIntBase128(buf, pos);
    if (tag === 'hmtx' && transformed) hmtxAdvanceOffset = 1;
  }

  return { tables, hmtxAdvanceOffset };
}

function readSfnt(buf: Buffer): RawFont {
  const numTables = buf.readUInt16BE(4);
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = buf.toString('latin1', rec, rec + 4);
    const off = buf.readUInt32BE(rec + 8);
    const len = buf.readUInt32BE(rec + 12);
    tables.set(tag, buf.subarray(off, off + len));
  }
  return { tables, hmtxAdvanceOffset: 0 };
}

function openFont(path: string): RawFont {
  const buf = readFileSync(path);
  const signature = buf.toString('latin1', 0, 4);
  if (signature === 'wOF2') return readWoff2(buf);
  if (signature === 'wOFF') throw new Error(`${path}: WOFF1 is not supported (ship woff2/ttf)`);
  if (signature === 'ttcf') throw new Error(`${path}: font collections are not supported`);
  return readSfnt(buf);
}

// ── cmap / hmtx ─────────────────────────────────────────────────────────────

/** Character → glyph id, via the best available Unicode `cmap` subtable. */
function buildCharMap(cmap: Buffer): (code: number) => number {
  const numSubtables = cmap.readUInt16BE(2);
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < numSubtables; i++) {
    const rec = 4 + i * 8;
    const platform = cmap.readUInt16BE(rec);
    const encoding = cmap.readUInt16BE(rec + 2);
    const offset = cmap.readUInt32BE(rec + 4);
    // Prefer full-repertoire Unicode, then BMP Unicode, then anything Unicode.
    const score =
      (platform === 3 && encoding === 10) || (platform === 0 && encoding >= 4)
        ? 3
        : (platform === 3 && encoding === 1) || platform === 0
          ? 2
          : 0;
    if (score > bestScore) {
      bestScore = score;
      best = offset;
    }
  }
  if (best < 0) throw new Error('cmap: no Unicode subtable');

  const sub = cmap.subarray(best);
  const format = sub.readUInt16BE(0);

  if (format === 4) {
    const segCount = sub.readUInt16BE(6) / 2;
    const endBase = 14;
    const startBase = endBase + segCount * 2 + 2;
    const deltaBase = startBase + segCount * 2;
    const rangeBase = deltaBase + segCount * 2;
    return (code: number) => {
      for (let s = 0; s < segCount; s++) {
        const end = sub.readUInt16BE(endBase + s * 2);
        if (code > end) continue;
        const start = sub.readUInt16BE(startBase + s * 2);
        if (code < start) return 0;
        const delta = sub.readInt16BE(deltaBase + s * 2);
        const rangeOffset = sub.readUInt16BE(rangeBase + s * 2);
        if (rangeOffset === 0) return (code + delta) & 0xffff;
        const at = rangeBase + s * 2 + rangeOffset + (code - start) * 2;
        const gid = sub.readUInt16BE(at);
        return gid === 0 ? 0 : (gid + delta) & 0xffff;
      }
      return 0;
    };
  }

  if (format === 12) {
    const nGroups = sub.readUInt32BE(12);
    return (code: number) => {
      for (let g = 0; g < nGroups; g++) {
        const rec = 16 + g * 12;
        const start = sub.readUInt32BE(rec);
        const end = sub.readUInt32BE(rec + 4);
        if (code < start) return 0;
        if (code <= end) return sub.readUInt32BE(rec + 8) + (code - start);
      }
      return 0;
    };
  }

  throw new Error(`cmap: unsupported subtable format ${format}`);
}

interface FontMetrics {
  path: string;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
  xWidthAvg: number;
}

function readMetrics(path: string): FontMetrics {
  const font = openFont(path);
  const table = (tag: string): Buffer => {
    const t = font.tables.get(tag);
    if (!t) throw new Error(`${path}: missing '${tag}' table`);
    return t;
  };

  const head = table('head');
  const hhea = table('hhea');
  const hmtx = table('hmtx');
  const charMap = buildCharMap(table('cmap'));

  const unitsPerEm = head.readUInt16BE(18);
  // hhea, not OS/2 sTypo*: this is the pair the browser's own line box uses for
  // a webfont on the platforms that matter, and the pair capsize/next-font feed
  // into `ascent-override` — mixing the two sets is how these end up subtly off.
  const ascent = hhea.readInt16BE(4);
  const descent = hhea.readInt16BE(6);
  const lineGap = hhea.readInt16BE(8);
  const numberOfHMetrics = hhea.readUInt16BE(34);

  const advance = (gid: number): number => {
    const index = Math.min(gid, numberOfHMetrics - 1);
    return hmtx.readUInt16BE(font.hmtxAdvanceOffset + index * 4);
  };

  let weighted = 0;
  let totalWeight = 0;
  for (const [char, weight] of Object.entries(WEIGHTS)) {
    const gid = charMap(char.codePointAt(0)!);
    if (gid === 0) throw new Error(`${path}: no glyph for ${JSON.stringify(char)}`);
    weighted += advance(gid) * weight;
    totalWeight += weight;
  }

  return {
    path,
    unitsPerEm,
    ascent,
    descent,
    lineGap,
    xWidthAvg: weighted / totalWeight,
  };
}

// ── Output ──────────────────────────────────────────────────────────────────

const pct = (n: number): string => `${(n * 100).toFixed(2)}%`;

function main(): void {
  const argv = process.argv.slice(2);
  const flagIndex = argv.indexOf('--fallback');
  const override = flagIndex >= 0 ? argv[flagIndex + 1] : undefined;

  const realPath = resolve(process.cwd(), REAL_FONT);
  if (!existsSync(realPath)) {
    throw new Error(`${REAL_FONT} not found — run \`pnpm install\` first.`);
  }
  const fallbackPath = override ?? FALLBACK_CANDIDATES.find((p) => existsSync(p));
  if (!fallbackPath) {
    throw new Error(
      'No fallback font found. Install `fonts-liberation` (Debian/Ubuntu) or pass ' +
        '`--fallback /path/to/Arial.ttf`.',
    );
  }

  const real = readMetrics(realPath);
  const fallback = readMetrics(fallbackPath);

  const sizeAdjust = real.xWidthAvg / real.unitsPerEm / (fallback.xWidthAvg / fallback.unitsPerEm);
  const ascentOverride = real.ascent / (real.unitsPerEm * sizeAdjust);
  const descentOverride = Math.abs(real.descent) / (real.unitsPerEm * sizeAdjust);
  const lineGapOverride = real.lineGap / (real.unitsPerEm * sizeAdjust);

  const show = (label: string, m: FontMetrics): string =>
    `   ${label.padEnd(10)} upem=${m.unitsPerEm}  ascent=${m.ascent}  descent=${m.descent}  ` +
    `lineGap=${m.lineGap}  xWidthAvg=${m.xWidthAvg.toFixed(2)}\n     ${m.path}`;

  process.stdout.write(
    [
      '',
      '   Measured (hhea vertical metrics; xWidthAvg = frequency-weighted mean advance)',
      show('real:', real),
      show('fallback:', fallback),
      '',
      '   Paste into app/globals.css (generated by scripts/gen-font-metrics.ts):',
      '',
      '@font-face {',
      `  font-family: '${FALLBACK_FAMILY}';`,
      `  src: ${LOCAL_SOURCES.map((f) => `local('${f}')`).join(', ')};`,
      `  size-adjust: ${pct(sizeAdjust)};`,
      `  ascent-override: ${pct(ascentOverride)};`,
      `  descent-override: ${pct(descentOverride)};`,
      `  line-gap-override: ${pct(lineGapOverride)};`,
      '}',
      '',
    ].join('\n'),
  );
}

main();
