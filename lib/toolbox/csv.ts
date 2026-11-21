/**
 * CSV parsing and writing (RFC 4180, plus the variations people actually paste).
 *
 * The parser takes quoted fields with embedded delimiters, doubled quotes and
 * line breaks, CRLF or LF endings, a UTF-8 byte-order mark, and any one-character
 * delimiter; `detectDelimiter` picks comma, semicolon, tab or pipe from the
 * first lines when the user has not said. The writer quotes exactly the fields
 * that need it, so output re-imports cleanly into any spreadsheet.
 */

export type CsvRow = string[];

export interface CsvParseResult {
  rows: CsvRow[];
  /** A quoted field that never closed: the parse is still returned, best effort. */
  unterminatedQuoteAt?: { line: number };
}

export const DELIMITER_CANDIDATES = [',', ';', '\t', '|'] as const;

/** Parse CSV text into rows of fields. */
export function parseCsv(input: string, delimiter = ','): CsvParseResult {
  const text = input.replace(/^\uFEFF/, '');
  const rows: CsvRow[] = [];
  let row: CsvRow = [];
  let field = '';
  let inQuotes = false;
  let quoteLine = 0;
  let line = 1;
  let i = 0;
  let rowHasContent = false;
  while (i < text.length) {
    const c = text[i] as string;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (c === '\n') line++;
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      inQuotes = true;
      quoteLine = line;
      rowHasContent = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = '';
      rowHasContent = true;
      i++;
      continue;
    }
    if (c === '\r' || c === '\n') {
      if (rowHasContent || field !== '') {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = '';
      rowHasContent = false;
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      line++;
      continue;
    }
    field += c;
    rowHasContent = true;
    i++;
  }
  if (rowHasContent || field !== '') {
    row.push(field);
    rows.push(row);
  }
  return inQuotes ? { rows, unterminatedQuoteAt: { line: quoteLine } } : { rows };
}

/**
 * The candidate delimiter that splits the first few lines into the most
 * consistent number of columns (more than one). Comma when nothing fits.
 */
export function detectDelimiter(input: string): string {
  const sample = input.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).slice(0, 10).join('\n');
  let best: { delimiter: string; score: number } = { delimiter: ',', score: 0 };
  for (const delimiter of DELIMITER_CANDIDATES) {
    const counts = parseCsv(sample, delimiter).rows.map((r) => r.length);
    if (counts.length === 0) continue;
    const first = counts[0] ?? 1;
    if (first < 2) continue;
    const consistent = counts.filter((n) => n === first).length / counts.length;
    const score = consistent * 100 + first;
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

function needsQuotes(field: string, delimiter: string): boolean {
  return field.includes(delimiter) || /["\r\n]/.test(field) || /^\s|\s$/.test(field);
}

/** Write rows as CSV, quoting only what needs it, with CRLF line ends (RFC 4180). */
export function writeCsv(rows: readonly (readonly string[])[], delimiter = ',', lineEnd = '\r\n'): string {
  return rows
    .map((row) =>
      row.map((f) => (needsQuotes(f, delimiter) ? `"${f.replace(/"/g, '""')}"` : f)).join(delimiter),
    )
    .join(lineEnd);
}

/** Turn a cell into a JSON value when asked to: numbers, booleans and empty cells. */
export function inferValue(cell: string): string | number | boolean | null {
  if (cell === '') return null;
  if (cell === 'true') return true;
  if (cell === 'false') return false;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(cell)) {
    const n = Number(cell);
    if (Number.isFinite(n) && (Math.abs(n) <= Number.MAX_SAFE_INTEGER || cell.includes('.'))) return n;
  }
  return cell;
}

/**
 * Rows to JSON. With a header row, an array of objects keyed by the header
 * (duplicate or blank header names get a numeric suffix so no column is lost);
 * without one, an array of arrays.
 */
export function rowsToJson(rows: readonly CsvRow[], { header = true, infer = false } = {}): unknown[] {
  const cell = (v: string | undefined) => (infer ? inferValue(v ?? '') : (v ?? ''));
  if (!header) return rows.map((r) => r.map((v) => cell(v)));
  const [head = [], ...body] = rows;
  const seen = new Map<string, number>();
  const keys = head.map((raw, i) => {
    const base = raw.trim() || `column${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
  return body.map((r) => {
    const obj: Record<string, unknown> = {};
    const width = Math.max(keys.length, r.length);
    for (let i = 0; i < width; i++) obj[keys[i] ?? `column${i + 1}`] = cell(r[i]);
    return obj;
  });
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export type JsonToCsvResult = { ok: true; rows: string[][] } | { ok: false; reason: 'invalid-json' | 'not-array' };

/**
 * JSON to rows. An array of objects becomes a header of every key seen (in
 * first-seen order) plus one row per object; an array of arrays is written as
 * is. Nested values are written as JSON text inside the cell.
 */
export function jsonToRows(text: string): JsonToCsvResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  if (!Array.isArray(value)) return { ok: false, reason: 'not-array' };
  if (value.every((v) => Array.isArray(v))) {
    return { ok: true, rows: value.map((r: unknown[]) => r.map(cellText)) };
  }
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const k of Object.keys(item)) {
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
    }
  }
  const rows = value.map((item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? keys.map((k) => cellText((item as Record<string, unknown>)[k]))
      : [cellText(item)],
  );
  return { ok: true, rows: [keys, ...rows] };
}
