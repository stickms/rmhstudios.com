# 05 — Your own texts in RMHType

Surface: `/rmhtype/texts` (new), the solo page (`/rmhtype/solo`), the progress page. Wave 3. Namespace `type-texts`. App
tier (L8): RMHType keeps its own look.

## User story

As someone practising typing for my job or my studies, I want to keep the texts I care about — a paragraph from my
field, a speech, a piece of code — practise any of them again, and see whether I am getting faster on each one, so that
my practice is on material I will actually type.

## Requirements elicitation

- **What exists (verified):**
  - Solo sources are `standard | code | lore` (`lib/rmhtype/sources.ts`, `SOLO_SOURCES`); the server picks the passage.
  - A one-off pasted text: `components/rmhtype/CustomTestPanel.tsx` on the progress page's Keys section (sprint 09 02)
    starts an unranked run of whatever is pasted; nothing is kept, so the next day the text is gone and there is no
    history for it. `isLeaderboardEligible` (`lib/rmhtype/custom-test.ts`) returns false for every custom test.
  - Ghosts (sprint 08 11): `RmhTypeGhost (userId, passageId)` stores a coarse progress curve per passage, and the solo
    page skips the ghost for a custom run (`RmhTypeSoloPage.tsx`, `!customRun`).
  - Key statistics (sprint 09 02) are recorded from solo runs behind "Record key statistics".
- **Decisions:**
  - **A text library.** Up to 50 texts per member, each a title (up to 80 characters) and a body (20–3,000 characters,
    printable text; line breaks kept, tabs become two spaces as code snippets already are). Private to the member, never
    on a board, never shared.
  - **Practice.** "Practise" on a text opens the solo page with `?text=<id>`; the run is unranked and labelled "Your
    text, not on the boards". The finished run updates the text's best WPM, best accuracy, run count and last run (one
    write per finished run, compare-and-set on the best).
  - **History per text.** The text page lists runs as a line chart of WPM per run (the last 50 runs per text, kept in a
    small table and trimmed on insert) with its table view.
  - **Scoring (validation pass 2).** A pasted custom run is scored in the browser today (`RmhTypeSoloPage.tsx`,
    `customRun`: no `SOLO_FINISH`, no server passage). A saved-text run is scored the same way and sent once to the
    text's run endpoint, which re-checks it against the stored body (typed length ≤ body length, `MAX_WPM` from
    `lib/rmhtype/typing-run.ts`, accuracy 0–100, `timeMs` ≥ 1) and stores it. The figures are the member's own record on
    a private text, never on a board, so a dishonest client only misleads itself; nothing about a text run reaches XP,
    streaks, the daily board, profiles or achievements (asserted: the endpoint calls none of their writers).
  - **Ghost.** "Race my best" works on a saved text: the run endpoint saves the curve through the existing
    `lib/rmhtype/ghost-save.server.ts` with `passageId` `text:<id>` (its checks — `MIN_GHOST_ACCURACY`, the duration
    tolerance, `MAX_GHOST_SAMPLES` — apply unchanged); text ghosts share the member's `MAX_GHOSTS_PER_MEMBER = 500` with
    passage ghosts (stated in the page's help line); deleting the text deletes its ghost.
  - **From the pasted test.** The existing custom test panel gains "Save this text" (title prompt through `usePrompt`),
    so a pasted text can be kept.
  - **Key statistics** honour the existing switch exactly as other solo runs do.
  - **Export:** the texts (title, body, bests, run count) and their runs.
  - **Erasure:** texts and runs are erased (two registry entries, `erase`); their `text:` ghosts already go with every
    `RmhTypeGhost` row (`erase`, sprint 08 11), so no new ghost operation is added.

## Functional requirements

1. FR-1 Models `RmhTypeText` and `RmhTypeTextRun`; the 50-text cap under `lockKey(tx, 'rmhtype-texts:<userId>')`.
2. FR-2 `lib/rmhtype/texts.server.ts`: list, create, rename, edit body (editing the body resets the bests and deletes
   the runs and ghost, after a confirmation that says so), delete, record a run.
3. FR-3 Registered endpoints with contracts under `/api/rmhtype/texts…`, `rateLimit: 'write'` on writes.
4. FR-4 `/rmhtype/texts`: the list (title, best WPM, runs, last run as `t-meta` figures), add, edit, delete through
   `useConfirm`; a text's page section with the chart.
5. FR-5 The solo page plays `?text=<id>`, records the run, races the ghost; "Save this text" in the custom panel.
6. FR-6 Erasure operations under the anchor, the registry entries, the export section.

## Non-functional requirements

- **Privacy:** every read and write is scoped to the owner; a text id from another member is 404.
- **Performance:** the solo page fetches one text by id through React Query; no list fetch on the solo page.
- **Design:** app tier; RMHType's own type and colours; the chart is `components/ui/line-chart.tsx` with its table.

## Data model and API

- `RmhTypeText` (`@@map("rmhtype_text")`: `id`, `userId` → `User` (relation `RmhTypeTexts`), `title`, `body`
  `@db.VarChar(3000)`, `bestWpm Float?`, `bestAccuracy Float?`, `runs Int @default(0)`, `lastRunAt DateTime?`,
  `createdAt`, `updatedAt`, `@@index([userId, updatedAt])`) and `RmhTypeTextRun` (`@@map("rmhtype_text_run")`: `id`,
  `textId` → `RmhTypeText` (cascade), `userId` → `User` (relation `RmhTypeTextRuns`), `wpm`, `accuracy`, `timeMs`,
  `createdAt`, `@@index([textId, createdAt])`, `@@index([userId])`) in `prisma/schema/rmhtype.prisma`. Migration
  `20261130030300_s10_type_texts`.
- New `lib/rmhtype/texts.ts` (pure: normalise, limits), `texts-schema.ts`, `texts.contract.ts`, `texts.server.ts`,
  endpoint modules under `lib/rmhtype/api/`, `app/routes/rmhtype/texts.tsx`, `components/rmhtype/TextsPage.tsx`.
- Edits: `components/rmhtype/RmhTypeSoloPage.tsx`, `components/rmhtype/CustomTestPanel.tsx`,
  `lib/rmhtype/rmhtype.queries.ts`, `lib/rmhtype/ghost*.ts` (the `text:` prefix), `prisma/schema/auth.prisma`,
  `lib/account/deletion.server.ts`, `lib/account/export-sprint-10.server.ts` and `lib/sitemap.ts` (anchors),
  `lib/account/erasure-registry.ts` (two entries), `lib/i18n/user-text.ts` (anchor).

## Testing requirements

- Main suite `lib/rmhtype/__tests__/texts.test.ts`: the 50 cap under the lock; another member's text 404; editing the
  body resets bests and deletes runs and the ghost; a run updates bests only when better; runs trimmed to 50.
- Main suite `lib/account/__tests__/type-texts-erasure.test.ts`: texts, runs and `text:` ghosts erased.
- Product suite `lib/rmhtype/__tests__/texts.product.test.ts`: normalisation (tabs, line endings, control characters
  refused), limits.
- `components/rmhtype/__tests__/texts-page.test.tsx` (`renderToStaticMarkup`): empty state, the list's figures.
- Sitemap coverage, user-text direction, erasure coverage, route table, `useEffect` ratchet.

## Acceptance criteria

- [ ] A member saves a pasted paragraph, practises it three times, and sees three points and the best WPM on its page.
- [ ] Racing the ghost on a saved text shows the best run's caret.
- [ ] A run on a saved text never appears on any board.
- [ ] Deleting the text removes its runs and ghost.

## Out of scope

Sharing texts, public text packs, importing files, multiplayer races on a saved text, per-text key statistics.
