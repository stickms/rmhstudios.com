/**
 * Flashcard export (pure). TSV for Anki and Quizlet, CSV for spreadsheets,
 * JSON for everything else. Each returns the file's text. An occlusion card (a picture with masks) cannot be
 * written as text columns, so the two text formats leave it out and `buildExport` says how many it left out;
 * only the JSON file carries it (`type: 'occlusion'`, its picture and its masks).
 */
import type { Occlusion } from '@/lib/study/occlusion';

export interface ExportCard {
  front: string;
  back: string;
  /** Pictures with their descriptions. Only the JSON file carries them (TSV and CSV are plain text for Anki and sheets). */
  frontImage?: { url: string; alt: string } | null | undefined;
  backImage?: { url: string; alt: string } | null | undefined;
  /** Basic when absent. A cloze card's text is its front, unchanged, and its back is empty. */
  kind?: string | undefined;
  /** The masks of an occlusion card (JSON only). */
  occlusion?: Occlusion | null | undefined;
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

const isOcclusion = (c: ExportCard): boolean => c.kind === 'occlusion';

/** How many cards the text formats (TSV, CSV) leave out: the occlusion cards. */
export function skippedInText(cards: readonly ExportCard[]): number {
  return cards.filter(isOcclusion).length;
}

/** Quoted only where a tab, newline or quote would break the row; reads back exactly. */
export function toTsv(all: ExportCard[]): string {
  const cards = all.filter((c) => !isOcclusion(c));
  const withType = typed(cards);
  return cards.map((c) => `${tsvCell(c.front)}\t${tsvCell(c.back)}${withType ? `\t${typeOf(c)}` : ''}\n`).join('');
}

function csvCell(cell: string): string {
  const safe = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) ? quote(safe) : safe;
}

/** RFC 4180: CRLF rows, a header row, quotes where needed; formula-looking cells get a leading `'`. */
export function toCsv(all: ExportCard[]): string {
  const cards = all.filter((c) => !isOcclusion(c));
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
      cards: deck.cards.map((c) => ({
        front: c.front,
        back: c.back,
        ...(typed(deck.cards) ? { type: typeOf(c) } : {}),
        ...(c.frontImage ? { frontImage: { url: c.frontImage.url, alt: c.frontImage.alt } } : {}),
        ...(c.backImage ? { backImage: { url: c.backImage.url, alt: c.backImage.alt } } : {}),
        ...(c.kind === 'occlusion' && c.occlusion
          ? { occlusion: { mode: c.occlusion.mode, masks: c.occlusion.masks.map((m) => ({ ...m })) } }
          : {}),
      })),
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

/** The file's text, MIME type and a filename made from the deck title, and how many cards the format left out. */
export function buildExport(
  format: ExportFormat,
  deck: ExportDeck,
): { text: string; mime: string; filename: string; skipped: number } {
  const text = format === 'tsv' ? toTsv(deck.cards) : format === 'csv' ? toCsv(deck.cards) : toJson(deck);
  const base =
    deck.title
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'deck';
  return {
    text,
    mime: MIME[format],
    filename: `${base}.${format}`,
    skipped: format === 'json' ? 0 : skippedInText(deck.cards),
  };
}
