/**
 * Flashcard export (pure). TSV for Anki and Quizlet, CSV for spreadsheets,
 * JSON for everything else. Each returns the file's text.
 */

export interface ExportCard {
  front: string;
  back: string;
  /** Basic when absent. A cloze card's text is its front, unchanged, and its back is empty. */
  kind?: string | undefined;
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

/**
 * Authored cards carry a `type` column (basic, reversible, cloze) as soon as the deck holds one that is not
 * basic, which is what lets the importer rebuild a mixed deck exactly. An all-basic deck keeps its two columns.
 */
function typed(cards: readonly ExportCard[]): boolean {
  return cards.some((c) => c.kind !== undefined && c.kind !== 'basic');
}
const typeOf = (c: ExportCard): string => c.kind ?? 'basic';

/** Quoted only where a tab, newline or quote would break the row; reads back exactly. */
export function toTsv(cards: ExportCard[]): string {
  const withType = typed(cards);
  return cards
    .map((c) => `${tsvCell(c.front)}\t${tsvCell(c.back)}${withType ? `\t${typeOf(c)}` : ''}\n`)
    .join('');
}

function csvCell(cell: string): string {
  const safe = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) ? quote(safe) : safe;
}

/** RFC 4180: CRLF rows, a header row, quotes where needed; formula-looking cells get a leading `'`. */
export function toCsv(cards: ExportCard[]): string {
  const withType = typed(cards);
  const rows = [
    withType ? ['front', 'back', 'type'] : ['front', 'back'],
    ...cards.map((c) => (withType ? [c.front, c.back, typeOf(c)] : [c.front, c.back])),
  ];
  return rows.map((r) => `${r.map((cell) => csvCell(cell)).join(',')}\r\n`).join('');
}

export function toJson(deck: ExportDeck): string {
  return JSON.stringify(
    {
      title: deck.title,
      description: deck.description ?? '',
      cards: deck.cards.map((c) =>
        typed(deck.cards) ? { front: c.front, back: c.back, type: typeOf(c) } : { front: c.front, back: c.back },
      ),
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
export function buildExport(
  format: ExportFormat,
  deck: ExportDeck,
): { text: string; mime: string; filename: string } {
  const text =
    format === 'tsv' ? toTsv(deck.cards) : format === 'csv' ? toCsv(deck.cards) : toJson(deck);
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
