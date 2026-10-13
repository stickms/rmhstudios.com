/**
 * Markdown footnotes (`[^1]` + `[^1]: text`) for blog and news bodies — idea L2.
 * Pure. `react-markdown` here has no GFM plugin, so footnote syntax would
 * otherwise print literally. This lifts the definitions out of the source and
 * rewrites each reference into a link whose href encodes the footnote's number
 * (`#rf-fn-<n>-<occurrence>`); the article renderer turns those links into
 * sidenote / popover components.
 *
 * Code (fenced blocks and inline spans) is left alone, as are references to an
 * undefined label (they stay literal text, which is what the author wrote).
 */

export interface Footnote {
  /** 1-based number, in order of first reference. */
  index: number;
  label: string;
  text: string;
}

export interface ParsedFootnotes {
  body: string;
  notes: Footnote[];
}

const DEF = /^ {0,3}\[\^([A-Za-z0-9_-]{1,40})\]:[ \t]*(.*)$/;
const REF = /\[\^([A-Za-z0-9_-]{1,40})\](?!:)/g;
const CODE_SPLIT = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

export const FOOTNOTE_HREF = /^#rf-fn-(\d+)-(\d+)$/;

export function extractFootnotes(markdown: string): ParsedFootnotes {
  if (!markdown.includes('[^')) return { body: markdown, notes: [] };

  // 1. Pull out definitions (outside fenced code).
  const defs = new Map<string, string>();
  const kept: string[] = [];
  let fence: string | null = null;
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const f = /^ {0,3}(```|~~~)/.exec(line);
    if (f) {
      if (fence === null) fence = f[1]!;
      else if (f[1] === fence) fence = null;
      kept.push(line);
      continue;
    }
    const m = fence === null ? DEF.exec(line) : null;
    if (!m) {
      kept.push(line);
      continue;
    }
    let text = m[2]!;
    // Continuation lines: indented, non-blank.
    while (i + 1 < lines.length && /^( {2,}|\t)\S/.test(lines[i + 1]!)) {
      text += ' ' + lines[i + 1]!.trim();
      i++;
    }
    defs.set(m[1]!, text.trim());
  }
  if (defs.size === 0) return { body: markdown, notes: [] };

  // 2. Number references in document order and rewrite them.
  const order = new Map<string, Footnote>();
  const seenCount = new Map<string, number>();
  const rewritten = kept
    .join('\n')
    .split(CODE_SPLIT)
    .map((part, i) => {
      if (i % 2 === 1) return part; // code
      return part.replace(REF, (whole, label: string) => {
        const text = defs.get(label);
        if (text === undefined) return whole;
        let note = order.get(label);
        if (!note) {
          note = { index: order.size + 1, label, text };
          order.set(label, note);
        }
        const occurrence = (seenCount.get(label) ?? 0) + 1;
        seenCount.set(label, occurrence);
        return `[${note.index}](#rf-fn-${note.index}-${occurrence})`;
      });
    })
    .join('')
    .replace(/\n{3,}$/g, '\n\n');

  return { body: rewritten, notes: [...order.values()] };
}
