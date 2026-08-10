'use client';

/**
 * The small slice of Markdown the assistant actually emits, rendered as React
 * elements.
 *
 * A model writes `**bold**` whether or not you ask it to — telling it not to in
 * the system prompt works most of the time, and "most of the time" means the
 * asterisks show up raw in front of a user eventually. So the answer is to
 * render the subset rather than to keep asking.
 *
 * **Why not a Markdown library.** `react-markdown` plus its remark/rehype
 * plugins is ~90KB gzipped and brings an HTML pipeline that then has to be
 * sanitised. The assistant emits bold, italic, inline code and line breaks; a
 * parser for exactly those is 60 lines and cannot render an `<img onerror>`
 * because it never produces HTML at all.
 *
 * **Safety is structural, not filtered.** Every branch below returns a React
 * element with a plain string child. There is no `dangerouslySetInnerHTML`
 * anywhere, so nothing the model can say — a raw `<script>`, an
 * `onerror=` attribute, a `javascript:` URL — is ever interpreted as markup.
 * It renders as the text it is.
 */

import type { ReactNode } from 'react';

/**
 * Inline spans. Order matters twice over:
 *
 *   `code` first — its contents are literal and must not be re-parsed.
 *   Then `**bold**`, then `*italic*` / `_italic_`: a greedy single-asterisk
 *   rule would otherwise eat the first two characters of a bold run and leave a
 *   stray one behind, which is the exact artefact this component exists to fix.
 *
 * Each delimiter must HUG non-whitespace, which is CommonMark's flanking rule
 * and not a detail worth skipping: without it `a * b * c` renders as
 * "a <em> b </em> c", so any sentence with a loose asterisk in it — a footnote
 * marker, "8 * 3" — silently turns italic. Excluding the delimiter character
 * itself from the first content position additionally keeps `***` and `__`
 * literal instead of emphasising a lone marker.
 */
const INLINE =
  /(`[^`\n]+`|\*\*[^\s*](?:[^*\n]*?[^\s*])?\*\*|\*[^\s*](?:[^*\n]*?[^\s*])?\*|_[^\s_](?:[^_\n]*?[^\s_])?_)/g;

/**
 * Split a line into text and formatted spans.
 *
 * Uses `matchAll` and walks the gaps rather than `String.split(/(…)/)`. The
 * split version looked simpler and was wrong: it hands back text chunks and
 * delimiter chunks alternately, and the code then re-classified each chunk by
 * its SHAPE — "starts and ends with `*`" — instead of by whether the regex had
 * actually matched it. So `***`, which the pattern correctly declines to match,
 * came back as one text chunk, passed the shape test, and rendered as an
 * italicised asterisk. Classifying by what matched removes the whole category.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > cursor) out.push(text.slice(cursor, at));
    cursor = at + token.length;
    const key = `${keyPrefix}-${index++}`;

    if (token.startsWith('`')) {
      out.push(
        <code key={key} className="pf2e-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
  }

  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/**
 * Render one assistant message.
 *
 * Block handling is deliberately shallow: paragraphs split on blank lines, and
 * `-`/`*`/`1.` at the start of a line becomes a list item. The assistant is
 * told to answer in a sentence or two, so anything deeper would be scaffolding
 * for output that does not occur — and a bullet that renders as a bullet is the
 * whole of what a list needs here.
 */
export function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);

  return (
    <>
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n');
        const isList = lines.every((line) => /^\s*(?:[-*]|\d+\.)\s+/.test(line));

        if (isList) {
          return (
            <ul key={blockIndex} className="pf2e-msg-list">
              {lines.map((line, i) => (
                <li key={i}>
                  {renderInline(line.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''), `${blockIndex}-${i}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIndex} className={blockIndex > 0 ? 'pf2e-msg-p' : undefined}>
            {lines.map((line, i) => (
              // A single newline inside a block is a line break, not a new
              // paragraph — the model uses them for "here is the next one".
              <span key={i}>
                {i > 0 && <br />}
                {renderInline(line, `${blockIndex}-${i}`)}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}
