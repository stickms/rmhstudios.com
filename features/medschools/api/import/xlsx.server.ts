/**
 * A spreadsheet (`.xlsx`) read into rows of text: no spreadsheet library and no regular expression over the sheet XML.
 * Only what an application-cycle sheet needs is read: cell text (shared strings, inline strings, numbers) and dates. A
 * date in a sheet is a number plus a number format, so `xl/styles.xml` is read to know which cells are dates and those
 * are written as `YYYY-MM-DD`, the form the model is asked to quote back.
 *
 * Bounded on every side. The archive is read by `lib/zip/bounded-zip.server.ts`, which inflates with a real byte limit
 * (the sizes a zip header declares are the sender's), one cap per part and one for the whole file. The XML is walked by
 * `elements()`, an `indexOf` scanner that always moves forward, so a part of 12 MB of unclosed `<row>` tags costs one
 * pass, not one pass per tag (the lazy regexes it replaces were quadratic). The work is capped on top: rows scanned,
 * cells, shared strings and the characters kept from them, and a sheet stops early at the cap. Nothing is stored.
 */
import { openZip, type BoundedZip } from '@/lib/zip/bounded-zip.server';

/** The most any one inflated part may be (a sheet of a few hundred rows is a few hundred KB). */
export const PART_MAX_BYTES = 12 * 1024 * 1024;
/** Inflated bytes across every part of one workbook. */
export const TOTAL_MAX_BYTES = 24 * 1024 * 1024;
const MAX_SHEETS = 12;
/** Rows looked at in one sheet, empty ones included; the rest of the part is not read. */
export const MAX_ROWS_SCANNED = 20_000;
/** Cells looked at across the whole workbook. */
export const MAX_CELLS = 250_000;
/** Shared strings read, and the characters kept from them in all. */
export const MAX_SHARED_STRINGS = 100_000;
export const MAX_SHARED_CHARS = 4_000_000;
const MAX_COLUMNS = 60;

export interface SheetRows {
  name: string;
  rows: string[][];
  /** Rows the sheet had beyond what was read. */
  skippedRows: number;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

interface El {
  /** The text between the tag name and `>` (without a trailing `/`). */
  attrs: string;
  /** The text between the open and close tags; null for a self-closing tag or when bodies were not asked for. */
  body: string | null;
}

const isTagBoundary = (c: number): boolean => c === 32 || c === 9 || c === 10 || c === 13 || c === 62 || c === 47;

/**
 * The `<tag ...>` elements of `xml` in order, found with `indexOf` only: every step moves the cursor forward, so the
 * whole walk is linear in the input however the tags are (not) closed. An element with no `</tag>` ends where the next
 * `<tag` starts (these elements never nest in the parts we read), and once one close search has failed no later one is
 * tried. `limit` ends the walk early.
 */
export function* elements(xml: string, tag: string, wantBody: boolean, limit = Infinity): Generator<El> {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let i = 0;
  let n = 0;
  let closeGone = false;
  while (n < limit) {
    const at = xml.indexOf(open, i);
    if (at < 0) return;
    const nameEnd = at + open.length;
    if (!isTagBoundary(xml.charCodeAt(nameEnd))) {
      i = nameEnd;
      continue;
    }
    const gt = xml.indexOf('>', nameEnd);
    if (gt < 0) return;
    const selfClosing = xml.charCodeAt(gt - 1) === 47 && gt - 1 >= nameEnd;
    const attrs = xml.slice(nameEnd, selfClosing ? gt - 1 : gt);
    let body: string | null = null;
    let next = gt + 1;
    if (!selfClosing && wantBody) {
      let end = -1;
      if (!closeGone) {
        end = xml.indexOf(close, gt + 1);
        if (end < 0) closeGone = true;
      }
      if (end >= 0) {
        body = xml.slice(gt + 1, end);
        next = end + close.length;
      } else {
        const nx = xml.indexOf(open, gt + 1);
        const stop = nx < 0 ? xml.length : nx;
        body = xml.slice(gt + 1, stop);
        next = stop;
      }
    }
    n += 1;
    yield { attrs, body };
    i = next;
  }
}

/** All `<t>` text inside a string item or an inline string (rich text has several runs; phonetic runs `<rPh>` are skipped). */
function textOf(xml: string): string {
  let bare = '';
  let i = 0;
  for (;;) {
    const s = xml.indexOf('<rPh', i);
    if (s < 0) {
      bare += xml.slice(i);
      break;
    }
    bare += xml.slice(i, s);
    const e = xml.indexOf('</rPh>', s);
    if (e < 0) break;
    i = e + 6;
  }
  let out = '';
  for (const t of elements(bare, 't', true)) out += t.body ?? '';
  return decodeXml(out);
}

/** The inflated text of one part, or null when the archive has none by that name. */
function part(zip: BoundedZip, path: string): string | null {
  const buf = zip.read(path, PART_MAX_BYTES);
  return buf === null ? null : buf.toString('utf8');
}

const attrPatterns = new Map<string, RegExp>();
const attr = (tag: string, name: string): string | null => {
  let re = attrPatterns.get(name);
  if (!re) {
    re = new RegExp(`\\b${name}="([^"]*)"`);
    attrPatterns.set(name, re);
  }
  const m = re.exec(tag);
  return m ? decodeXml(m[1] ?? '') : null;
};

/** Number formats Excel builds in that show a date or a time. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** A custom format code shows a date when it has a day, month or year letter outside quotes, brackets and escapes. */
function isDateFormatCode(code: string): boolean {
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyh]/i.test(bare) && !/^general$/i.test(bare.trim());
}

function dateStyles(styles: string | null): Set<number> {
  const out = new Set<number>();
  if (!styles) return out;
  const custom = new Map<number, string>();
  for (const el of elements(styles, 'numFmt', false, 5_000)) {
    const id = Number(attr(el.attrs, 'numFmtId'));
    const code = attr(el.attrs, 'formatCode');
    if (Number.isInteger(id) && code !== null) custom.set(id, code);
  }
  const cellXfs = elements(styles, 'cellXfs', true, 1).next().value?.body ?? '';
  let index = 0;
  for (const el of elements(cellXfs, 'xf', false, 20_000)) {
    const id = Number(attr(el.attrs, 'numFmtId') ?? 0);
    const code = custom.get(id);
    if (BUILTIN_DATE_FORMATS.has(id) || (code !== undefined && isDateFormatCode(code))) out.add(index);
    index += 1;
  }
  return out;
}

/** An Excel serial day as `YYYY-MM-DD` (the 1900 system, which counts a leap day that never was; or the 1904 one). */
export function serialToIso(serial: number, system1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const epoch = system1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(epoch + Math.floor(serial) * 86_400_000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** `A` -> 0, `B` -> 1, `AA` -> 26. */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

/** The sheets of the workbook in order: names, then each sheet's rows (at most `maxRows` read across all of them). */
export async function readXlsx(buffer: Buffer, maxRows: number): Promise<SheetRows[]> {
  const zip = openZip(buffer, { maxTotalBytes: TOTAL_MAX_BYTES });
  const workbook = part(zip, 'xl/workbook.xml');
  if (workbook === null) throw new Error('XLSX workbook is missing');
  const rels = part(zip, 'xl/_rels/workbook.xml.rels') ?? '';
  const shared = part(zip, 'xl/sharedStrings.xml');
  const dateXf = dateStyles(part(zip, 'xl/styles.xml'));
  const system1904 = /<workbookPr\b[^>]{0,2000}\bdate1904="(?:1|true)"/i.test(workbook.slice(0, 200_000));

  const strings: string[] = [];
  if (shared) {
    let kept = 0;
    for (const si of elements(shared, 'si', true, MAX_SHARED_STRINGS)) {
      const text = kept > MAX_SHARED_CHARS ? '' : textOf(si.body ?? '');
      kept += text.length;
      strings.push(text);
    }
  }

  const targets = new Map<string, string>();
  for (const el of elements(rels, 'Relationship', false, 1_000)) {
    const id = attr(el.attrs, 'Id');
    const target = attr(el.attrs, 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }

  const sheets: { name: string; path: string }[] = [];
  for (const el of elements(workbook, 'sheet', false, 1_000)) {
    const name = attr(el.attrs, 'name');
    const rid = attr(el.attrs, 'r:id');
    const path = rid ? targets.get(rid) : undefined;
    if (name !== null && path && sheets.length < MAX_SHEETS) sheets.push({ name, path });
  }
  if (sheets.length === 0) throw new Error('XLSX has no sheets');

  const out: SheetRows[] = [];
  let budget = maxRows;
  let cellsSeen = 0;
  for (const sheet of sheets) {
    const xml = part(zip, sheet.path);
    const rows: string[][] = [];
    let skipped = 0;
    if (xml && cellsSeen < MAX_CELLS) {
      for (const rowEl of elements(xml, 'row', true, MAX_ROWS_SCANNED)) {
        const body = rowEl.body;
        if (!body) continue;
        const cells: string[] = [];
        for (const c of elements(body, 'c', true, MAX_CELLS - cellsSeen)) {
          cellsSeen += 1;
          const head = c.attrs;
          const inner = c.body ?? '';
          const col = columnIndex(attr(head, 'r') ?? '');
          if (col >= MAX_COLUMNS) continue;
          const type = attr(head, 't');
          const v = elements(inner, 'v', true, 1).next().value?.body ?? undefined;
          let text = '';
          if (type === 'inlineStr') text = textOf(inner);
          else if (type === 's') text = strings[Number(v)] ?? '';
          else if (type === 'str' || type === 'e') text = decodeXml(v ?? '');
          else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
          else if (v !== undefined) {
            const style = Number(attr(head, 's') ?? 0);
            const n = Number(v);
            text = dateXf.has(style) ? (serialToIso(n, system1904) ?? decodeXml(v)) : decodeXml(v);
          }
          while (cells.length < col) cells.push('');
          cells[col] = text.trim();
        }
        if (!cells.some((x) => x !== '')) continue;
        if (budget <= 0) {
          skipped += 1;
          continue;
        }
        budget -= 1;
        rows.push(cells);
      }
    }
    out.push({ name: sheet.name, rows, skippedRows: skipped });
  }
  return out;
}
