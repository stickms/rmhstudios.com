/**
 * Flashcard export (pure). TSV for Anki and Quizlet, CSV for spreadsheets,
 * JSON for everything else. Each returns the file's text.
 */

export interface ExportCard {
  front: string;
  back: string;
}

export interface ExportDeck {
  title: string;
  description: string | null;
  cards: ExportCard[];
}

export type ExportFormat = 'tsv' | 'csv' | 'json';

/** A cell that a spreadsheet would read as a formula starts with one of these. */
const FORMULA_START = /^[=+\-@\t\r]/;

function quote(cell: string): string {
  return `"${cell.replace(/"/g, '""')}"`;
}

function tsvCell(cell: string): string {
  return /[\t\r\n"]/.test(cell) ? quote(cell) : cell;
}

/** Quoted only where a tab, newline or quote would break the row; reads back exactly. */
export function toTsv(cards: ExportCard[]): string {
  return cards.map((c) => `${tsvCell(c.front)}\t${tsvCell(c.back)}\n`).join('');
}

function csvCell(cell: string): string {
  const safe = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) ? quote(safe) : safe;
}

/** RFC 4180: CRLF rows, a header row, quotes where needed; formula-looking cells get a leading `'`. */
export function toCsv(cards: ExportCard[]): string {
  const rows = [['front', 'back'], ...cards.map((c) => [c.front, c.back])];
  return rows.map((r) => `${csvCell(r[0])},${csvCell(r[1])}\r\n`).join('');
}

export function toJson(deck: ExportDeck): string {
  return JSON.stringify(
    {
      title: deck.title,
      description: deck.description ?? '',
      cards: deck.cards.map((c) => ({ front: c.front, back: c.back })),
    },
    null,
    2,
  );
}

const MIME: Record<ExportFormat, string> = {
  tsv: 'text/tab-separated-values;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
};

/** The file's text, MIME type and a filename made from the deck title. */
export function buildExport(format: ExportFormat, deck: ExportDeck): { text: string; mime: string; filename: string } {
  const text = format === 'tsv' ? toTsv(deck.cards) : format === 'csv' ? toCsv(deck.cards) : toJson(deck);
  const base =
    deck.title
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'deck';
  return { text, mime: MIME[format], filename: `${base}.${format}` };
}
