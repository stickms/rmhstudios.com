# 11 — A link to any passage, and posting one

Surface: the highlight and selection menu in every reader (blog and news articles, library books), the readers' arrival
at a linked passage, the composer through `/share`. Wave 5. Namespace `passage-links`. Site tier for articles (Steel);
the library reader (`app/routes/library.$slug.tsx`) keeps its own look (L8).

## User story

As a reader, I want to copy a link that opens an article or a book at the exact sentence I selected, and post that
passage as a quote with the link, so that when I share what struck me, people land on it rather than at the top of a
long page.

## Requirements elicitation

- **What exists (verified):**
  - Text anchors: `lib/library/text-anchor.ts` (`createAnchor(text, start, end)` →
    `{ exact, prefix, suffix, start, end }`, `resolveAnchor(text, anchor)` re-anchoring by offsets, then a unique quote,
    then the best context match, else orphaned). Highlights use them (`ReadingHighlight`), and
    `components/reading/useHighlightKit.tsx` holds the selection popover for articles and books.
  - The composer can be opened with text and a link: `/share?title=&text=&url=` (`app/routes/_site/share.tsx`, the web
    share target, which also accepts a plain GET).
  - No reader accepts a passage in its URL: article routes (`app/routes/_site/blog/$slug.tsx`,
    `app/routes/_site/news/$slug.tsx`) and the book reader (`app/routes/library.$slug.tsx`) open at the top or at the
    member's saved place.
- **Decisions:**
  - **The link carries the anchor, not a row:** `?p=<code>` where `<code>` is a compact, URL-safe encoding of
    `{ unit, start, end, exact (up to 300 characters, longer selections truncated to their first 300 with `end` kept), prefix (up to 32), suffix (up to 32) }`,
    versioned (`v1.`) so a later format can change. No server write, no new table; any selection can be linked,
    highlighted or not, public or private (the text is the document's own).
  - **Arrival:** the reader resolves the anchor against the unit's text with `resolveAnchor`; on success it scrolls the
    passage into view once (no smooth scrolling: R5), marks it with the same static highlight style the reader already
    uses for a selection (a background in `--site-bg-subtle` on the site tier), and moves focus to a "Linked passage"
    landmark around it; on failure (the text changed) it opens normally and shows one line: "That passage is no longer
    in this text."
  - **Menu items:** "Copy link to passage" and "Post this passage" in the selection popover and on a highlight's menu.
    Posting opens `/share` with `text` = the passage in quotation marks (the locale's quotation marks, from a translated
    string) followed by " — <title>", and `url` = the passage link; nothing else changes in the composer.
  - **Privacy:** the code is the document's text only; a private highlight's note is never put in a link.
  - **Books:** the `unit` (PDF page or EPUB chapter) is opened first; a book the reader may not open (a members-only
    title) behaves as it does today for that reader.

## Functional requirements

1. FR-1 `encodePassage(anchor, unit)` / `decodePassage(code)` in `lib/library/passage-link.ts` (pure; rejects any code
   that does not decode to the bounds above; never throws).
2. FR-2 The two menu items in `useHighlightKit.tsx` for selections and highlights.
3. FR-3 Article routes and the book route accept `p` in `validateSearch` (string, at most 900 characters) and pass it to
   the reader, which resolves, scrolls once, marks and focuses.
4. FR-4 The "no longer in this text" line.
5. FR-5 Canonical URLs and `buildMeta` unchanged (the passage query is not part of the canonical link).

## Non-functional requirements

- **Security:** the decoded text is only ever used as a search string against the document; it is never rendered except
  as the document's own matching text.
- **Performance:** resolution runs once after the unit's text is available; no observer, no polling (B3).
- **Accessibility:** focus lands on the landmark; the mark has a text label for assistive technology ("Linked passage").
- **SEO:** canonical stays the document; `p` does not create a new indexable URL.

## Data model and API

- No schema change, no endpoint. New `lib/library/passage-link.ts`, `components/reading/usePassageArrival.ts`.
- Edits: `components/reading/useHighlightKit.tsx`, `components/reading/InlinePopover.tsx`,
  `components/reading/ArticleBody.tsx`, `components/reading/ReaderTextView.tsx` (or the book reader's text view), the
  three routes' `validateSearch`.

## Testing requirements

- Product suite `lib/library/__tests__/passage-link.product.test.ts`: round trip; truncation to 300; malformed,
  oversized and unknown-version codes return null; Unicode (Arabic, emoji) round-trips.
- Main suite `lib/library/__tests__/passage-arrival.test.ts`: resolution against edited text (moved, duplicated, removed
  passages) through `resolveAnchor`.
- `components/reading/__tests__/passage-menu.test.tsx` (`renderToStaticMarkup`): both items render with their labels.
- OG coverage and canonical tests stay green; the rAF allowlist (no frame loop added).

## Acceptance criteria

- [ ] Selecting a sentence in a news article and choosing "Copy link to passage" gives a link that opens the article
      scrolled to that sentence, marked.
- [ ] "Post this passage" opens the composer with the quote, the title and the link.
- [ ] A link to a sentence later edited out opens the article with "That passage is no longer in this text."
- [ ] A book link opens the right chapter or page.

## Out of scope

Short links stored on the server, links into other members' notes, passage links in RMHarks themselves, link previews
that show the passage.
