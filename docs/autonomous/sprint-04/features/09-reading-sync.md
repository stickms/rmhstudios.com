# 09 — Library place, bookmarks and notes on every device

Surface: the library readers (`components/library/BookReader.tsx` for PDFs,
`EpubReader.tsx` for EPUBs), `/library` and the resume rail on `/history`.
Wave 1. Namespace `reading-sync`.

## User story

As a signed-in member reading a long book in the library, I want my place,
my bookmarks and my page notes to follow me from my laptop to my phone, and
the book to appear under "Continue reading" — so that switching devices does
not mean hunting for the page I was on or losing what I wrote.

## Requirements elicitation

- **What exists (verified):** `lib/library/reader-store.ts` keeps the page a
  reader left off on, their bookmarks and their page notes in **IndexedDB on
  the device only** (its header: "private to them … no account, no server
  round-trip"). Highlights, by contrast, are server-side
  (`ReadingHighlight`, `prisma/schema/library.prisma`, sprint 02). The
  history table `HistoryEntry` lists `'library_doc'` as an entity type
  (`lib/history/constants.ts`, position "percent*100 (docs)") and the
  heartbeat `POST /api/history/beat` (`lib/history/schema.ts`,
  `history.server.ts` `recordBeat`) accepts it — but **no reader sends it**,
  and the resume rail (`lib/history/resume.server.ts`) only builds cards for
  `tube_video` and `song`. `ReadingShelfEntry` stores shelf and finish, not
  position.
- **Decisions:** for signed-in readers the device store stays the fast path
  and the server is the sync: on open the reader loads the server's marks and
  place and merges them (bookmarks and notes are a union by a client-made id;
  edits and deletions win by `updatedAt`; the place is whichever is newer).
  Signed-out readers keep today's device-only behaviour. A per-device switch
  "Keep my place and notes on this device only" turns syncing off (stored in
  `localStorage`, a per-viewer convenience). Access is the book's: a member
  can sync marks only for a book they can open (`getBook(slug)`, not hidden).
  Caps: 500 marks per book, 5,000 per member.

## Functional requirements

1. FR-1 Opening a book signed in restores the newest place across devices
   (PDF page, or EPUB location) and shows the union of bookmarks and notes; a
   one-line notice "Continued from your other device (page 214)" appears when
   the server's place won.
2. FR-2 Turning pages saves the place to the device at once (as today) and to
   the server at most every 10 seconds and on page hide.
3. FR-3 Adding, editing or deleting a bookmark or note writes to the server
   immediately; a failed write is retried on the next save and never blocks
   reading.
4. FR-4 The reader also sends the `library_doc` history beat (percent read),
   so the book appears on `/history`, and the resume rail gains library cards
   ("Continue reading {{title}} — 46%") linking to the book at the saved
   place.
5. FR-5 `/library` shows a "Continue reading" row (up to 6 books by latest
   place) for signed-in members with synced places.
6. FR-6 The reader's details panel (`ReaderDetails.tsx`) has the "this device
   only" switch and "Remove synced place and notes for this book".

## Non-functional requirements

- **Security:** every endpoint is session-only, keyed by the caller, and
  checks the book is readable; marks are never readable by anyone else
  (including the uploader). zod: page 1..100,000, EPUB location ≤ 200
  characters, label ≤ 120, note ≤ 2,000, client id a 21–40 character token.
  Rate limit: the place endpoint `{ limit: 30, windowMs: 60_000 }`, marks
  `write`. The 500/5,000 caps are checked in a transaction under
  `pg_advisory_xact_lock(hashtext('reader-marks:' || userId))`.
- **Performance:** one `GET` on open (`@@index([userId, docSlug])`), the
  place write is an upsert on `@@unique([userId, docSlug, clientId])` with
  the fixed client id `place`; the continue row is one indexed query.
- **Privacy:** marks erased under `s04-09`; an `exportReaderMarks(userId)`
  for the account export.
- **Accessibility:** the continued-from notice is a polite live region and
  does not steal focus; the switch is labelled.
- **i18n:** strings in `reading-sync`; percentages via `Intl.NumberFormat`.
- **Steel:** the continue row is a row of covers on `--site-bg-subtle`
  placeholders with 1 px borders; the notice is `t-meta`, no banner box.

## Data model and API

- New model in `prisma/schema/library.prisma`: `LibraryReaderMark { id String
  @id @default(cuid()), userId, docSlug String @db.VarChar(200), clientId
  String @db.VarChar(40), kind String @db.VarChar(8) /* place | bookmark |
  note */, page Int, location String? @db.VarChar(200), label String?
  @db.VarChar(120), body String? @db.VarChar(2000), deletedAt DateTime?,
  createdAt, updatedAt }`, `@@unique([userId, docSlug, clientId])`,
  `@@index([userId, docSlug])`, `@@index([userId, kind, updatedAt(sort:
  Desc)])`, `@@map("library_reader_mark")`. Deletions are tombstones
  (`deletedAt`) for 30 days so other devices learn of them. Back-relation on
  `User` under `s04-09`. Migration `20261124010100_s04_reader_marks`.
- `lib/library/reader-sync.ts` (pure: merge of device and server state,
  conflict rule, caps), `reader-sync-schema.ts`, `reader-sync.contract.ts`,
  `reader-sync.server.ts`.
- Modules `lib/library/api/library.$slug.marks.server.ts` (`GET`, `PUT` a
  batch of up to 50 upserts and tombstones, `DELETE` all for the book) and
  `library.continue.server.ts` (`GET`).
- `lib/library/reader-store.ts`: a sync layer around `useBookState` (device
  first, server merge after load).
- `lib/history/resume.server.ts`: library cards.

## Testing requirements

- Main suite `lib/library/__tests__/reader-sync.test.ts`: marks are scoped
  to the caller; a hidden book refuses; caps hold under the lock; a batch with
  another member's ids cannot touch their rows.
- Main suite `lib/account/__tests__/reader-marks-erasure.test.ts`.
- Product suite `lib/library/__tests__/reader-sync.product.test.ts`: merge
  rules (union, newer edit wins, tombstone wins over older edit, place pick).

## Acceptance criteria

- [ ] A bookmark added on one browser appears in another after reopening the
      book; the place follows.
- [ ] With "this device only" on, nothing is sent.
- [ ] The book shows on `/history` and in the resume rail.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Sharing notes, syncing reader settings (zoom, theme), live sync while two
devices read at once.
