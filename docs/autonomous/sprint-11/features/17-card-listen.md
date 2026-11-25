# 17 — Listen to your flashcards

Surface: the review session (`/study/review`, a deck's review on `/study/$deckId`): a "Listen" mode; the deck settings
("Front language", "Back language"). Wave 6. Namespace `card-listen`. Site tier (Steel).

## User story

As a language learner who reviews on the bus, or as someone with low vision, I want my flashcards read aloud in the
right language, the front, a pause, then the back, so that I can review with my eyes off the screen and grade each card
with one key or one tap.

## Requirements elicitation

- **What exists (verified):**
  - Read-aloud for articles: `lib/audio/read-aloud.ts` (`createReader`, `speechSupported`, sentence-sized chunks, voice
    picking by language, reading the document's language at speak time), with per-viewer rate and voice in
    `lib/reading/listen-prefs.ts` through `lib/core/persist` (sprint 02 12).
  - Review: `components/study/ReviewAll.tsx` and the deck column (`components/feed/DeckStudyColumn.tsx`) show a front,
    reveal the back and take a grade; keys come through `components/study/useReviewKeys.ts`.
  - Cards may carry the owner's own recorded sound (sprint 10 02, `CardSound.tsx`, heard by the recorder only); decks
    have no language.
- **Decisions:**
  - **Deck languages:** the deck's owner sets "Front language" and "Back language" (a list of common BCP 47 tags plus
    "Same as the site"), stored on the deck (`frontLang`, `backLang`), copied with a clone (they describe the cards) and
    not changed by sync. Editors (10) do not change them (deck settings are the owner's).
  - **Listen mode** in a review session: a switch "Listen" beside the session controls. With it on, each card's front is
    spoken in the front language; after the reveal delay (3, 5 or 8 seconds, or "Wait for me") the back is revealed and
    spoken in the back language; the member grades with the usual buttons or keys `1`–`4`. `Space` and `Enter` reveal
    now, as they already do (`ReviewAll.tsx`); `a` ("again") replays the side showing, guarded like the review's
    existing `p` (ignored straight after `g`, never in a field).
  - **Card kinds:** a cloze card is spoken with "blank" for the deletion on the front and the full sentence on the back;
    a reversible card speaks whichever side is asked; occlusion and picture-only sides are not spoken ("This card has a
    picture; look to answer" is shown and the session waits). A side with the owner's own sound plays the sound instead
    of speech (the owner only, as today).
  - **Speech voice and rate:** the rate menu and voice choice of article Listen are reused (`listen-prefs.ts`), with the
    voice picked by the side's language when none is chosen; `createReader` gains an optional `lang` so a card can be
    spoken in a language other than the page's.
  - **Unsupported browsers:** when `speechSupported()` is false, the switch is disabled with "Your browser cannot read
    aloud".
  - **Nothing is sent anywhere:** speech is the browser's own; the switch and delay are remembered on the device
    (`rmh:study:listen`, a preference in the device-data registry).
  - **Grading never happens by itself:** listening never grades a card (an automatic "Good" would corrupt the schedule).

## Functional requirements

1. FR-1 Columns `FlashcardDeck.frontLang`, `FlashcardDeck.backLang` (`VarChar(16)`, nullable); `cloneDeck` copies them;
   the deck update contract accepts them from the owner only.
2. FR-2 `lib/study/listen.ts` (pure): the text to speak for each card kind and side (cloze with "blank" passed in as a
   translated word), the language for a side, the delay values.
3. FR-3 `lib/study/listen-prefs.ts` (persisted: on, delay).
4. FR-4 `components/study/ListenControls.tsx` and a `useCardListen` hook driving `createReader` per side, the card sound
   player for a side with a sound, and the reveal timer; wired into `ReviewAll.tsx` and `DeckStudyColumn.tsx`.
5. FR-5 `lib/audio/read-aloud.ts`: optional `lang` in `ReaderOptions` (unchanged behaviour without it).
6. FR-6 Deck settings: the two language selects in the deck editor's settings.

## Non-functional requirements

- **Accessibility:** every new control is labelled; the spoken side is also on screen; the one new key, `a`, is not in
  `SITE_SHORTCUTS` (bare `c`, `/`, `?`, the `g …` sequences, `mod+k`, the feed keys) and is handled in the review's
  existing key handler only while the session is mounted, as `p` is.
- **Motion:** no animation; the reveal timer is a `setTimeout`, not a frame loop.
- **Compatibility:** without Listen on, a review is exactly as today.

## Data model and API

- `FlashcardDeck.frontLang String? @db.VarChar(16)` and `backLang String? @db.VarChar(16)` in
  `prisma/schema/rmhstudy.prisma`. Migration `20261201060200_s11_card_listen`.
- The account export already includes every deck column (`include` with no `select`), so the languages are exported
  without a new section; the developer API's deck schema is unchanged this sprint.

## Testing requirements

- Product suite `lib/study/__tests__/listen.product.test.ts`: the spoken text for basic, reversible, cloze (blank on the
  front, full on the back) and picture-only sides; language choice per side with and without deck languages.
- Main suite `lib/study/__tests__/deck-languages.test.ts`: only the owner sets them; a clone copies them; sync leaves a
  copy's languages alone; an invalid tag is refused.
- Product suite `lib/audio/__tests__/read-aloud.product.test.ts` (extended): `lang` picks the voice; absent, the
  document's language as before.
- Device registry, shortcut registry, rAF allowlist, card-sound registry (no new sound reader).

## Acceptance criteria

- [ ] A deck with Spanish fronts and English backs is reviewed with Listen on: the front is read in a Spanish voice, the
      back in English after five seconds, and `3` grades the card Good.
- [ ] A cloze card is read with "blank" in place of the answer.
- [ ] With Listen off, nothing is spoken and nothing changes.

## Out of scope

Grading by voice, speech recognition, generated audio stored on the server, listening in practice tests.
