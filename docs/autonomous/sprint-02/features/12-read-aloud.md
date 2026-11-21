# 12 — Listen to articles

Surface: Logs (`/blog/$slug`), News (`/news/$slug`) and the library's text view.
Wave 5. Namespace `read-aloud`.

## User story

As a reader who would rather listen — on a commute, with tired eyes, or because
reading long text is hard for me — I want a Listen button on articles that reads
the text aloud with my device's voice, highlights the paragraph being read, and
lets me pause, skip and change speed, so that I can take in a long Log without
staring at it.

## Requirements elicitation

- **What exists (verified):** `lib/audio/read-aloud.ts` (501 lines, plan A11) is
  a complete Web Speech API reader — paragraph callbacks, pause, resume, rate,
  voice choice, a null return where speech synthesis is missing — and **nothing
  imports it**; it also has no tests. Articles render through
  `components/reading/ArticleBody.tsx` with an always-visible
  `ReadingToolbar.tsx` (the reading-ruler switch) and a lazily mounted enhancer
  (`ArticleReading.tsx`). The library text view is
  `components/reading/ReaderTextView.tsx`.
- **Decisions:** use the OS voice only (no network, no cloud TTS, no cost, and
  the reader's tuned voice). Controls live in the toolbar; the controller is
  lazy-loaded on first press so the article route's chunk does not grow. The
  highlight follows the paragraph being spoken; the page scrolls it into view
  only when it leaves the viewport, without smooth scrolling (R5). No global
  keyboard shortcuts (they would collide with feature 11's map); the controls
  are ordinary buttons.

## Functional requirements

1. FR-1 A Listen button in `ReadingToolbar` when `speechSupported()`; hidden
   otherwise (and during SSR, so there is no layout shift: the button's slot is
   reserved at its final size).
2. FR-2 While playing: Pause/Resume, Stop, previous and next paragraph, and a
   speed menu (0.75×, 1×, 1.25×, 1.5×, 1.75×, 2×).
3. FR-3 A voice menu listing the voices whose language matches the page language
   (`lang` of the article, which follows the active locale), with "System
   default" first; the choice and speed persist per viewer in `localStorage`
   through `lib/core/persist.ts`.
4. FR-4 The text read is the article's paragraphs, headings and list items in
   order; code blocks are announced as "Code block skipped"; footnote markers
   are skipped and footnotes are not read inline; image alt text is read as
   "Image: <alt>".
5. FR-5 Clicking a paragraph while playing jumps there.
6. FR-6 The current paragraph carries `data-speaking` styled with
   `--site-bg-subtle` (no transition beyond the 90 ms fill rule).
7. FR-7 Media Session metadata (title, site name) so lock-screen and headset
   controls pause and resume.
8. FR-8 Playback stops on route change, on tab close and when the component
   unmounts.

## Non-functional requirements

- **Performance:** zero bytes added to the article route's initial chunk beyond
  the button (the controller is `lazy()`), checked by
  `scripts/check-bundle-budget.ts` at integration; no timer or listener at rest
  (B3, R5).
- **Accessibility:** buttons with names and `aria-pressed` for play state; the
  current paragraph is not announced by the screen reader (it would talk over
  the voice); a polite status line says "Reading paragraph 4 of 31".
- **Privacy:** nothing leaves the device.
- **i18n:** strings in `read-aloud`; Arabic pages pick Arabic voices and the
  controls mirror in RTL.
- **Steel:** toolbar controls are 36 px (44 px on touch), ghost buttons; the
  speed and voice menus are the overlay surface.

## Data model and API

None. New: `lib/reading/speech-text.ts` (pure: DOM or Markdown blocks → spoken
segments with their element index), `components/reading/ListenControls.tsx`
(lazy), the toolbar hook-in, and the same controls on `ReaderTextView`.

## Testing requirements

- Product suite `lib/audio/__tests__/read-aloud.product.test.ts`: with a fake
  `speechSynthesis`, paragraph callbacks fire in order, pause/resume/stop
  transitions, rate changes apply to the next utterance, `createReader` returns
  null without the API.
- Product suite `lib/reading/__tests__/speech-text.product.test.ts`: code blocks
  skipped with the announcement, footnote markers dropped, alt text read,
  headings and lists in document order.

## Acceptance criteria

- [ ] On a Log, Listen starts reading the first paragraph and highlights it.
- [ ] Next skips to the following paragraph; clicking a later paragraph jumps.
- [ ] 1.5× persists after reload.
- [ ] Navigating to another page stops speech.
- [ ] In a browser without speech synthesis there is no Listen button and no
      gap.
- [ ] Day and Night, 390 px and 1280 px, `ar` (Arabic voice when installed).

## Out of scope

Server-side or neural voices, downloading audio, reading posts in the feed.
