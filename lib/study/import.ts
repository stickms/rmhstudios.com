/**
 * Flashcard import parsing (pure, no I/O). Turns pasted text or a file's text
 * into cards: detects the separator, honours CSV quoting, and reports every
 * line it could not use. The tokenizer is a hand-written scanner, so a long
 * quoted field costs one pass and never backtracks.
 */
import { CARD_SIDE_MAX } from '@/lib/study/limits';

export type Separator = 'tab' | 'comma' | 'semicolon' | 'dash' | 'equals' | 'colon';

/** Detection order: also the tie-break when two separators fit equally well. */
export const SEPARATORS: readonly Separator[] = [
  'tab',
  'semicolon',
  'dash',
  'equals',
  'colon',
  'comma',
];

export type RejectReason = 'missing-front' | 'missing-back' | 'front-too-long' | 'back-too-long';

export interface ParsedCard {
  front: string;
  back: string;
}

export interface ParseOptions {
  /** Omit to detect it from the text. */
  separator?: Separator;
  /** The first row names the columns and is not a card. */
  hasHeader?: boolean;
  /** Put the second column on the front. */
  swap?: boolean;
}

export interface ParseResult {
  cards: ParsedCard[];
  /** `line` is the 1-based line of the text where the rejected row starts. */
  rejected: { line: number; reason: RejectReason }[];
  /** The separator used (detected when none was given); null when none fits. */
  separator: Separator | null;
}

interface RawRecord {
  line: number;
  fields: string[];
  raw: string;
}

/** Separators read as CSV (quote-aware), keyed to their character. */
const CSV_CHAR: Partial<Record<Separator, string>> = { tab: '\t', comma: ',', semicolon: ';' };

/** Detection reads at most this many rows; the rest of a long paste adds nothing. */
const SAMPLE_RECORDS = 50;
/** A separator must split at least this share of the sampled rows to be chosen. */
const MIN_COVERAGE = 0.5;

/**
 * Scan CSV-style text into records. A field that opens with a quote runs to the
 * closing quote (`""` is a literal quote, newlines inside are kept); a quote
 * anywhere else is plain text, and a quote that is never closed is plain text too.
 */
function tokenizeCsv(text: string, sep: string, limit = Infinity): RawRecord[] {
  const records: RawRecord[] = [];
  const n = text.length;
  let i = 0;
  let line = 1;
  let recordLine = 1;
  let recordStart = 0;
  let fields: string[] = [];
  let field = '';
  let atFieldStart = true;
  let quotesBroken = false;

  const endRecord = (end: number) => {
    fields.push(field);
    records.push({ line: recordLine, fields, raw: text.slice(recordStart, end) });
    fields = [];
    field = '';
    atFieldStart = true;
  };

  while (i < n && records.length < limit) {
    const ch = text[i];
    if (atFieldStart && ch === '"' && !quotesBroken) {
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < n) {
        const c = text[j];
        if (c === '"') {
          if (text[j + 1] === '"') {
            value += '"';
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        value += c;
        j++;
      }
      if (closed) {
        value = value.replace(/\r\n?/g, '\n');
        for (let k = 0; k < value.length; k++) if (value[k] === '\n') line++;
        field = value;
        atFieldStart = false;
        i = j + 1;
        continue;
      }
      // Never closed: this and every later quote is ordinary text.
      quotesBroken = true;
    }
    if (ch === sep) {
      fields.push(field);
      field = '';
      atFieldStart = true;
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      const end = i;
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      endRecord(end);
      line++;
      recordLine = line;
      recordStart = i;
      continue;
    }
    field += ch;
    atFieldStart = false;
    i++;
  }
  if (records.length < limit && (fields.length > 0 || field !== '')) endRecord(n);
  return records;
}

/** The first spaced dash, en dash or em dash: a hyphen inside a word is not a separator. */
function dashIndex(line: string): { at: number; len: number } | null {
  let best: { at: number; len: number } | null = null;
  for (const d of [' - ', ' – ', ' — ']) {
    const at = line.indexOf(d);
    if (at >= 0 && (!best || at < best.at)) best = { at, len: d.length };
  }
  return best;
}

function splitLine(line: string, sep: Separator): string[] {
  if (sep === 'dash') {
    const hit = dashIndex(line);
    return hit ? [line.slice(0, hit.at), line.slice(hit.at + hit.len)] : [line];
  }
  const ch = sep === 'equals' ? '=' : ':';
  const at = line.indexOf(ch);
  return at >= 0 ? [line.slice(0, at), line.slice(at + 1)] : [line];
}

function tokenizeLines(text: string, sep: Separator, limit = Infinity): RawRecord[] {
  const records: RawRecord[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length && records.length < limit; i++) {
    records.push({ line: i + 1, fields: splitLine(lines[i], sep), raw: lines[i] });
  }
  return records;
}

function tokenize(text: string, sep: Separator, limit = Infinity): RawRecord[] {
  const ch = CSV_CHAR[sep];
  return ch === undefined ? tokenizeLines(text, sep, limit) : tokenizeCsv(text, ch, limit);
}

const isBlank = (r: RawRecord) => r.fields.every((f) => f.trim() === '');

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Where a separator first appears in a raw row, or -1. */
function firstIndex(raw: string, sep: Separator): number {
  if (sep === 'dash') return dashIndex(raw)?.at ?? -1;
  const ch = CSV_CHAR[sep] ?? (sep === 'equals' ? '=' : ':');
  return raw.indexOf(ch);
}

/**
 * Guess how a paste separates term from definition. A tab wins whenever most
 * rows have one (Anki and Quizlet exports); otherwise the separator that splits
 * the most rows wins, then the one that comes first in the rows it splits (a
 * definition may hold commas, a CSV rarely holds a spaced dash), then the fixed
 * order of {@link SEPARATORS}. Null when nothing splits at least half the rows.
 */
export function detectSeparator(text: string): Separator | null {
  const body = stripBom(text);
  const scored: { sep: Separator; coverage: number; first: number; order: number }[] = [];
  let tabCoverage = 0;
  const sampleCache = new Map<Separator, RawRecord[]>();
  const sample = (sep: Separator) => {
    let records = sampleCache.get(sep);
    if (!records) {
      records = tokenize(body, sep, SAMPLE_RECORDS * 4).filter((r) => !isBlank(r));
      records = records.slice(0, SAMPLE_RECORDS);
      sampleCache.set(sep, records);
    }
    return records;
  };

  if (sample('tab').length === 0) return null;

  for (let order = 0; order < SEPARATORS.length; order++) {
    const sep = SEPARATORS[order];
    const records = sample(sep);
    if (records.length === 0) continue;
    const hits = records.filter((r) => r.fields.length >= 2).length;
    const coverage = hits / records.length;
    if (sep === 'tab') tabCoverage = coverage;
    let first = 0;
    for (const r of records) {
      if (r.fields.length < 2) continue;
      const mine = firstIndex(r.raw, sep);
      const earliest = SEPARATORS.every((other) => {
        const at = firstIndex(r.raw, other);
        return at < 0 || mine <= at;
      });
      if (earliest) first++;
    }
    scored.push({ sep, coverage, first, order });
  }

  if (tabCoverage >= MIN_COVERAGE) return 'tab';
  const fit = scored.filter((s) => s.coverage >= MIN_COVERAGE);
  if (fit.length === 0) return null;
  fit.sort((a, b) => b.coverage - a.coverage || b.first - a.first || a.order - b.order);
  return fit[0].sep;
}

/** Parse text into cards using the chosen (or detected) separator. */
export function parseCards(text: string, options: ParseOptions = {}): ParseResult {
  const body = stripBom(text);
  const separator = options.separator ?? detectSeparator(body);
  const cards: ParsedCard[] = [];
  const rejected: ParseResult['rejected'] = [];
  if (separator === null) {
    // Nothing splits the text: each non-blank line is a front without a back.
    let first = true;
    for (const r of tokenizeLines(body, 'colon').filter((x) => !isBlank(x))) {
      if (first && options.hasHeader) {
        first = false;
        continue;
      }
      first = false;
      rejected.push({ line: r.line, reason: options.swap ? 'missing-front' : 'missing-back' });
    }
    return { cards, rejected, separator };
  }

  const csvChar = CSV_CHAR[separator];
  const records = tokenize(body, separator).filter((r) => !isBlank(r));
  if (options.hasHeader) records.shift();

  for (const r of records) {
    const first = r.fields[0].trim();
    // Tab files may carry extra columns (Anki tags); comma and semicolon rows
    // that hold an unquoted separator in the definition keep it.
    const rest =
      csvChar === undefined || separator === 'tab'
        ? (r.fields[1] ?? '')
        : r.fields.slice(1).join(csvChar);
    const second = rest.trim();
    const front = options.swap ? second : first;
    const back = options.swap ? first : second;
    if (front === '') rejected.push({ line: r.line, reason: 'missing-front' });
    else if (back === '') rejected.push({ line: r.line, reason: 'missing-back' });
    else if (front.length > CARD_SIDE_MAX) rejected.push({ line: r.line, reason: 'front-too-long' });
    else if (back.length > CARD_SIDE_MAX) rejected.push({ line: r.line, reason: 'back-too-long' });
    else cards.push({ front, back });
  }
  return { cards, rejected, separator };
}
