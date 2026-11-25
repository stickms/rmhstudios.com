# 11 — The typing course on your keyboard layout

Surface: RMHType's lessons (`/rmhtype/lessons`, `/rmhtype/lessons/$lessonId`), the on-screen lesson keyboard, the key
statistics and heatmap on `/rmhtype/progress`, a layout picker. Wave 3. Namespace `type-layouts`. App tier (L8).

## User story

As someone who types on Dvorak, Colemak or a French AZERTY keyboard, I want RMHType's touch-typing course to teach my
layout's home row and show my keyboard, so that the lessons train the fingers I actually use instead of drilling keys
that are somewhere else on my keyboard.

## Requirements elicitation

- **What exists (verified):**
  - The course (`lib/rmhtype/lessons.ts`, sprint 02 07) is QWERTY by construction: `COURSE_SPEC` introduces `fj`, `dk`,
    `sl`, `a;`, `gh` (unit 1), then the top row (2), the bottom row (3), capitals (4), digits (5) and punctuation (6);
    `BASE_FINGER` assigns fingers to QWERTY characters; `KEYBOARD_LAYOUT` is QWERTY and drives
    `components/rmhtype/lessons/LessonKeyboard.tsx`. Lesson ids are `l01`… and stored in `RmhTypeLessonProgress`
    (`lessonId` up to 32 characters).
  - Key statistics already know four layouts: `TYPING_LAYOUTS = ['qwerty', 'azerty', 'dvorak', 'colemak']` and
    `KEYBOARD_ROWS` (the three letter rows of each) in `lib/rmhtype/keystats.ts`; `RmhTypeKeyStat` is keyed by
    `(userId, key, layout)`. But the layout is never remembered: `TypingStats.tsx` keeps it in `useState`, and
    `LessonRunner.tsx` records every lesson's statistics as `DEFAULT_LAYOUT` (QWERTY).
- **Decisions:**
  - **A layout picker** (QWERTY, AZERTY, Dvorak, Colemak) on the lessons page and the progress page, remembered on this
    device (`rmh:rmhtype:layout`, a preference in the device-data registry, read through `lib/core/persist`). The
    progress page, the heatmap, solo, daily and lesson runs record key statistics under the chosen layout.
  - **The course is generated per layout by position:** a QWERTY key's row and column in `KEYBOARD_ROWS` names the key
    at the same place on the chosen layout, so unit 1 on Dvorak introduces `uh`, `et`, `on`, `as`, `id`; fingers follow
    position, not the character. Capitals (unit 4) follow the mapped letters.
  - **Digits and punctuation:** Dvorak and Colemak share QWERTY's digit row, so unit 5 is unchanged for them, and unit 6
    maps each punctuation key by position where the layout has it unshifted and keeps it otherwise. AZERTY's digits need
    Shift and its punctuation differs, so the AZERTY course is units 1–4; units 5 and 6 say "Not part of the AZERTY
    course" (recorded: a full AZERTY symbol course is content for a later sprint).
  - **Progress per layout:** QWERTY keeps its ids (`l01`…) and every member's progress; the others are `dv-l01`,
    `cm-l01`, `az-l01`…, so switching layouts never overwrites stars. `lessons-schema.ts` already allows 32 characters.
  - **Drills** are built from the word list filtered to the lesson's allowed keys, as today; a lesson whose layout's
    keys yield fewer than three words uses the existing letter-group drill (`letterGroups`), as QWERTY's first lessons
    already do.
  - **Recommended next** and unit completion read the chosen layout's ids.

## Functional requirements

1. FR-1 `lib/rmhtype/layouts.ts` (pure): position maps for each layout (letter rows from `KEYBOARD_ROWS`, the digit row,
   the unshifted punctuation), `mapKey(qwertyKey, layout)`, `fingerForOn(layout, char)`, the on-screen rows.
2. FR-2 `lib/rmhtype/lessons.ts`: `courseFor(layout)` builds the course from `COURSE_SPEC` through the map, with
   prefixed ids for non-QWERTY layouts and AZERTY's four units; `LESSONS` and `UNITS` stay the QWERTY course for
   existing callers; `lessonById` accepts every layout's ids.
3. FR-3 `lib/rmhtype/layout-pref.ts`: the remembered layout (persisted, defaulting to QWERTY).
4. FR-4 `components/rmhtype/LayoutPicker.tsx` (a labelled select) on the lessons index and progress page;
   `LessonKeyboard.tsx` draws the layout; `LessonRunner.tsx`, the solo page and the daily page pass the layout to key
   statistics; `TypingStats.tsx` starts from the remembered layout.
5. FR-5 The lesson progress endpoint accepts the new ids (validated against `courseFor`) and stores them unchanged.

## Non-functional requirements

- **Compatibility:** QWERTY members see exactly today's course, ids and stars.
- **Accessibility:** the picker is a native select with a label; the lesson keyboard's keys keep their text labels.
- **Design:** app tier; RMHType's look.

## Data model and API

- No schema change.
- New `lib/rmhtype/layouts.ts`, `layout-pref.ts`, `components/rmhtype/LayoutPicker.tsx`. Edits `lib/rmhtype/lessons.ts`,
  `lib/rmhtype/lessons.server.ts` (id validation), `components/rmhtype/lessons/*` (keyboard, runner, index),
  `components/rmhtype/TypingStats.tsx`, `RmhTypeSoloPage.tsx`, `DailyPage.tsx`, `lib/device-data/registry.ts` and the
  device labels (anchors).

## Testing requirements

- Product suite `lib/rmhtype/__tests__/layouts.product.test.ts`: every QWERTY letter maps to one key per layout and the
  maps are bijections on the letter rows; Dvorak's home row is `aoeuidhtns`; fingers by position.
- Product suite `lib/rmhtype/__tests__/course-layouts.product.test.ts`: `courseFor('qwerty')` deep-equals today's
  `LESSONS`; each layout's lessons only use keys on that layout; AZERTY has units 1–4; every lesson's drill is non-empty
  for 50 seeds; ids unique and at most 32 characters.
- Main suite `lib/rmhtype/__tests__/lesson-progress-layouts.test.ts`: the endpoint accepts `dv-l01`, refuses an unknown
  id, never touches `l01` rows when saving `dv-l01`.
- Device registry test.

## Acceptance criteria

- [ ] A Dvorak typist picks Dvorak, and lesson 1 introduces U and H on the on-screen Dvorak keyboard.
- [ ] Their QWERTY stars are unchanged after finishing Dvorak lesson 1.
- [ ] Key statistics from a Colemak solo run appear on the Colemak heatmap.
- [ ] AZERTY shows units 1–4 and says the digits and punctuation are not part of its course.

## Out of scope

Other layouts (Workman, QWERTZ), typing in other languages, account-wide layout sync, an AZERTY symbol course.
