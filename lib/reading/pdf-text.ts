/**
 * Turn pdf.js text-content items into readable paragraphs (L1 in the library
 * reader). PDF text arrives as positioned fragments, not paragraphs: lines are
 * joined with a space (un-hyphenating "exam-\nple"), and a vertical gap well
 * beyond the line height starts a new paragraph. A page with no text items at
 * all is a scanned image — the caller reports that rather than guessing.
 */

export interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
  height?: number;
  transform?: number[];
}

export function pdfItemsToText(items: PdfTextItem[]): string {
  let out = '';
  let lastY: number | null = null;
  let lastH = 0;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    const y = it.transform?.[5];
    const h = it.height || lastH || 10;
    if (it.str.length === 0) {
      if (it.hasEOL && out && !out.endsWith('\n') && !out.endsWith(' ')) out += ' ';
      continue;
    }
    if (
      lastY !== null &&
      y !== undefined &&
      lastY - y > Math.max(lastH, h) * 1.9 &&
      out &&
      !out.endsWith('\n\n')
    ) {
      out = out.trimEnd() + '\n\n';
    }
    out += it.str;
    if (it.hasEOL) {
      if (/[A-Za-z]-$/.test(out)) out = out.slice(0, -1);
      else out += ' ';
    }
    if (y !== undefined) lastY = y;
    lastH = h;
  }
  return out
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}
