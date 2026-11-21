# 15 — Every computed translation key reaches the catalogs

Surface: about fifteen components whose `t()` keys are built at run time
(notifications, appearance, daily puzzles, the library reader, the theme
editor, flashcard grades, feed kickers, the friends-online widget and four
game panels), and a new gate test. Wave 7. Namespace: none of its own — the
keys land in each component's existing namespace.

## User story

As a member who uses the site in Arabic, Spanish or any language other than
English, I want notification verbs, system labels, colour-vision names,
puzzle titles and grades to appear in my language, so that the parts of the
interface I see most are not the parts left in English.

## Requirements elicitation

- **What exists (verified):** `pnpm i18n:extract` (i18next-parser) only sees
  string-literal keys. A key written as ``t(`notification-verb-${type}`)`` is
  invisible to it, so the key never reaches `locales/en/<ns>.json`, the
  translation pipeline never sends it, and **every locale shows the English
  `defaultValue`**. The settings hub had exactly this bug and was fixed by
  writing the keys out as literals (`components/settings/settings-nav-labels.ts`
  and its test, which holds the literal list equal to `lib/settings-nav.ts`).
  The same pattern remains in (verified with a search for `t(` followed by a
  template literal containing `${`):
  `components/feed/NotificationsColumn.tsx` (notification verbs ×3 call
  sites, every `system-label-*`), `components/settings/AppearancePanel.tsx`
  (colour-vision names and hints),
  `components/daily-puzzles/DailyPuzzlesHub.tsx`
  (mode titles), `components/library/BookReader.tsx` (quality labels),
  `components/themes/ThemeEditor.tsx` (contrast pairs),
  `components/feed/FeedRow.tsx` (kickers), `components/feed/DeckStudyColumn.tsx`
  (grades), `components/feed/FriendsOnlineWidget.tsx` (activity kinds),
  `components/rmh-pmc/IntelligencePage.tsx` (categories),
  `components/tf2-hud/loadout/Tf2LoadoutDetail.tsx` (classes),
  `components/temple-of-joy/panels/ChoirPanel.tsx` (stalls, ×2) and
  `LadderPanel.tsx` (tiers). Several other files already explain the trap in
  comments (`SearchHitRow.tsx`, `ExploreColumn.tsx`, `NotificationSettings.tsx`,
  `rebar-rutabaga/copy.ts`), so the knowledge exists but nothing enforces it.
- **Decisions:** each site gets a **literal label map** next to the
  component (`*-labels.ts`, a function taking `t` and returning a record of
  literal `t('key', { defaultValue })` calls, exactly like
  `settings-nav-labels.ts`), with a test that its keys equal the source list
  (enum, catalog array or `Record`). Where the input is open-ended (a server
  string with no fixed set, such as a free-form kicker), the component
  translates the known values through the map and shows the raw label for an
  unknown one — never a computed key. Keys keep their current names so
  existing translations on the `i18n/catalogs` branch still apply. A ratchet
  test counts computed first arguments to `t()` (and `i18nKey={`…`}` on
  `<Trans>`) under `app/`, `components/` and `features/`; its baseline is the
  count after this feature (expected 0) and it only lets the number fall.
  This feature runs last in the sprint so the system labels the other
  features add (`s04-*` anchors in `NotificationsColumn.tsx`) are converted
  too.

## Functional requirements

1. FR-1 Every listed site uses a literal label map; no computed `t()` key
   remains in the listed files.
2. FR-2 `pnpm i18n:extract` adds every key to its namespace's English
   catalog with the current English text (no wording changes, so no new
   keys — sprint rule on `defaultValue`).
3. FR-3 `lib/__tests__/i18n-computed-key-ratchet.test.ts` fails on any new
   computed key and prints the file and line.
4. FR-4 Each label map has a test holding it equal to its source list, so a
   new notification type, colour-vision mode, puzzle mode or grade fails the
   test until its literal is added.

## Non-functional requirements

- **Behaviour:** English output is byte-identical (the characterization
  snapshots in `components/feed/__tests__/` and the settings tests stay green
  without snapshot updates); only non-English locales change, and only by
  gaining translations.
- **Performance:** label maps are built once per render from `t` (or with
  `useMemo` on `t`), as `settingsNavText` is.
- **i18n:** catalogs for `feed`, `settings`, `daily-puzzles` and the other
  namespaces gain keys; this feature is the one sprint 04 exception allowed to
  write several catalogs, and it keeps every other catalog change out (the
  extractor rewrites unrelated drifted catalogs — revert those).
- **Steel:** no visual change.

## Data model and API

- No migration, no endpoint.
- New label modules beside each component, for example
  `components/feed/notification-labels.ts` (verbs and system labels),
  `components/settings/color-vision-labels.ts`,
  `components/daily-puzzles/mode-labels.ts`,
  `components/library/reader-quality-labels.ts`,
  `components/themes/contrast-labels.ts`,
  `components/feed/kicker-labels.ts`, `components/feed/deck-grade-labels.ts`,
  `components/feed/activity-labels.ts`, and one per game panel.
- `lib/__tests__/i18n-computed-key-ratchet.test.ts` (a source scan like the
  other ratchets in `lib/__tests__/`).

## Testing requirements

- Main suite: the ratchet test, and one `*-labels.test.ts` per map (main
  suite, because a missing translation key is a silent regression in every
  locale — the same reasoning as `settings-nav-labels.test.ts`).
- Existing characterization tests stay green unchanged.

## Acceptance criteria

- [ ] No computed `t()` key remains under `app/`, `components/`, `features/`
      (ratchet baseline 0, or a documented, shrinking list).
- [ ] The new keys are in `locales/en/*.json` with unchanged English.
- [ ] In `ar`, after `pnpm i18n:pull` and a translation run, notification
      verbs appear translated (checked at integration once catalogs exist).

## Out of scope

Translating server-generated notification previews (stored English text),
moving any string between namespaces, changing wording.
