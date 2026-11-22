# 03 — Flashcard deck editor with import and export

Surface: `/study` flashcards. Wave 1. Namespace `study-editor`.

## User story

As a student with a deck of flashcards, I want to edit and delete cards, reorder
them, rename the deck, paste a whole vocabulary list in one go and export my
deck to a spreadsheet, so that building and maintaining a 200-card deck is not
200 one-at-a-time form submissions with no way to fix a typo.

## Requirements elicitation

- **What exists (verified):** `FlashcardDeck`, `Flashcard` (front, back,
  position) and `FlashcardReview` (SM-2 state) in
  `prisma/schema/rmhstudy.prisma`. The API (`lib/study/api/`) can list, create
  (optionally AI-seeded), fetch, **add one card**, delete a deck, clone, review.
  There is **no edit or delete for a card, no deck rename, no reorder, no
  import, no export.** UI: `components/feed/DeckStudyColumn.tsx` (study + add
  card) and `FlashcardsColumn.tsx` (deck list), routes
  `app/routes/_site/study/`.
- **Who imports what:** people moving from Anki, Quizlet or a spreadsheet. Anki
  and Quizlet both export plain text with a tab between term and definition;
  spreadsheets export CSV (sometimes `;`-separated). Hand-written lists use
  `term - definition` or `term = definition`.
- **Decisions:** import is plain text only (no `.apkg`: it is a zipped SQLite
  database and pulling a SQLite reader into the client is not worth it). The
  separator is detected per paste with a manual override. Cards keep the 500
  character limit per side that `addCardBody` already enforces. A deck holds at
  most 2,000 cards; one import adds at most 500.

## Functional requirements

1. FR-1 Deck settings: rename, edit description, toggle public (owner only).
2. FR-2 Card list with inline edit of front and back, delete with undo (8 s
   toast), and drag or keyboard reorder (`components/ui/sortable-list.tsx`).
   Editing a card keeps its review history; deleting removes its reviews.
3. FR-3 Bulk import: a textarea and a file picker (`.txt`, `.tsv`, `.csv`, up to
   1 MB). The parser detects the separator (tab, comma, semicolon, `-`, `=`,
   `:`), honours CSV quoting (quoted separators, doubled quotes, newlines inside
   quotes), trims, skips blank lines, and offers "first row is a header". A
   preview table shows the first 50 parsed cards and every rejected line with
   its reason (missing back, side too long). Options: swap sides, skip cards
   whose front already exists in the deck.
4. FR-4 Import is all-or-nothing in one transaction; positions follow the
   current last card; `cardCount` is updated in the same transaction.
5. FR-5 Export: TSV (Anki and Quizlet compatible), CSV (RFC 4180) and JSON
   (`{ title, description, cards: [{ front, back }] }`). Owners export any deck;
   anyone may export a public deck.
6. FR-6 The deck page shows an Edit link to the owner.

## Non-functional requirements

- **Security:** every write is owner-only (404 for a foreign or missing deck);
  all bodies are zod-validated; `rateLimit: 'write'`; CSV export prefixes cells
  that start with `=`, `+`, `-`, `@`, tab or carriage return with `'`
  (spreadsheet formula injection); files are parsed in the browser and only the
  parsed cards are sent.
- **Performance:** parsing 5,000 lines stays under 100 ms (pure, no regex
  backtracking on quotes); the bulk endpoint writes with one `createMany`.
- **Accessibility:** reorder works with the keyboard (the sortable list's
  buttons); the preview is a table with a caption; errors are linked to their
  line numbers.
- **i18n:** strings in `study-editor`; card text is user content and is shown
  with `dir="auto"`.
- **Steel:** cards are rows on rules, not boxes; the import preview is a table
  on rules; Save or Import is the one ink primary in its view.

## Data model and API

No schema change. Pure modules `lib/study/import.ts` (`detectSeparator`,
`parseCards`) and `lib/study/export.ts` (`toTsv`, `toCsv`, `toJson`). Contracts
appended to `lib/study/decks.contract.ts`, zod in `lib/study/decks-schema.ts`.
Endpoints:

- `PATCH /api/study/decks/$id` (title, description, isPublic) — added to
  `lib/study/api/study.decks.$id.server.ts`.
- `PATCH /api/study/cards/$id`, `DELETE /api/study/cards/$id` — new module
  `lib/study/api/study.cards.$id.server.ts`.
- `POST /api/study/decks/$id/cards` (bulk, up to 500) — new module.
- `PUT /api/study/decks/$id/order` (`cardIds` in the new order; must be exactly
  the deck's cards) — new module.
- Export is client-side from the deck payload the page already loads.

Route `/study/$deckId/edit` (`app/routes/_site/study/$deckId_.edit.tsx`),
`EXCLUDED_ROUTES` `'personal'`.

## Testing requirements

- Product suite `lib/study/__tests__/import.product.test.ts` and
  `export.product.test.ts`: each separator; quoted CSV with embedded commas,
  quotes and newlines; header row; swap; over-long sides rejected with line
  numbers; TSV round-trips; CSV formula guard.
- Main suite `lib/study/__tests__/deck-editor.server.test.ts` (user data):
  foreign deck or card answers 404; the order endpoint rejects a list that is
  not exactly the deck's cards; bulk import over the cap is refused and writes
  nothing; `cardCount` matches after import and delete.

## Acceptance criteria

- [ ] A Quizlet export pasted as-is imports with no manual separator choice.
- [ ] A CSV with a quoted comma inside a definition imports that definition
      whole.
- [ ] Deleting a card can be undone within the toast; after that it is gone with
      its reviews.
- [ ] Reordering with the keyboard alone persists after reload.
- [ ] Exported TSV re-imported into a new deck reproduces it exactly.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Images on cards, rich text, `.apkg` import, collaborative editing.
