/**
 * A spreadsheet (`.xlsx`) read into rows of text with `jszip` and a few patterns over the sheet XML: no spreadsheet
 * library. Only what an application-cycle sheet needs is read: cell text (shared strings, inline strings, numbers) and
 * dates. A date in a sheet is a number plus a number format, so `xl/styles.xml` is read to know which cells are dates and
 * those are written as `YYYY-MM-DD`, the form the model is asked to quote back.
 *
 * Bounded on every side: the archive's parts are size-checked before they are inflated, a sheet is read up to the row
 * cap, and everything past it is only counted. Nothing is stored.
 */
import type JSZip from 'jszip';

/** The most any one inflated part may be (a sheet of a few hundred rows is a few hundred KB). */
const PART_MAX_BYTES = 12 * 1024 * 1024;
const MAX_SHEETS = 12;

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

/** All `<t>` text inside a string item or an inline string (rich text has several runs; phonetic runs `<rPh>` are skipped). */
function textOf(xml: string): string {
  const bare = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of bare.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1] ?? '';
  return decodeXml(out);
}

async function part(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (typeof size === 'number' && size > PART_MAX_BYTES) throw new Error('XLSX part is too large');
  const xml = await file.async('string');
  if (xml.length > PART_MAX_BYTES) throw new Error('XLSX part is too large');
  return xml;
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
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
  for (const m of styles.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(attr(m[0], 'numFmtId'));
    const code = attr(m[0], 'formatCode');
    if (Number.isInteger(id) && code !== null) custom.set(id, code);
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '';
  let index = 0;
  for (const m of cellXfs.matchAll(/<xf\b[^>]*?(?:\/>|>)/g)) {
    const id = Number(attr(m[0], 'numFmtId') ?? 0);
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

const MAX_COLUMNS = 60;

/** The sheets of the workbook in order: names, then each sheet's rows (at most `maxRows` read across all of them). */
export async function readXlsx(buffer: Buffer, maxRows: number): Promise<SheetRows[]> {
  const { default: JSZipClass } = await import('jszip');
  const zip = await JSZipClass.loadAsync(buffer);
  const workbook = await part(zip, 'xl/workbook.xml');
  if (workbook === null) throw new Error('XLSX workbook is missing');
  const rels = (await part(zip, 'xl/_rels/workbook.xml.rels')) ?? '';
  const shared = await part(zip, 'xl/sharedStrings.xml');
  const dateXf = dateStyles(await part(zip, 'xl/styles.xml'));
  const system1904 = /<workbookPr\b[^>]*\bdate1904="(?:1|true)"/i.test(workbook);

  const strings: string[] = [];
  if (shared) for (const m of shared.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) strings.push(textOf(m[1] ?? ''));

  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }

  const sheets: { name: string; path: string }[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name');
    const rid = attr(m[0], 'r:id');
    const path = rid ? targets.get(rid) : undefined;
    if (name !== null && path && sheets.length < MAX_SHEETS) sheets.push({ name, path });
  }
  if (sheets.length === 0) throw new Error('XLSX has no sheets');

  const out: SheetRows[] = [];
  let budget = maxRows;
  for (const sheet of sheets) {
    const xml = await part(zip, sheet.path);
    const rows: string[][] = [];
    let skipped = 0;
    if (xml) {
      for (const rowMatch of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const body = rowMatch[1];
        if (!body) continue;
        const cells: string[] = [];
        for (const c of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const head = c[1] ?? '';
          const inner = c[2] ?? '';
          const col = columnIndex(attr(head, 'r') ?? '');
          if (col >= MAX_COLUMNS) continue;
          const type = attr(head, 't');
          const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
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
