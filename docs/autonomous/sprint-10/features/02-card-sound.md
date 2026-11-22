# 02 — Sound on flashcards

Surface: the card form, review (`/study/review`, the deck page), practice tests, decks and the developer API (read).
Wave 2. Namespace `card-sound`. Site tier (Steel).

## User story

As a language learner, I want to record or upload a short sound on either side of a card — a word said aloud, a phrase,
a bird call — and hear it when I review, with a written transcript beside it, so that I can practise listening and
pronunciation, not only reading.

## Requirements elicitation

- **What exists (verified):**
  - Card pictures (sprint 08 15): `frontImageUrl` / `frontImageAlt` / `backImageUrl` / `backImageAlt` on `Flashcard`
    (`prisma/schema/rmhstudy.prisma`), uploaded by `uploadCardImage`, claimed and reference-counted by
    `attachCardImages` / `releaseCardImage` / `lockPictureUrls` (`lib/study/card-images.server.ts`), carried to copies
    by `lib/study/deck-sync.server.ts` (which re-reads cards under sorted URL locks), shown by
    `components/study/CardPicture.tsx` and `CardImageField.tsx`, exposed in the API as `frontImage` / `backImage`.
  - A short-audio pipeline (sprint 08 19, the name pronunciation): `lib/profile/api/profile.pronunciation.server.ts`
    (multipart `audio`, `durationMs`, size pre-checks), `lib/profile/audio-sniff.ts` (`sniffAudioContainer`: the stored
    type comes from the bytes, never the declared type), `savePronunciation` in `lib/profile/plus.server.ts`.
  - The media sweep classifies every upload prefix (`lib/media/sweep-surfaces.ts`, sprint 09 12).
  - No sound on cards: no audio field in `rmhstudy.prisma`.
- **Decisions:**
  - **One sound per side**, at most 15 seconds and 512 KB, recorded in the form (`MediaRecorder`) or uploaded (WebM,
    Ogg, MP4/M4A, AAC — the four containers `sniffAudioContainer` knows); the stored type and extension come from the
    sniff. Cloze and occlusion cards take a sound on the back only (the front is generated per sibling).
  - **A transcript is required** (up to 500 characters): what is said, or what the sound is. Review shows it under the
    play button after the side is revealed (so a listening card stays a listening card) and always to assistive
    technology through the button's description; it is the sound's text alternative.
  - **Playing.** A play button only; nothing autoplays (R5: nothing moves or sounds at rest). In review, `p` plays the
    current side's sound while the review has focus (checked against `SITE_SHORTCUTS`; `p` is free).
  - **A sound is heard by its recorder only (validation pass 2).** Storing and moderating member audio that other
    members hear is an open owner decision ("uploading Studio samples": "audio storage and moderation of user audio is a
    cost and safety decision", sprints 05 and 07), and public decks have no report path today (`ContentReport` has no
    deck entity). So this sprint keeps every sound private: copying a public deck and deck sync **never carry a sound**
    (the copy's card has none; the author's sound change is not a deck update), a public deck's page shows no play
    button to anyone but its owner, and the API returns sounds only on the key owner's own decks. Each stored object
    belongs to exactly one card side — no sharing, so no reference counting: replacing or removing a sound, or deleting
    the card or the deck, deletes the object after the transaction (the `deleteCardImageObjects` pattern). Sharing
    sounds with copies is a follow-up for the owner's audio decision, recorded in `summary.md`.
  - **Upload policy (validation pass 2).** Audio does not go through `ingest` (`lib/media/ingest.server.ts` is images
    only, sharp), so the upload follows the pronunciation route: bytes sniffed by `sniffAudioContainer` (anything else
    415), at most 512 KB (checked from `Content-Length` before the body is read, then on the bytes; 413), a declared
    `durationMs` of 1–15,000 (400; the byte cap is the real bound, and the player stops at 15 s, so a client that lies
    about the duration gains nothing), stored with `putObject` at `card-sound/<userId>-<cuid>.<ext>` with the sniffed
    type, and a `Media` row written `PENDING` (`userId`, `key`, `url`, `contentType`, `bytes`) so saving a card claims
    it by compare-and-set exactly as `attachCardImages` claims a picture (the member's own `PENDING` upload of an audio
    type, `bytes ≤ 512 KB`; anything else is "Upload the sound again").
  - **Caps.** At most **200 cards** may carry a sound the member recorded (`MAX_CARD_SOUNDS` in
    `lib/study/card-sound.ts`, counted under `lockKey(tx, 'card-sounds:<userId>')` like `MAX_CARD_IMAGES`), so a
    member's audio is bounded at 200 × 2 × 512 KB; uploads also count against the same daily allowance as card pictures
    (`checkDailyUploadQuota`, the `media-quota:<userId>` key), so who may upload is exactly who may upload a card
    picture today and no tier decision is made; and the upload route is rate-limited like the pronunciation upload. An
    upload never claimed is removed by the media sweep's `orphan-pending` rule.
  - **Erasure:** the cards stay (decks are an open owner decision, `FlashcardDeck: owner`), but a voice recording is
    personal data heard by nobody else, as the pronunciation clip is (erased at deletion): `anonymizeAccount` nulls the
    six sound columns on the member's cards under the `s10-02` anchor and deletes the objects after the transaction.
  - **API:** read-only, additive: `frontSound` / `backSound` (`{ url, transcript, durationMs }` or `null`) on card
    payloads of the key owner's own decks (always `null` on a public deck read by anyone else). Writing sounds through
    the API is out of scope (it needs a new upload surface).
  - **Export:** a `cardSounds` section (card id, side, URL, transcript, duration) under the export anchor.

## Functional requirements

1. FR-1 Six nullable columns on `Flashcard` (`frontSoundUrl`, `frontSoundText`, `frontSoundMs`, `backSoundUrl`,
   `backSoundText`, `backSoundMs`) and two indexes (the media sweep's reference check and the claim's reuse check look
   cards up by sound URL).
2. FR-2 `lib/study/card-sound.server.ts`: upload (the policy above), claim under the per-member lock with the cap, and
   delete-after-commit of replaced or removed objects. No URL locks are needed (an object has one card side).
3. FR-3 The registered upload endpoint `POST /api/study/card-sound` (`implement()`, multipart, `Content-Length`
   pre-check, the daily allowance, rate-limited like the pronunciation upload).
4. FR-4 The card form: record (with a visible elapsed counter that updates only while recording), upload, play, remove,
   and the transcript field; the owner's review, practice test and deck card list play it.
5. FR-5 Copy and sync leave sounds behind: `lib/study/deck-sync.server.ts` and the copy path never read or write the
   sound columns (asserted); a public deck's card list sends no sound fields to anyone but the owner.
6. FR-6 API fields, `NULLABLE` entries, SDK and docs regenerated; the media sweep: a `card-sound` surface in
   `lib/media/sweep-surfaces.ts` classified `excluded` exactly as `flashcard` is, kept by `referencedUrls` in
   `lib/media/sweep.server.ts`, which gains the two sound columns (so an attached sound is never swept, and an unclaimed
   upload goes by `orphan-pending`).
7. FR-7 The export section and the erasure operation (`s10-02` anchor in `deletion.server.ts`).

## Non-functional requirements

- **Security:** the bytes decide the type; served with `Content-Type` from the sniff and
  `X-Content-Type-Options: nosniff`; no SVG or HTML can be stored; a sound's URL (a cuid key) never appears in a payload
  another member receives.
- **Accessibility:** the transcript is the text alternative; the play button names the side ("Play the front's sound");
  recording states are announced in a polite live region.
- **Performance:** no audio element is created until play is pressed; review preloads nothing.
- **Design:** controls are the standard 36 px buttons; the recording counter is `t-meta` text, not an animation.

## Data model and API

- `prisma/schema/rmhstudy.prisma` (`Flashcard`): the six columns, plus `@@index([frontSoundUrl])` and
  `@@index([backSoundUrl])` with Prisma's default names. Migrations: `20261130020100_s10_card_sound` (the columns),
  `20261130020101_s10_card_sound_front_index` (one `CREATE INDEX CONCURRENTLY "flashcard_frontSoundUrl_idx"`),
  `20261130020102_s10_card_sound_front_index_ensure_valid`, `20261130020103_s10_card_sound_back_index`,
  `20261130020104_s10_card_sound_back_index_ensure_valid`.
- New `lib/study/card-sound.ts` (pure limits), `card-sound-schema.ts`, `card-sound.contract.ts`, `card-sound.server.ts`,
  `lib/study/api/study.card-sound.server.ts`, `components/study/CardSoundField.tsx`, `components/study/CardSound.tsx`.
- Edits: `lib/study/deck-editor.server.ts` (write path), `lib/study/deck-sync.server.ts` (only to keep sound columns out
  of what it copies, if its select would carry them), `lib/study/queue.ts` (`QueueCard` gains `frontSound?` /
  `backSound?`), `lib/study/queue.server.ts` (select),
  `components/study/{CardForm,ReviewAll,PracticeTest,DeckCardList}.tsx`, `lib/media/sweep-surfaces.ts`,
  `lib/media/sweep.server.ts` (`referencedUrls`), `lib/api/registry.ts` (flashcard card schema, in place), the v1 card
  serialiser (`lib/api/v1/study.server.ts`, `lib/api/v1/study-schema.ts`), `scripts/generate-sdk.ts` (anchor),
  `docs/developer-api/changelog.md` (anchor), `lib/account/deletion.server.ts` and
  `lib/account/export-sprint-10.server.ts` (anchors).

## Testing requirements

- Main suite `lib/study/__tests__/card-sound.test.ts`: a renamed HTML file is refused; over 15 s or 512 KB refused; a
  cloze front sound refused; another member's or a non-audio `PENDING` upload cannot be claimed; the 201st sounded card
  refused under the lock; replacing a sound deletes the old object after commit; the daily allowance applies.
- Main suite `lib/study/__tests__/card-sound-sync.test.ts`: copying a deck and applying an update carry no sound; a
  public deck's cards read by another member carry no sound fields.
- Main suite `lib/account/__tests__/card-sound-erasure.test.ts`: the columns are nulled and the objects deleted.
- Product suite `lib/study/__tests__/card-sound.product.test.ts`: limit rules, transcript required.
- `components/study/__tests__/card-sound.test.tsx` (`renderToStaticMarkup`): the button's accessible name and
  description, transcript hidden before reveal in review markup.
- Migration safety (the `CONCURRENTLY` pairs), media sweep surface coverage, shortcut registry, SDK generation (no
  `unknown`), route table, `USER_TEXT_RENDERERS` (the transcript is member text).

## Acceptance criteria

- [ ] A member records "hola" on a card's back, writes the transcript, and hears it in review after revealing.
- [ ] A copy of the deck has no sound, and the public deck's page offers no play button to anyone but its owner.
- [ ] An uploaded file that is not audio is refused.
- [ ] `GET /api/v1/me/decks/{id}/cards` returns `backSound` with the transcript.

## Out of scope

Text-to-speech, speech recognition or grading pronunciation, sound in the API's write paths, more than one sound per
side, sound on generated cloze or occlusion fronts, sharing sounds with copies or other members (the owner's audio
decision).
