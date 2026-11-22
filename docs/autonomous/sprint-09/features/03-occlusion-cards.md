# 03 — Picture-occlusion flashcards

Surface: the card form and review in RMHStudy (`components/study/*`), the decks API (`/api/v1/me/decks/{id}/cards*`).
Wave 1. Namespace `occlusion-cards`.

## User story

As someone learning anatomy, a map or a diagram, I want to cover parts of one picture and be asked for each covered part
in turn, so that one labelled diagram becomes a set of cards without my cropping a dozen images.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 08 15 gave authored cards one picture per side (`Flashcard.frontImageUrl`/`frontImageAlt`,
    `backImageUrl`/`backImageAlt`, `prisma/schema/rmhstudy.prisma`), uploaded through the `flashcard` policy of the one
    ingest door (`lib/media/ingest.server.ts` `POLICIES`), claimed and reference-counted in
    `lib/study/card-images.server.ts` (a copy shares the object; the 500-picture cap per member).
  - Card kinds are `basic`, `reversible`, `cloze` (`lib/study/card-types.ts`, `CARD_KINDS`); an authored cloze row is
    never reviewed, its generated siblings are (`sourceId`, `clozeIndex`, one per deletion). The deck editor regenerates
    siblings under `lockKey(tx, 'deck-cards:<deckId>')` (`lib/study/deck-editor.server.ts`).
  - Sprint 08's README rejected image occlusion only because it "builds on 15's pictures; next sprint at the earliest".
  - Sprint 08 15's follow-ups: `applyUpdates` with `sharedPictures` does not re-read the source card under the URL lock
    (a narrow race); per-card URL locks were unsorted (deadlock risk); an animated WebP from the post surface passes the
    claim.
- **Decisions:**
  - **A fourth kind, `occlusion`.** An authored occlusion card has a front picture (required, with its description) and
    `occlusion = { mode: 'hide-all' | 'hide-one', masks: [{ id, x, y, w, h, label }] }`: 1 to 20 rectangles in
    picture-relative units (0–1, at least 0.02 wide and tall), each with a label (the answer, 1–200 characters) and a
    stable integer `id` (1, 2, 3 …, assigned as max + 1 when the mask is drawn and never reused, like cloze's `cN`; list
    order is display only). One generated sibling per mask, with `clozeIndex` holding **the mask's `id`** (the column's
    doc comment widens to "the deletion or mask a sibling hides"; no new column), so the existing sibling key (`keyOf`
    in `card-types.ts`) matches a sibling to its mask across reorders. The authored row is never reviewed, as for cloze.
  - **Text fields.** The authored card's `front` is an optional prompt (default "Name the covered part", shown above the
    picture) and `back` an optional note shown after reveal; a sibling copies both. The front picture's description is
    required (sprint 08 15's rule).
  - **Review.** The sibling shows the picture with its target mask filled in the ink colour and outlined, and — in
    `hide-all` mode — every other mask filled in the muted colour; reveal shows the target's label and lifts the target
    mask only. Flat fills on token colours (R1), no blur.
  - **Accessibility.** A screen reader hears the picture's description, then "Covered part N of M" and, on reveal, the
    label. The author writes each label, so the answer is text, never only a picture region.
  - **Editor.** In the card form, choosing "Picture occlusion" shows the picture with a draw surface: drag to add a
    rectangle, drag its handles to resize, a list of masks beside it (label field, move up, move down, delete). Every
    mask is editable from the list with the keyboard alone (arrow keys nudge the selected mask by 1 %, Shift+arrow
    resizes, Delete removes) — bindings live only while the draw surface has focus and use no key in `SITE_SHORTCUTS`'
    bare set (`c`, `/`, `?`, `g …`, the feed keys `j k o l r t s x`). Pointer and touch use pointer events; nothing
    animates.
  - **Storage.** `Flashcard.occlusion Json?` (only on the authored row). Copies (`deck copy`, deck updates, sprint
    06 08) carry it and share the picture as 15 does. `Flashcard.kind` is `VarChar(10)`; `occlusion` fits.
  - **Deck files.** The JSON export (`lib/study/export.ts`) writes `type: 'occlusion'` with the masks; the JSON import
    (`lib/study/import.ts`) accepts it under the same picture rule as other JSON rows (an address the site stored, with
    a description) and rejects bad masks with a new reject reason `invalid-occlusion`. CSV export skips occlusion cards
    and says how many it skipped; CSV import cannot create them.
  - **No device storage.** The editor keeps nothing in browser storage (no device-data registry line).
  - **API.** `POST/PATCH /api/v1/me/decks/{id}/cards` accept `kind: 'occlusion'` with `front_image_*` and `occlusion`;
    responses carry `occlusion` (null on other kinds, `NULLABLE`). Additive only.
  - **Hardening (sprint 08 15's follow-ups),** done here because occlusion is the next writer of card pictures: re-read
    the source card under the URL lock in `applyUpdates`; take every per-card URL lock in sorted order (confirm
    `card-images.server.ts:102` covers every caller); refuse an animated picture on the `flashcard` claim (the ingest
    metadata says so).
  - **Export.** `exportOcclusionCards(userId)` (deck, card id, mode, masks) under the `s09-03` anchor; the picture URL
    is already in sprint 08's `cardImages` section.

## Functional requirements

1. FR-1 `occlusion` in `CARD_KINDS`, its zod schema and sibling generation in `card-types.ts`; the column and migration.
2. FR-2 The card form's occlusion editor (draw, list, keyboard).
3. FR-3 Review rendering for an occlusion sibling (review, review-all, the practice test's question types where a card
   kind is shown).
4. FR-4 The API fields and docs; SDK regenerated.
5. FR-5 The three hardening fixes.
6. FR-6 The export section.

## Non-functional requirements

- **Correctness:** sibling regeneration runs under the existing deck lock; a mask edit that changes only a label or
  moves a mask in the list keeps the sibling's review history (siblings are matched by mask `id` through `clozeIndex`,
  never by position); removing a mask removes its sibling and its reviews; the 20-mask cap and the deck's card cap hold
  together (siblings count as cards, as cloze siblings do).
- **Performance:** masks render as absolutely positioned elements over the `<img>` (no canvas on the site tier, B3).
- **Design:** Steel site tier: the draw surface is a picture (1px border, 8px radius, `--site-bg-subtle` placeholder);
  mask fills are `--site-text` and `--site-text-muted`; one ink primary ("Save card").

## Data model and API

- `Flashcard.occlusion Json?`; migration `20261129010200_s09_occlusion_cards` (one nullable column).
- New `lib/study/occlusion.ts` (pure: schema, normalise, sibling diff), `components/study/OcclusionEditor.tsx`,
  `components/study/OcclusionReview.tsx`.
- Edits: `lib/study/card-types.ts`, `lib/study/deck-editor.server.ts`, `lib/study/export.ts`, `lib/study/import.ts`,
  `lib/study/card-images.server.ts`, `components/study/CardForm.tsx`, the review components,
  `lib/api/v1/study-schema.ts`, `lib/api/v1/study.server.ts`, `lib/api/registry.ts` (flashcard fields, in place),
  `scripts/generate-sdk.ts` (anchor), `docs/developer-api/changelog.md` (anchor),
  `lib/account/export-sprint-09.server.ts` (anchor).

## Testing requirements

- Product suite `lib/study/__tests__/occlusion.product.test.ts`: schema bounds, normalisation, id assignment (max + 1,
  never reused), sibling diff by mask id (label edit keeps, reorder keeps, delete drops, add creates); JSON export and
  import round-trip; CSV export skips with a count.
- Main suite `lib/study/__tests__/occlusion-cards.test.ts` (mock Prisma): creating an occlusion card makes N siblings
  under the deck lock; the cap counts them; a copy carries masks and shares the picture.
- Main suite `lib/study/__tests__/card-images-hardening.test.ts`: the re-read under lock, sorted lock order, animated
  picture refused.
- Main suite `lib/api/v1/__tests__/occlusion-api.test.ts`: create, read, patch through the API; validation errors.
- Existing study and card-image tests stay green.

## Acceptance criteria

- [ ] A member uploads a diagram, draws six rectangles with labels and saves: six cards are due.
- [ ] Reviewing one shows the other five covered (hide-all), reveals only its own label, and a screen reader announces
      "Covered part 2 of 6".
- [ ] Renaming one label, or moving its mask up the list, keeps that card's review history.
- [ ] A script creates the same card through the API.

## Out of scope

Freehand or polygon masks, masks on the back picture, automatic label detection, grouping several masks into one card.
