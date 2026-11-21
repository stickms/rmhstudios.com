# 14 — Highlights notebook and export

Surface: "My reading" (`/reading`). Wave 6. Namespace `highlights`.

## User story

As a reader who highlights and annotates Logs, News and library books, I want
one notebook where I can search my highlights and notes, group them by document,
and export them to Markdown or a spreadsheet, so that my reading notes are
useful outside the site — in my own notes app, an essay or a study guide.

## Requirements elicitation

- **What exists (verified):** `ReadingHighlight` (document kind and key, exact
  text with prefix and suffix, note, public flag, timestamps;
  `prisma/schema/library.prisma`), `GET/POST /api/reading/highlights`
  (`lib/reading/api/reading.highlights.server.ts`, paginated newest first) and
  "My highlights" (`components/reading/MyHighlightsPanel.tsx`, an infinite list
  inside `MyReadingView.tsx`). **There is no search, no filter, no grouping by
  document and no export** (no `export`, `markdown` or `download` code in the
  panel or `lib/reading`).
- **Decisions:** export is generated on the server, so document titles and links
  are resolved for every highlight (the client only knows the keys of the pages
  it loaded). Formats: Markdown (grouped by document: title, link, then each
  highlight as a blockquote with its note and date), CSV and JSON. At most
  10,000 highlights per export, the same cap the account export uses.

## Functional requirements

1. FR-1 A notebook view in My reading: a search field (highlight text and
   notes), filters (document kind: Logs, News, Library; has a note; public or
   private), sort (newest, oldest, document), and a "group by document" toggle.
2. FR-2 Grouped view: one heading per document with its title, link and count,
   its highlights in reading order (`start` offset) beneath.
3. FR-3 Select highlights (checkbox per row, select all in the current filter)
   and export the selection, or export everything matching the filter.
4. FR-4 Export as Markdown, CSV or JSON; the file name includes the date.
5. FR-5 Copy one highlight as a citation: the quote, the document title and its
   URL, as plain text.
6. FR-6 Editing a note and deleting a highlight keep working from the notebook
   (the existing row actions).

## Non-functional requirements

- **Security and privacy:** owner-only; the export endpoint is session-only and
  rate-limited (3 per 10 minutes, like the account export); CSV cells are
  formula-guarded; Markdown escapes the characters that would change structure
  (`#`, `>`, `*`, `_`, `[`, `]`, backticks, leading `-` and `+`).
- **Performance:** search runs on the server (`ILIKE` on `exact` and `note`,
  limited to the viewer's rows, through an index on `(userId, createdAt desc)`
  that already exists); results paginate; the export streams JSON lines into a
  string only up to the cap.
- **Accessibility:** checkboxes have labels naming the quote; the selection
  count is announced; export format is a radio group, not a menu of icons.
- **i18n:** strings in `highlights`; exported headings use the viewer's locale
  for labels and dates; quote text is exported as written.
- **Steel:** rows on rules, quotes in `t-prose`, notes in `t-body` muted; Export
  is the one ink primary.

## Data model and API

No schema change.

- Pure `lib/reading/highlights-export.ts` (`toMarkdown`, `toCsv`, `toJson`,
  `escapeMarkdown`, `citation`).
- `lib/reading/highlights.server.ts`: a filtered list (`q`, `kind`, `hasNote`,
  `visibility`, `sort`) and `exportHighlights(userId, filter, ids?)` that
  resolves titles and URLs for blog, news and library keys.
- Contract `lib/reading/highlights.contract.ts`; endpoints
  `GET /api/reading/highlights/search` and `POST /api/reading/highlights/export`
  (returns the file with `Content-Disposition: attachment`).
- UI `components/reading/HighlightsNotebook.tsx`, mounted from
  `MyReadingView.tsx`.

## Testing requirements

- Product suite `lib/reading/__tests__/highlights-export.product.test.ts`:
  Markdown grouping and escaping; citation format; JSON shape; dates in the
  given locale.
- Main suite `lib/reading/__tests__/highlights-export.test.ts`: export is scoped
  to the session user; ids not owned by the user are ignored; CSV formula guard;
  the cap holds.

## Acceptance criteria

- [ ] Searching a word finds highlights whose text or note contains it.
- [ ] Group by document shows each document once with its highlights in reading
      order.
- [ ] An exported Markdown file pasted into a Markdown editor shows a heading
      per document and each quote as a blockquote with its note.
- [ ] A highlight starting with `=` exports to CSV without being evaluated.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Sync to third-party note apps, sharing a notebook publicly, PDF export.
