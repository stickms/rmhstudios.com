# 15 — Pictures on flashcards

Surface: the card form (`components/study/CardForm.tsx`), review and practice
tests, deck copies and updates, the developer API's flashcards. Wave 1.
Namespace `card-images`.

## User story

As a student learning anatomy, map regions or paintings, I want to put a
picture on the front or the back of a card, with a description for anyone
who cannot see it, so that my deck can ask "What is this structure?" instead
of describing it in words.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 05 rejected image flashcards because decks had no upload pipeline
    or storage quota (its README). The pipeline exists now (below); the
    storage bound is this feature's cap plus shared objects for copies
    (below), since `POLICIES[…].quota` is a daily upload allowance only.
  - `Flashcard` (`prisma/schema/rmhstudy.prisma`) is text only: `front`,
    `back`, `kind` (basic, reversible, cloze; `lib/study/card-types.ts`:
    "Card text is plain text"), siblings, `originCardId` / `originHash` for
    copied cards (sprint 06 08 deck updates), `externalId` for the API
    (sprint 06 13).
  - Media go through one door: `ingest(file, surface, { userId, record })`
    (`lib/media/ingest.server.ts`, `POLICIES`: avatar, post, album, library,
    build, chat) which strips metadata and records a `Media` row the sweep
    reclaims if nothing attaches it; sprint 07 17's build screenshots
    (`lib/builds/screenshots.server.ts`) are the worked example (upload,
    attach on save, delete on removal, export).
  - Cards render in review (`components/feed/DeckStudyColumn.tsx`, sprint 07
    08's `components/study/ReviewAll.tsx`), practice tests
    (`components/study/PracticeTest.tsx`, `questions/`), the deck list
    (`DeckCardList.tsx`, `CardRow.tsx`), the marketplace
    (`components/feed/DeckMarketplaceColumn.tsx`), import/export
    (`lib/study/import.ts`, `export.ts`) and the developer API
    (`lib/api/v1/study.server.ts`, `study-schema.ts`).
- **Decisions:**
  - **One picture per side**, optional, on authored cards:
    `frontImageUrl`, `frontImageAlt`, `backImageUrl`, `backImageAlt`.
    **A description is required** (1–1 000 characters) for every picture —
    the card cannot be saved without it — since a review session is useless
    to a screen reader user otherwise. Cloze cards may have a picture on the
    back only (the front is the cloze text).
  - Siblings (the reverse side of a reversible card, cloze siblings) carry
    the authored card's pictures by reading the source, never by copying the
    URL into each sibling.
  - **Upload:** a new `flashcard` ingest policy (`STILL_IMAGE`: JPEG, PNG,
    WebP — no GIF, as the build and library policies; 5 MB; variants `[400,
    1200]`; `strip: 'all'`; `quota: true`, which counts each upload against
    the member's **daily upload allowance** in `quota.server` — the policy
    field is a daily allowance, not a storage quota), uploaded from the card
    form before save; save attaches. The **storage** bound is the per-member
    cap: at most **500** cards carrying a picture the member uploaded
    (check-then-insert under `lockKey(tx, 'card-images:<userId>')`).
  - **Copies and updates share the object, never duplicate it.** A copied
    card keeps the same picture URL; an object is deleted only when no
    `Flashcard` row references its URL any more (`releaseCardImage` counts
    references on `frontImageUrl` / `backImageUrl` inside the removing
    transaction). So the author removing a picture, or deleting the deck,
    never breaks a copy, and a deck copied a thousand times stores its
    pictures once (copying 500 objects per copy would let one popular deck
    exhaust storage). Copied pictures do not count toward the copier's cap
    (they did not upload them). `originHash` includes the picture URLs and
    descriptions, so changing a picture is an update the copier is offered.
    Decision by default (sprint 05's rejection named storage, and per-copy
    duplication is where storage would go).
  - **Public decks** show pictures in the marketplace preview; images in
    public decks go through the same report path as other deck content
    (reporting a deck already exists; no new moderation surface).
  - **Import/export:** the deck export (`export.ts`) includes the picture
    URLs and descriptions; import accepts them only as URLs already ingested
    for the member (no remote fetch).
  - **API:** additive fields `frontImage`, `backImage` (`{ url, alt } |
    null`) on the flashcard schema in place; API writes set a picture with
    `{ media_id, alt }`, where `media_id` is one the key owner uploaded through
    `POST /api/v1/images` (existing), which gains an optional
    `surface: 'flashcard'`.
  - **Review layout:** picture above the text on its side, 8 px radius, 1 px
    border on `--site-bg-subtle` (S4/S5), `max-height: 45vh`, `object-fit:
    contain`; `alt` from the description; tap to open the full size in the
    existing image viewer.

## Functional requirements

1. FR-1 The four columns and the card form's picture fields with required
   descriptions, upload, replace and remove.
2. FR-2 The `flashcard` ingest policy and the per-member cap.
3. FR-3 Pictures in review, review-all, practice tests, the deck card list and
   the marketplace preview.
4. FR-4 Copies, deck updates, import/export and the API fields.
5. FR-5 Export of the member's card pictures list (URLs and descriptions)
   through the sprint 08 export file.

## Non-functional requirements

- **Correctness:** no orphaned objects (attach on save; on removal, card or
  deck deletion, delete the object when it has no remaining reference; the
  media sweep handles abandoned uploads).
- **Performance:** pictures are lazy-loaded below the fold; the review
  preloads the next card's picture only.
- **Security:** only ingested media of the member can be referenced; zod
  checks URLs against the media host; the cap under lock.
- **Privacy and deletion:** pictures follow their cards, and decks of a
  deleted member stay (`FlashcardDeck` is an open owner decision in the
  erasure registry), so this feature adds no erasure operation and changes no
  registry entry.
- **Accessibility:** `alt` everywhere a card picture renders, including the
  marketplace preview; the description field explains why it is required.
- **Steel:** pictures are the one bordered box allowed (S4); one ink primary
  in the form (Save).
- **i18n:** `card-images`.

## Data model and API

- `Flashcard.frontImageUrl String? @db.VarChar(500)`, `frontImageAlt
  String? @db.VarChar(1000)`, `backImageUrl`, `backImageAlt`. Migration
  `20261128010200_s08_card_images`.
- `lib/study/card-images.ts` (pure: `MAX_CARD_IMAGES = 500`,
  `cardImageProblem`, the hash input), `card-images-schema.ts`,
  `card-images.contract.ts`, `card-images.server.ts` (`uploadCardImage`,
  `attachCardImages`, `releaseCardImage` (reference-counted),
  `exportCardImages`); module `lib/study/api/study.card-images.server.ts`
  (POST upload).
- Edits: `lib/media/ingest.server.ts` (`POLICIES.flashcard`),
  `lib/study/deck-editor.server.ts`, `deck-sync.server.ts`, `import.ts`,
  `export.ts`, `CardForm.tsx`, `CardRow.tsx`, the review and test components,
  `DeckMarketplaceColumn.tsx`, `lib/api/v1/study*.ts`, `lib/api/registry.ts`
  (flashcard schema fields, in place), `scripts/generate-sdk.ts` (`NULLABLE`
  under the anchor).

## Testing requirements

- Main suite `lib/study/__tests__/card-images.test.ts`: description required;
  cloze front refused; cap under lock; attach and release; a copy shares the
  object, the author's removal keeps it while a copy references it, and the
  last reference deletes it; hash changes with a picture; API refuses foreign media.
- Product suite `lib/study/__tests__/card-images.product.test.ts`.
- Existing: `lib/__tests__/media-ingest.test.ts` (the new policy),
  `lib/study/__tests__/deck-updates*.test.ts`, the flashcards API tests,
  `study-queue.test.ts`.

## Acceptance criteria

- [ ] A card with a picture on the front and a description shows the picture
      in review; a screen reader reads the description.
- [ ] A card with a picture and no description cannot be saved.
- [ ] Copying a public deck keeps its pictures after the author removes them,
      without storing a second copy of any picture.
- [ ] The API returns `frontImage` and the SDK types it.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Image occlusion, audio on cards, pictures inside cloze text, drawing on
pictures.
