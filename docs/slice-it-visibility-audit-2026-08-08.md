# Slice It! — what shipped vs. what you can reach (2026-08-08)

[`_handoff/implementation-status.md`](_handoff/implementation-status.md) records
**155 of the 162** ideas in
[`plans/2026-08-06-slice-it-feature-ideas.md`](plans/2026-08-06-slice-it-feature-ideas.md)
as shipped. That count is honest about the code: the logic, the schemas, the
routes and the tests are there, and the tests pass.

It is not a count of what a player can reach. This document is that second
count. **Roughly a third of what is recorded as shipped has no path to it from
the running game** — an endpoint nothing fetches, a module nothing but its own
test imports, a persisted setting with no control, a wire event the client never
sends.

The pattern is one the codebase already named. `MainMenu.tsx` carries this
comment, added when `S1` and `S8` got their entry points:

> A mode nothing links to is a mode nobody plays — `R2` and `R10` shipped
> without one and sat dormant, which is the mistake this exists to avoid
> repeating.

It was repeated, at scale, across the waves that followed.

## Method

Four mechanical checks, each of which produces a list that cannot be argued
with:

1. **Every `app/routes/api/slice-it/**` path** grepped for a caller outside
   `app/routes/api/` and `routeTree.gen.ts`.
2. **Every module under `lib/slice-it/` and `components/slice-it/`** grepped for
   an importer that is not itself and not a test.
3. **Every `C2S.*` / `S2C.*` constant** in `lib/slice-it/net/events.ts` grepped
   for a client emitter/listener, and separately for a server handler.
4. **Every field and setter on `useSliceItStore`** grepped for a component that
   reads or writes it.

Reproduce any of them with a two-line shell loop; nothing here is a judgement
call about whether a feature is "done enough".

## Summary

| Group                                                        | Count | State                     |
| ------------------------------------------------------------ | ----- | ------------------------- |
| A. API routes with zero client callers                       | 7     | open                      |
| B. Logic modules imported only by their own tests            | 7     | open                      |
| C. Engine capabilities with no control                       | 2     | open                      |
| D. Persisted settings with no control                        | 14    | **closed by this change** |
| E. Modifiers with no toggle                                  | 5     | **closed by this change** |
| F. Wire events the server handles and the client never sends | 4     | open                      |
| G. Library facets the API supports and no UI sends           | 6     | open                      |
| H. Strings the i18n extractor silently drops                 | —     | open (see §H)             |

Groups D and E were picked up first because they are the purest form of the
defect: the value is persisted, the engine or the renderer already reads it,
and the only missing piece is a control. Three of them (`reducedFlash`,
`lanePalette`, `effectIntensity`) are accessibility features, which makes their
absence a defect rather than a gap — the catalog entry for this game declares
`descriptors: ['flashing']` and until now there was nothing anywhere in the UI
to turn that off.

---

## A. API routes with zero client callers

Each of these is a complete, `defineHandler`-wrapped, rate-limited,
zod-validated route with a documented rationale. Nothing in
`app/routes/slice-it/**`, `components/**`, `lib/**` or `hooks/**` fetches any of
them.

| Route                                         | Idea       | What is unreachable                                                                                                                                    |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/slice-it/shelves`                   | `L2`       | The four curated shelves (featured, hidden-gems, recently-ranked, fresh). The library still sorts by `recent`, so page one is permanently new uploads. |
| `GET /api/slice-it/uploader-stats`            | `L6`       | The uploader dashboard — plays, likes, clear rate and accuracy over time, aggregated across an uploader's charts.                                      |
| `GET`/`POST /api/slice-it/charts/:id/reviews` | `L3`       | Chart reviews on the two `fit`/`fun` axes, including the "must have cleared it" gate that is already implemented.                                      |
| `GET /api/slice-it/admin/review`              | `R7`       | The moderator's view of what `integrity.ts` flagged, plus the per-chart timing population it compares against.                                         |
| `GET`/`POST /api/slice-it/admin/takedown`     | `L9`/`L12` | Tombstoning a song for a claim (preserving every score set on it), and the storage-reclaim view.                                                       |
| `POST /api/slice-it/songs/:id/regenerate`     | `C8`/`C10` | Re-charting a song with the current generator, at a chosen density.                                                                                    |
| `POST /api/slice-it/songs/:id/import-chart`   | `C9`       | Importing an osu!mania / StepMania / Clone Hero chart onto your own upload. `lib/slice-it/import/` is a complete parser with no caller.                |

`/admin/slice-it` and `/admin/slice-it-content` both exist and are both linked
from `app/routes/_site/admin/index.tsx` — the two admin routes above are the
ones with no page at all.

## B. Logic modules imported only by their own tests

| Module                         | Ideas                         | What is unreachable                                                                                                                   |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/slice-it/goals.ts`        | `S3`, `S5`, `S6`, `S7`, `S10` | Per-chart missions, score tiers, the boss curve, the dan ladder, the campaign.                                                        |
| `lib/slice-it/session.ts`      | `P7`, `S4`, `S11`, `S12`      | Adaptive warm-up, endless survival, marathon, time attack — one reducer, four modes, no caller.                                       |
| `lib/slice-it/drill.ts`        | `P2`, `P9`                    | Failed-section drilling and the personal-best ghost.                                                                                  |
| `lib/slice-it/patterns.ts`     | `P8`                          | Pattern classification and the weakness profile.                                                                                      |
| `lib/slice-it/note-vocab.ts`   | `G2`, `G4`, `G6`, `M4`        | 4K/6K lanes, directional slices, rolls, chart-level double time.                                                                      |
| `lib/slice-it/hit-sounds.ts`   | `V2`                          | Custom uploaded hit sounds and the validation that bounds them.                                                                       |
| `lib/slice-it/frame-timing.ts` | `O6`                          | Frame-timing telemetry. In a rhythm game a frame spike is a missed note, so this is a correctness metric that is not being collected. |

`lib/slice-it/net/modes.ts` (`N3`/`N4`/`N5` policy) is imported by the socket
server and by its test, and by nothing on the client — see group F.

`lib/slice-it/sharing.ts` is half-reached: `review.server.ts` uses
`shouldEscalate`, which is only itself reachable through the dead `R7` route
above. `isNoteworthy`, `shouldAutoPost` (`X5`, posting runs to the feed),
`shouldWriteCard` (`H10`) and `runXp` have no callers at all.

## C. Engine capabilities with no control

`GameEngine.setPractice()` and `GameEngine.setAutoplay()` are implemented,
correct (the loop re-arms `hit`/`processedSliceIds` on rewind, which is the bug
the test exists for), and guarded — `useRunSummary` returns `null` for an
unrankable run, so neither can reach a leaderboard.

Both are called only from `lib/slice-it/__tests__/practice.test.ts`. `P1`
(practice mode with a section loop) and `P3` (autoplay) have no button.

## D. Persisted settings with no control — _closed by this change_

Every one of these is a field on `useSliceItStore`, persisted to local storage,
with a working setter. Before this change the setter was called from nowhere,
so the only way to alter any of them was to hand-edit local storage.

| Setting                                                                 | Idea      | Read by                         | Now set from                       |
| ----------------------------------------------------------------------- | --------- | ------------------------------- | ---------------------------------- |
| `reducedFlash`                                                          | `A2`      | `GameCanvas`, `presentation.ts` | Settings → Accessibility & Comfort |
| `lanePalette`                                                           | `A3`      | `GameCanvas`, `skins.ts`        | Settings → Accessibility & Comfort |
| `effectIntensity`                                                       | `A7`      | `GameCanvas`                    | Settings → Accessibility & Comfort |
| `showJudgementsBelow`                                                   | `H9`      | `engine.ts`                     | Settings → HUD                     |
| `judgementScale`                                                        | `H9`      | _nothing_ → now `GameCanvas`    | Settings → HUD                     |
| `judgementOpacity`                                                      | `H9`      | _nothing_ → now `GameCanvas`    | Settings → HUD                     |
| `comboPosition`                                                         | `H9`      | _nothing_ → now `HUD.tsx`       | Settings → HUD                     |
| `metronome`                                                             | `P4`      | `engine.ts`                     | Settings → Practice Aids           |
| `assistTick`                                                            | `P4`      | `engine.ts`                     | Settings → Practice Aids           |
| `inputOffset`                                                           | `A6`/`I5` | `engine.ts`                     | Settings → Input Mapping           |
| `extraBinds`                                                            | `I1`      | `GameCanvas` via `laneForKey`   | Settings → Input Mapping           |
| `linePosition`                                                          | `G11`     | `GameCanvas`, `skins.ts`        | Settings → Scroll Speed            |
| `modifierPresets`                                                       | `M7`      | _nothing_ → now the panel       | Settings → Modifier Presets        |
| (`saveModifierPreset` / `applyModifierPreset` / `deleteModifierPreset`) | `M7`      | —                               | Settings → Modifier Presets        |

Three of those had no _reader_ either — `judgementScale`, `judgementOpacity` and
`comboPosition` were stored, clamped and ignored. The renderer now honours all
three.

`lib/slice-it/input.ts` says of conflicting binds: _"Surfaced in settings rather
than prevented."_ There was no settings surface. There is one now, and it names
the clash.

## E. Modifiers with no toggle — _closed by this change_

`Modifiers` fields that the engine honours, `MODIFIER_BONUSES` prices, and
`applyExclusions` reasons about — with no control anywhere.

| Modifier      | Idea | Group added to      |
| ------------- | ---- | ------------------- |
| `suddenDeath` | —    | Game Modifiers      |
| `sRandom`     | `M2` | Game Modifiers      |
| `noFail`      | `A1` | Assists (new group) |
| `assist`      | `A1` | Assists             |
| `tapHolds`    | `M5` | Assists             |

The assist family is a separate, labelled group because `ASSIST_MODIFIERS`
already treats it as one: unranked, and worth no bonus, deliberately — "a mod
that eases the game and then charges a score penalty punishes the player for
needing it". A grid that mixed them with Strict Timing would lose that.

`suddenDeath` was previously visible only as a leaderboard pool label, so a
player could see the pool and had no way to enter it.

## F. Wire events the server handles and the client never sends

`server/socket-server/handlers/slice-it.ts` registers handlers for all of these.
`lib/slice-it/net/client.ts` has no emit helper for any of them, and
`addMatchListener` subscribes to none of the three server events.

| Event                                     | Idea           | What is unreachable                                                                                                                |
| ----------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `slice:settings` with `mode`              | `N3`/`N4`/`N5` | Co-op, attack and elimination. The lobby UI offers teams and song voting only; `mode` is never sent, so every lobby is `standard`. |
| `slice:attack` + `S2C.ATTACKED`/`CHARGES` | `N4`           | Spending a charge on an opponent, and seeing one land on you.                                                                      |
| `slice:queue` / `slice:unqueue`           | `N8`           | The lobby's session queue and host rotation.                                                                                       |
| `slice:rejoin`                            | `N12`          | Taking your seat back after a drop. The server's 20%-of-song rule is implemented and unreachable.                                  |
| `S2C.ELIMINATED`                          | `N5`           | Being knocked out at a checkpoint.                                                                                                 |

`lib/slice-it/net/modes.ts` — the whole co-op split / attack charge /
elimination policy — is server-side only as a result.

## G. Library facets the API supports and no UI sends

`LibrarySongsQueryZ` validates `genre`, `tags`, `bpmMin`/`bpmMax`,
`ratingMin`/`ratingMax` and `mine`. `SongLibrary.tsx` sends `q`, `sort`,
`artist`, `packId` and the random-picker's duration/unplayed/liked constraints,
and none of the others.

The upload route accepts `genre`, `tags`, `bpm`, `densityBias` and `isPublic` on
the multipart body. The upload form sends `file`, `title`, `artist`, `album`,
`description`, `duration` and `cover` — none of the five.

So `L1` (genres and tags) is unreachable from both ends at once: nothing can set
a genre on a song, and nothing could filter by it if anything had. `C10`'s
density override and private uploads are in the same position.

---

## H. A third i18n failure mode, found on the way

`/CLAUDE.md` §5 documents two ways a `t()` string can silently never reach
`locales/`. There is a third, and Slice It is full of it:

**`i18next-parser` only recognises a callee literally named `t`.** The idiom
throughout this game is

```tsx
const { t: ts } = useTranslation('r-slice-it');
```

and every `ts('key', { defaultValue })` behind that alias is invisible to the
extractor. The key never lands in `locales/en/<ns>.json`, so it never reaches
the translate pipeline, so **all 15 non-English locales serve the English
default forever** — and because `defaultValue` renders correctly, nothing about
the running game looks wrong.

Confirmed against the parser directly: a probe file using `t` extracts, the same
file using `ts` extracts nothing. It is why `locales/en/r-slice-it.json` was
missing `health-gauge`, `quant-colors`, `gameplay` and every other `ts()` string
in `MainMenu.tsx`, all of which have shipped for months.

A related, smaller one found in the same pass: **the namespace argument must be
a literal.** `useTranslation(NAMESPACES)` where `NAMESPACES` is a `const` array
resolves to nothing, and every key in that component falls through to
`defaultNamespace: 'common'`. And an options object that passes an
interpolation variable literally named `key` — `t('x', { defaultValue: 'Remove
{{key}}', key: … })` — is skipped entirely, because `key` collides with one of
i18next's own option names.

`SettingsPanel.tsx` avoids all three: a plain `t`, an inline
`useTranslation(['r-slice-it', 'c-game'])`, explicit `c-game:` prefixes, and
`{{bind}}` rather than `{{key}}`.

**This is not fixed repo-wide, and fixing it is its own change.** Running
`pnpm i18n:extract` today rewrites 575 files (+9,649/−2,794) because the
committed catalogs have drifted from the source that far — and with
`keepRemoved: false`, a blind run would *delete* every `ts()`-only key that some
other pipeline pass had previously added. The right sequence is: convert the
`ts` aliases to plain `t` across the affected components, then run
`i18n:extract` + `i18n:translate` + `i18n:resources` once, with the diff
reviewed. Doing it as a side effect of this change would have buried it.

For this change the new keys were extracted with the parser into a scratch
directory and merged key-by-key into `locales/en/`, and listed in
`KNOWN_UNTRANSLATED` (`lib/__tests__/i18n-catalogs.test.ts`) — the allowlist that
exists for exactly this case, since `DEEPSEEK_API_KEY` is not available here.

---

## What this change does

Groups D and E, in full, plus the three renderer fields that had no reader.
Concretely:

- `components/slice-it/SettingsPanel.tsx` — new. The settings drawer, lifted out
  of `MainMenu.tsx` (which is 600 lines lighter for it) and extended with
  Practice Aids, Accessibility & Comfort, HUD, Modifier Presets, the input
  offset, extra binds with conflict reporting, and the judgement-line slider.
- `components/slice-it/SongDetailsPanel.tsx` — the two missing challenge
  modifiers and the three-strong assist group.
- `components/slice-it/GameCanvas.tsx` — the judgement popup honours
  `judgementScale` and `judgementOpacity`.
- `components/slice-it/HUD.tsx` — the combo counter honours `comboPosition`,
  and the full-combo lamp tracks it.

Nothing in groups A, B, C, F or G is touched. They are listed above in the order
I would take them: A is the cheapest (each is one panel against a working
endpoint), F is the highest-value for the multiplayer that already exists, and B
is the largest because most of those modules need a screen that does not exist
yet.
