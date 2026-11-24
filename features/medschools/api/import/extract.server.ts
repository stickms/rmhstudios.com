/**
 * The tracker import's reader: a file's bytes (or pasted text) to plain text for the model, in memory, then gone.
 *
 * Nothing about the file is kept: not the bytes, not the text, not the name. This module returns a string and a few counts
 * and writes and logs nothing. Checked in the order that spends the least first: the declared size, the type against the
 * name, the magic bytes, then the read.
 *
 * Rows of a sheet or a CSV are written one per line with ` | ` between cells (a tab would be flattened to a space by
 * `cleanForPrompt`, which would run the cells together). A workbook with several sheets keeps each under its name.
 * The text is capped at `IMPORT_LIMITS.chars` and a sheet at `IMPORT_LIMITS.rows`; what was cut is reported so the
 * member is told.
 */
import { extractDocxText, extractPdfText } from '@/lib/rmhladder/resume/extract.server';
import { AppError } from '@/lib/errors/codes';
import { IMPORT_LIMITS, importKindOf, type ImportKind } from '../../engine/import';
import { cleanForPrompt } from '../../engine/qa/sanitize';
import { readXlsx } from './xlsx.server';

export interface Extracted {
  kind: ImportKind | 'paste';
  text: string;
  /** Text or rows were dropped to fit the limits. */
  truncated: boolean;
}

const unsupported = () => new AppError('MEDSCHOOLS_IMPORT_UNSUPPORTED');
const tooLarge = () => new AppError('MEDSCHOOLS_IMPORT_TOO_LARGE');

/** A tracker is a few pages; a PDF past this is not one. */
const PDF_MAX_PAGES = 30;
/** Wall-clock budget for reading one PDF (the whole question has 50 s). */
const PDF_DEADLINE_MS = 10_000;

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** CSV and text are text: no NUL bytes in the head (a binary renamed `.csv`), and a UTF-16 byte-order mark is decoded. */
function decodeText(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer.subarray(0, 4096).includes(0)) throw unsupported();
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

/** Rows from CSV text: quotes, doubled quotes, embedded newlines; the delimiter is the most common of comma, semicolon, tab in the first line. */
export function parseCsv(text: string, maxRows: number): { rows: string[][]; skipped: number } {
  const first = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  const delimiter = ([',', ';', '\t'] as const)
    .map((d) => [d, first.split(d).length] as const)
    .sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let skipped = 0;
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endRow = () => {
    row.push(cell.trim());
    cell = '';
    if (row.some((c) => c !== '')) {
      if (rows.length < maxRows) rows.push(row);
      else skipped += 1;
    }
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      endRow();
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) endRow();
  return { rows, skipped };
}

const rowLine = (cells: readonly string[]): string => {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === '') end -= 1;
  return cells.slice(0, end).join(' | ');
};

function cap(text: string): { text: string; cut: boolean } {
  const trimmed = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return trimmed.length > IMPORT_LIMITS.chars
    ? { text: trimmed.slice(0, IMPORT_LIMITS.chars), cut: true }
    : { text: trimmed, cut: false };
}

/** Pasted text: bounded and capped like a file's. */
export function extractPasted(text: string): Extracted {
  const clean = text.split('\0').join('');
  const { text: out, cut } = cap(clean);
  return { kind: 'paste', text: out, truncated: cut };
}

/**
 * The text of an uploaded file. Throws `MEDSCHOOLS_IMPORT_TOO_LARGE` over 2 MB and `MEDSCHOOLS_IMPORT_UNSUPPORTED` for a
 * type, a name or a content that is not one of ours or is damaged. The file's name is read for its extension only.
 */
export async function extractFile(file: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  /** The request's signal: a member who leaves ends a PDF read. */
  signal?: AbortSignal | undefined;
}): Promise<Extracted> {
  if (file.buffer.length > IMPORT_LIMITS.fileBytes) throw tooLarge();
  const kind = importKindOf(file.mimeType, file.filename);
  if (!kind) throw unsupported();
  const { buffer } = file;
  try {
    switch (kind) {
      case 'pdf': {
        if (!buffer.subarray(0, 1024).toString('latin1').includes('%PDF')) throw unsupported();
        const { text, cut } = cap(await extractPdfText(buffer, {
            maxChars: IMPORT_LIMITS.chars + 1,
            maxPages: PDF_MAX_PAGES,
            deadlineMs: PDF_DEADLINE_MS,
            ...(file.signal ? { signal: file.signal } : {}),
          }));
        return { kind, text, truncated: cut };
      }
      case 'docx': {
        if (!buffer.subarray(0, 4).equals(ZIP_MAGIC)) throw unsupported();
        const { text, cut } = cap(await extractDocxText(buffer, { maxChars: IMPORT_LIMITS.chars + 1, tableCells: true }));
        // A table's cells end in tabs; show them the way a sheet's are.
        return { kind, text: text.replace(/\t+\n/g, '\n').replace(/[ ]*\t[ ]*/g, ' | '), truncated: cut };
      }
      case 'xlsx': {
        if (!buffer.subarray(0, 4).equals(ZIP_MAGIC)) throw unsupported();
        const sheets = await readXlsx(buffer, IMPORT_LIMITS.rows);
        const lines: string[] = [];
        let skipped = 0;
        for (const s of sheets) {
          if (s.rows.length === 0) continue;
          if (sheets.length > 1) lines.push(`Sheet: ${s.name}`);
          for (const r of s.rows) lines.push(rowLine(r));
          skipped += s.skippedRows;
        }
        const { text, cut } = cap(lines.join('\n'));
        return { kind, text, truncated: cut || skipped > 0 };
      }
      case 'csv': {
        const { rows, skipped } = parseCsv(decodeText(buffer), IMPORT_LIMITS.rows);
        const { text, cut } = cap(rows.map(rowLine).join('\n'));
        return { kind, text, truncated: cut || skipped > 0 };
      }
      case 'txt': {
        const { text, cut } = cap(decodeText(buffer).split('\0').join(''));
        return { kind, text, truncated: cut };
      }
    }
  } catch (err) {
    // A damaged archive, a PDF that will not open: the file is not one we can read. Never echo the parser's message.
    if (err instanceof AppError) throw err;
    throw unsupported();
  }
}

/** Each line cleaned on its own (`cleanForPrompt` folds whitespace, so rows would otherwise run together). */
export function promptText(text: string): { text: string; truncated: boolean } {
  const lines = text
    .split('\n')
    .map((l) => cleanForPrompt(l, 2_000))
    .filter((l) => l !== '');
  const joined = lines.join('\n');
  return joined.length > IMPORT_LIMITS.chars
    ? { text: joined.slice(0, IMPORT_LIMITS.chars), truncated: true }
    : { text: joined, truncated: false };
}
