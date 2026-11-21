# 09 — Reversible and cloze flashcards

Surface: the deck editor (`components/study/DeckEditor.tsx`, `CardRow.tsx`,
`/study/$deckId/edit`), review (`/study/$deckId/practice`,
`lib/study/api/study.decks.$id.review.server.ts`), import/export
(`lib/study/import.ts`, `export.ts`), clone (`study.decks.$id.clone.server.ts`).
Wave 2. Namespace `flashcard-types`.

## User story

As a learner, I want a card that I also study backwards (word → meaning and
meaning → word) and a cloze card where I hide parts of a sentence ("The capital
of {{c1::France}} is {{c2::Paris}}") — so that I do not have to type every card
twice and can learn facts in context.

## Requirements elicitation

- **What exists (verified):** `Flashcard` (`prisma/schema/rmhstudy.prisma`) is
  front/back text with a position; per-member SM-2 state is `FlashcardReview`
  keyed `@@unique([userId, cardId])`, history in `FlashcardReviewLog`. Every
  card is reviewed one way. Sprint 02 added the editor, import (CSV/TSV/Anki
  text export), export, practice tests and stats. Nothing knows cloze syntax
  (`grep -ri cloze` finds nothing) or reverse cards.
- **Decisions:** the note/card model, without touching the review tables: an
  **authored** card has a `kind` (`basic`, `reversible`, `cloze`); the server
  **generates** sibling rows from it (`sourceId` = the authored card): a
  reversible card gets one sibling with the sides swapped; a cloze card gets one
  sibling per distinct deletion index (`clozeIndex`, at most 20). Each sibling
  is an ordinary `Flashcard` with its own SM-2 state, so the review, stats and
  tests code keeps working. Editing an authored card regenerates its siblings in
  place (same ids for indices that still exist, so their schedules survive;
  removed indices are deleted with their reviews). The editor shows authored
  cards only. A cloze authored row is never reviewed itself; a reversible
  authored row is (front → back).
- Cloze syntax is Anki's: `{{c1::answer}}` or `{{c1::answer::hint}}`; several
  deletions may share an index (hidden together).

## Functional requirements

1. FR-1 The card editor gains a type control (`components/ui/tabs.tsx` as a
   segmented control or `select.tsx`): Basic, Reversible, Cloze. Cloze shows one
   text field with an "Add deletion" button that wraps the selection in the next
   `{{cN::…}}`, and a live preview of each generated card.
2. FR-2 Saving validates: a cloze card needs at least one deletion and at most
   20 indices; a reversible card needs both sides. Errors are inline.
3. FR-3 Review shows a cloze sibling's front as the text with its deletions
   replaced by "[…]" (or "[hint]"), other deletions shown as plain text; the
   back shows the full text with the answer in weight 600. Reversible siblings
   show "Reverse" in `t-meta` above the card.
4. FR-4 The deck page and editor count authored cards ("120 cards") and show
   reviewable cards separately in `t-meta` ("164 to review"). `MAX_DECK_CARDS`
   (2 000) counts every row, generated included; the editor says how many
   remain.
5. FR-5 Import: a row whose front contains `{{c1::` becomes a cloze card; a
   third column `reverse`/`reversible` (case-insensitive) makes a reversible
   card. Export writes authored cards with a `type` column, and cloze text
   unchanged, so a round trip is lossless.
6. FR-6 Cloning a public deck copies authored cards and regenerates siblings for
   the clone.
7. FR-7 Practice tests (`lib/study/practice-test.ts`) draw from reviewable
   cards; a cloze question's prompt uses the same masking as review.

## Non-functional requirements

- **Correctness:** generation is a pure function (`lib/study/card-types.ts`:
  `parseCloze`, `siblingsFor(card)`), and regeneration runs inside the
  transaction that saves the authored card, after
  `lockKey(tx, 'deck-cards:' + deckId)` so the deck cap holds under concurrent
  saves and imports.
- **Security:** card text stays plain text (no HTML); masking happens at render;
  inputs zod-validated (`CARD_SIDE_MAX` per side; cloze text ≤ 1 000 characters,
  a new `CLOZE_TEXT_MAX` in `lib/study/limits.ts`). Only the deck owner edits.
- **Performance:** regeneration touches only one authored card's siblings;
  import generates in memory and uses `createMany`.
- **i18n:** `flashcard-types`; the "[…]" mask is a translated string.
- **Steel:** the type control is the shared tabs primitive; preview rows on
  rules; the answer is weight 600, never coloured.
- **Accessibility:** the masked deletion is read as "blank" (`aria-label` on the
  mask span); the preview is a labelled list.

## Data model and API

- `Flashcard` gains `kind String @default("basic") @db.VarChar(10)`,
  `sourceId String?` (self-relation `onDelete: Cascade`, so deleting an authored
  card removes its siblings), `clozeIndex Int?`, and `@@index([sourceId])`.
  Migration `20261125020100_s05_flashcard_card_types`. `flashcard` is not a hot
  table, but the index is created `CONCURRENTLY` in its own migration with an
  `_ensure_valid` repair (copy
  `prisma/migrations/20261124040100_s04_build_view_index` and
  `…040103…_ensure_valid`) — `20261125020101_s05_flashcard_source_index` and
  `20261125020102_s05_flashcard_source_index_ensure_valid`.
- Card bodies (`lib/study/decks-schema.ts`) accept `kind`; responses add `kind`,
  `clozeIndex`, `sourceId` (additive).
- Review/test queries exclude authored cloze rows
  (`NOT: { kind: 'cloze', sourceId: null }`); editor queries select
  `sourceId: null` only.

## Testing requirements

- Product suite `lib/study/__tests__/card-types.product.test.ts`: cloze parsing
  (hints, shared indices, nesting refused, malformed braces), masking, sibling
  generation, stable regeneration (indices kept, removed, added).
- Main suite `lib/study/__tests__/card-types.test.ts`: saving a cloze card
  creates N siblings; editing keeps the ids of surviving indices; deleting the
  authored card cascades; the deck cap counts siblings under the lock; import
  and clone generate siblings; non-owners refused.

## Acceptance criteria

- [ ] A cloze card with c1 and c2 produces two reviewable cards with independent
      schedules.
- [ ] A reversible card is reviewed both ways.
- [ ] Editing a cloze card to drop c2 removes only that card; c1 keeps its
      schedule.
- [ ] Export then import of a mixed deck reproduces it.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Image occlusion, typed-answer cards, card templates beyond these three.
