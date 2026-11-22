# 01 — Flashcards from your highlights

Surface: `/reading` (the highlights notebook and "My highlights"), the highlight menu in every reader, `/study`. Wave 1.
Namespace `highlight-cards`. Site tier (Steel).

## User story

As a member who reads on the site and studies with flashcards, I want to turn a passage I highlighted into a card — a
question with the passage as the answer, or the passage with a word blanked out — without copying text between two apps,
and see later which highlight a card came from, so that what I read becomes what I remember.

## Requirements elicitation

- **What exists (verified):**
  - Highlights: `ReadingHighlight` (`prisma/schema/library.prisma`: `docKind` `library | blog | news`, `docKey`, `unit`,
    `exact` up to 2,000 characters, `prefix`, `suffix`, `note`, `isPublic`), served by
    `lib/reading/highlights.server.ts` (`listMyHighlights`, `searchHighlights`, `exportHighlights`, and the private
    `toMyRows` that adds the document's title and link) and shown in `components/reading/HighlightsNotebook.tsx`,
    `MyHighlightsPanel.tsx` and the inline popover in `components/reading/useHighlightKit.tsx`.
  - Flashcards: `lib/study/deck-editor.server.ts` (`addCard`, `importCardsDetailed`, `insertCards`, the deck lock
    `lockDeckCards`, `MAX_DECK_CARDS = 2000`), card kinds `basic | reversible | cloze | occlusion`
    (`lib/study/card-types.ts`, Anki cloze syntax `{{c1::answer}}`), limits in `lib/study/limits.ts`
    (`CARD_SIDE_MAX = 500`, `CLOZE_TEXT_MAX = 1000`, `MAX_DECKS_PER_MEMBER = 200`).
  - Nothing connects the two: no study module imports a reading module or the reverse (`grep -rn highlight lib/study`
    finds nothing).
- **Decisions:**
  - **Two card shapes.** "Question and passage" (basic: the member writes the front; the back is the passage, then "—
    Title" as plain text) and "Fill in the blank" (cloze: the member selects one to five words inside the passage in the
    dialog, each becomes `{{cN::…}}`). The highlight's note, when there is one, prefills the front of a basic card.
  - **Length.** A passage longer than the target side allows (500 basic back, 1,000 cloze) is refused in the dialog with
    the count shown; the member trims it in the dialog's text field (the trimmed text must still be a substring of the
    highlight, so the card never says something the source did not).
  - **Where.** "Make a card" on a highlight row in the notebook and My highlights, and in the inline highlight popover;
    "Make cards" on a multi-selection in the notebook (up to 50 highlights, each a basic card with an empty front the
    member fills in a step-through dialog, or skips).
  - **Deck.** A deck picker of the member's own decks plus "New deck…" (created through `createDeck`, cap checked).
  - **Link back.** A new table
    `HighlightCardLink (cardId unique → Flashcard, highlightId → ReadingHighlight, both cascade)` records the origin.
    The card row in the deck editor shows "From: <title>" linking to the document (11, in wave 5, adds passage links; it
    may point this link at the passage, nothing here depends on it); the highlight row shows "In <deck>" once a card
    exists, and "Make a card" stays available (a second card is allowed). No `User` relation, so no registry entry;
    deleting either side removes the link (the card stays when the highlight goes).
  - **Privacy.** A public deck's card shows "From: <title>" only to the deck's owner; copies of the deck never carry the
    link (the link names a private highlight). The card text itself is the member's choice, as any card's is.
  - **Export.** None: the card is in the deck export and the highlight in the highlights export; the link is derivable
    bookkeeping.

## Functional requirements

1. FR-1 `createCardsFromHighlights(userId, deckId, items[])` in a new `lib/study/highlight-cards.server.ts`: checks
   every highlight is the member's, the deck is theirs, the deck cap (generated cloze siblings count) under the deck
   lock, the substring rule, and writes cards and links in one transaction through `insertCards`.
2. FR-2 A registered endpoint `POST /api/study/highlight-cards` (contract + `implement()`, `rateLimit: 'write'`).
3. FR-3 The "Make a card" dialog (lazy-loaded; zod only inside it) with both shapes, the cloze word picker
   (keyboard-operable: arrow keys move between words, Space toggles), the deck picker and the length check.
4. FR-4 "Make cards" for a multi-selection in the notebook, a step-through of up to 50.
5. FR-5 "From: <title>" on the owner's card rows and "In <deck>" on highlight rows (read through React Query; the
   highlight list endpoint gains an additive `cardDecks` field computed in one query per page).

## Non-functional requirements

- **Security:** ownership of both sides is checked inside the transaction; the endpoint never accepts free text as a
  "highlight" (the passage is read from the row); `cardDecks` and "From:" are computed for the requesting owner only (a
  public deck's card payload to anyone else carries no link field); `rateLimit: 'write'` and the batch cap of 50.
- **Performance:** one query per highlight page for the links; the batch is capped at 50.
- **Accessibility:** the word picker is a list of toggle buttons with `aria-pressed`; the dialog is the Radix dialog;
  focus returns to the row's button on close.
- **Design:** rows on rules; one ink primary ("Add card") in the dialog; no new surface.

## Data model and API

- New model `HighlightCardLink` (`@@map("highlight_card_link")`, `cardId @unique`, `highlightId`, `createdAt`,
  `@@index([highlightId])`) in `prisma/schema/rmhstudy.prisma`, with back-relations on `Flashcard` and
  `ReadingHighlight`. Migration `20261130010100_s10_highlight_cards` (a new table, plain indexes).
- New `lib/study/highlight-cards.ts` (pure: substring check, cloze builder from word indices, length rules),
  `lib/study/highlight-cards-schema.ts`, `lib/study/highlight-cards.contract.ts`,
  `lib/study/api/study.highlight-cards.server.ts`, `components/reading/MakeCardDialog.tsx`.
- Edits: `components/reading/HighlightsNotebook.tsx`, `MyHighlightsPanel.tsx`, `useHighlightKit.tsx` (one menu item),
  `lib/reading/highlights.server.ts` (`cardDecks` on the page rows), `components/study/CardRow.tsx` ("From:"),
  `prisma/schema/library.prisma` (the `cardLinks` back-relation on `ReadingHighlight`; nobody else edits that file this
  sprint).

## Testing requirements

- Main suite `lib/study/__tests__/highlight-cards.test.ts` (mock Prisma): another member's highlight refused; another
  member's deck refused; the deck cap counts cloze siblings; a trimmed passage that is not a substring is refused; a
  batch writes N cards and N links in one transaction; the link is not copied by deck cloning
  (`lib/study/deck-sync.server.ts` unchanged, asserted).
- Product suite `lib/study/__tests__/highlight-cards.product.test.ts`: cloze building from word indices (punctuation
  kept, at most five deletions, overlapping selections merged), length rules per shape.
- `components/reading/__tests__/make-card-dialog.test.tsx` (`renderToStaticMarkup`): both shapes render, the length
  refusal shows the count.
- Gate tests: route table, raw-fetch and `useEffect` ratchets, zod-off-hot-routes (the notebook is not a hot route, the
  dialog is lazy), user-text direction (`USER_TEXT_RENDERERS`, the dialog renders the passage), migration safety.

## Acceptance criteria

- [ ] From the notebook, a highlight becomes a basic card in a chosen deck in three clicks; the card shows "From:
      <title>" in the deck editor, linking to the document.
- [ ] A cloze card made by picking two words reviews as two siblings.
- [ ] A passage over the limit cannot be saved until it is trimmed, and a trimmed text that is not in the passage is
      refused.
- [ ] A copy of a public deck holding such a card does not show where it came from.

## Out of scope

Automatic card generation, cards from other members' public highlights, keeping a card in sync when the highlight's note
changes, sound or pictures from a passage.
