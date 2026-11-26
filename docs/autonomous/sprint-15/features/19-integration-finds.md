# 19 — Fix what sprint 14's integration found: daily puzzles with no saved result, handles in Arabic, and the phone header's tab order

Surface: the daily desk's Alibi, Chainlink, Outcast and Spectrum boards; every place a `@handle` is printed; the
conversation header in Messages on a phone. Wave 1. No namespace of its own. App tier (the daily desk) and site tier.

## User story

As a member who finished yesterday's Alibi on another device, I want today's desk to open instead of crashing; as a
member reading the site in Arabic, I want handles to read `@playerone`, not `playerone@`; and as a keyboard user on a
phone, I want the conversation header's controls in the order I see them, so that three defects sprint 14's
integration found before it are gone.

## Requirements elicitation

- **What exists (verified):**
  - **The crash.** The score route stores `resultJson: null` when a score arrives without one
    (`lib/daily-puzzles/api/daily-puzzles.results.server.ts` returns `resultJson: entry.resultJson ?? null`), and the
    client types the field `any` (`lib/daily-puzzles/persistence.ts`, `PuzzleResult.resultJson: any`). Then
    `components/daily-puzzles/AlibiGame.tsx` (`data.guesses`), `ChainlinkGame.tsx` (`data.chain`), `OutcastGame.tsx`
    (`existing.resultJson.correctRounds`) and `SpectrumGame.tsx` (`existing.resultJson`) dereference it: sprint 14's
    summary records `Cannot read properties of null (reading 'guesses')` for Alibi and the same for Chainlink; the
    Outcast read has the same shape. Impostor already guards (`saved?.resultJson`).
  - **Handles in RTL.** A handle is printed as `@{user.handle}` with no direction in 37 places in `app/`,
    `components/` and `features/` (a scripted count of `>@{`); in an `rtl` page the bidirectional algorithm moves
    the `@` to the end (`playerone@`). Sprint 14 found it in the conversation header
    (`components/feed/conversation/ConversationHeader.tsx`, `@{otherUser.username}`); a few places already wrap a
    handle in `<bdi>` (`components/admin/DailyPuzzlesAdmin.tsx`).
  - **Tab order.** In `ConversationHeader.tsx` the four conversation controls (pin, mute, call, group call) are in the
    DOM before `ChatHeaderPlus` but moved after it on a phone with `order-last` (sprint 14's integration fix for the
    name's room), so on a phone focus visits them before the chat settings while the eye sees them after.
- **Decisions:**
  - **Results are parsed, not trusted:** `lib/daily-puzzles/result-shapes.ts` (new, pure) has one reader per mode
    (`readAlibiResult(raw)` → `{ guesses, solved, failed }` with safe defaults, and so on for every mode), used by
    `persistence.ts` and each game; `PuzzleResult.resultJson` becomes `unknown` (one escape hatch fewer for
    `lib/__tests__/ts-escape-hatch-ratchet.test.ts`). A result with no `resultJson` opens the result screen with the
    score and time only ("Played on another device") rather than replaying guesses that were never stored.
  - **The score route stays as it is** (a score with no result is valid input from older clients); the reader is the
    fix, and a test pins the `null` case for every mode.
  - **A handle component:** `components/ui/handle.tsx` (new): `<Handle handle="x" />` renders `<bdi>@x</bdi>`
    (`dir` isolation, no translated strings, so it is a valid `components/ui/` primitive). Every `@{…handle}` /
    `@{…username}` print in `app/`, `components/` and `features/` moves to it, except inside `components/velum2099/game/`
    (the `@ts-nocheck` area) and files another wave-1 feature owns (04's workshop files: report them for a later pass).
  - **A ratchet** `lib/__tests__/handle-direction-ratchet.test.ts` counts the remaining raw `>@{` prints and only lets
    the count fall (the leftovers named above are its starting allowance).
  - **Tab order:** `ChatHeaderPlus` moves inside the controls row as its last item, so on every width the DOM order is
    back, name, pin, mute, call, group call, chat settings, and the visual order matches it; the name keeps its
    truncation. The characterization snapshot is updated deliberately.

## Functional requirements

1. FR-1 `lib/daily-puzzles/result-shapes.ts` and its use in `persistence.ts`, `AlibiGame.tsx`, `ChainlinkGame.tsx`,
   `OutcastGame.tsx`, `SpectrumGame.tsx`, `ImpostorGame.tsx` and `DailyPuzzlesHub.tsx` (`g.resultJson?.moves`).
2. FR-2 The "Played on another device" result state in each of the four boards.
3. FR-3 `components/ui/handle.tsx` and the sweep; `lib/__tests__/handle-direction-ratchet.test.ts`.
4. FR-4 `components/feed/conversation/ConversationHeader.tsx`: the row order.

## Non-functional requirements

- **No new utilities:** the header uses classes other pages already use (B5); the `Handle` component adds none.
- **The sweep is mechanical:** no copy or layout changes beyond the wrapper; snapshot tests that change are updated
  and each change is a `<bdi>` around an existing handle.
- **User-text registry:** `components/ui/handle.tsx` renders member text with `<bdi>`, so files that only print a
  handle through it may leave `USER_TEXT_RENDERERS` only if the scan agrees; never satisfy the scan with a comment.

## Testing requirements

- Product suite `lib/daily-puzzles/__tests__/result-shapes.product.test.ts`: each mode's reader with `null`, `{}`,
  junk and a full result.
- Render tests (`renderToStaticMarkup`) for the four boards' "Played on another device" state
  (`components/daily-puzzles/__tests__/`).
- Render test `components/ui/__tests__/handle.test.tsx`; the ratchet; the conversation characterization
  (`components/feed/__tests__/ConversationView.characterization.test.tsx`), its snapshot updated.
- `lib/__tests__/ts-escape-hatch-ratchet.test.ts` (falls), `lib/__tests__/user-text-direction.test.ts`.

## Acceptance criteria

- [ ] A member whose score for today has no saved result opens Alibi and Chainlink and sees their score, not an error.
- [ ] In `ar`, the conversation header and a profile show `@playerone` with the `@` first.
- [ ] On a 390 px phone, tabbing through the conversation header visits the controls in the order they appear.

## Out of scope

Storing a result for old scores, the headless-browser `setAppBadge` workaround (a test-harness matter, recorded),
handles inside the Velum 2099 game.
