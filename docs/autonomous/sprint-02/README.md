# Sprint 02 — deeper product surfaces

Twenty features that deepen what the site already has — flashcards, RMHType,
RMHStudy, the developer platform, the feed's social graph, notifications,
reading, achievements, game saves and keyboard accessibility — instead of adding
new standalone tools. Every feature was checked against the code base before it
was chosen: the "What exists (verified)" paragraph of each specification names
the files that show the gap.

- [plan.md](plan.md) — waves, shared and generated files, who regenerates what,
  merge and integration order.
- `features/NN-<slug>.md` — user story, requirements elicitation, functional and
  non-functional requirements, data model and API, testing, acceptance criteria.
- `briefs/NN-<slug>.md` — a self-contained implementer brief per feature.

Wave 0 (shipped with these documents): the twenty i18n namespaces are registered
in `lib/i18n/config.ts` with empty `locales/en/<ns>.json` files, and the product
test suite exists (`pnpm test:product`, `vitest.product.config.ts`,
`.github/workflows/product-tests.yml`) for tests named `*.product.test.ts`.

## The twenty features

| #   | Feature                                                                       | Surface                     | Wave | Persistence                                        |
| --- | ----------------------------------------------------------------------------- | --------------------------- | ---- | -------------------------------------------------- |
| 01  | [Webhooks console](features/01-dev-webhooks.md)                               | `/developer/webhooks`       | 1    | 4 columns on `WebhookEndpoint` / `WebhookDelivery` |
| 02  | [API explorer](features/02-dev-explorer.md)                                   | `/developer/explorer`       | 4    | none (client, registry-driven)                     |
| 03  | [Flashcard deck editor, import and export](features/03-study-editor.md)       | `/study/$deckId/edit`       | 1    | existing models, 4 new endpoints                   |
| 04  | [Flashcard practice tests](features/04-study-tests.md)                        | `/study/$deckId/practice`       | 3    | `FlashcardTestResult`                              |
| 05  | [Flashcard review history and statistics](features/05-study-stats.md)         | `/study/stats`              | 2    | `FlashcardReviewLog`                               |
| 06  | [RMHStudy focus history and weekly goal](features/06-rmhstudy-focus.md)       | `/rmhstudy/history`         | 4    | `weeklyGoalMinutes`, index                         |
| 07  | [RMHType touch-typing lessons](features/07-rmhtype-lessons.md)                | `/rmhtype/lessons`          | 1    | `RmhTypeLessonProgress`                            |
| 08  | [RMHType progress over time](features/08-rmhtype-progress.md)                 | `/rmhtype/progress`         | 2    | index only                                         |
| 09  | [RMHType daily challenge](features/09-rmhtype-daily.md)                       | `/rmhtype/daily`            | 3    | `RmhTypeDailyEntry`                                |
| 10  | [Account security activity](features/10-security-activity.md)                 | `/settings/security`        | 2    | `SecurityEvent`, prune cron                        |
| 11  | [Keyboard shortcut settings](features/11-keyboard.md)                         | `/settings/keyboard`        | 5    | `KeyboardPreference`                               |
| 12  | [Listen to articles](features/12-read-aloud.md)                               | Logs, News, library text    | 5    | none (per-viewer `localStorage`)                   |
| 13  | [Find in book](features/13-find-in-book.md)                                   | library reader              | 7    | none (client index)                                |
| 14  | [Highlights notebook and export](features/14-highlights.md)                   | `/reading`                  | 6    | existing `ReadingHighlight`                        |
| 15  | [Audience insights](features/15-audience.md)                                  | `/analytics`                | 3    | `FollowEvent`                                      |
| 16  | [Followers and following manager](features/16-follows.md)                     | `/follows`                  | 5    | uses `FollowEvent`                                 |
| 17  | [Notification inbox filters and controls](features/17-notifications-inbox.md) | `/messages` → Notifications | 4    | index on `Notification`                            |
| 18  | [Follow Logs and News](features/18-subscriptions.md)                          | Logs, News, settings        | 6    | `ReadingSubscription`, cursor, two crons           |
| 19  | [Achievement tracker](features/19-achievement-tracker.md)                     | `/progress`                 | 7    | `AchievementTrack`                                 |
| 20  | [Cloud save manager and snapshots](features/20-cloud-saves.md)                | `/settings/cloud-saves`     | 6    | `GameSaveSnapshot`                                 |

Every feature has UI, server code where it needs one (contracts with
`implement()`, registered `apiRoute` modules), persistence where it makes sense
(additive migrations), strings in its own namespace, and tests: mission-critical
ones (ownership, secrets, auth, a member's data) in the main suite, the rest in
the product suite.

## How the ideas were found

The site is already very wide: about 500 Prisma models, 900 endpoints, and the
170-idea programme of October 2026
(`docs/plans/2026-10-12-feature-ideas-every-surface.md` §4) was built in full.
The consolidation audit of 2026-11-19
(`docs/plans/2026-11-19-feature-consolidation-audit.md`) asks for depth over
breadth, and names unwired code. So the search looked for **shallow spots in
surfaces people already use**: an endpoint with no UI (webhooks, game saves), a
table that is written but never read (RMHStudy sessions), state that is
overwritten so history cannot exist (flashcard reviews, follows), a library with
no caller (`lib/audio/read-aloud.ts`), and accessibility requirements the site
does not meet (WCAG 2.1.4 for single-key shortcuts).

## Rejected ideas

| Idea                                          | Why not                                                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another batch of standalone utilities         | Sprint 01 did that; this sprint deepens existing surfaces.                                                                                                       |
| TOTP two-factor                               | `components/security/SecurityPage.tsx` states the policy: passkeys and the provider's own 2FA. Adding TOTP reverses an owner decision.                           |
| Content warnings on posts                     | Exist (`RMHark.isSensitive`, compose dialog).                                                                                                                    |
| Muted words, saved searches, search operators | Exist (`lib/search/parse.ts`, `SavedSearch`, keyword alerts).                                                                                                    |
| Per-post insights, creator analytics          | Exist (`InsightsModal`, `/analytics`); 15 adds only the missing follower history.                                                                                |
| Message search                                | Exists (`lib/messages/api/messages.search.server.ts`).                                                                                                           |
| Friends leaderboards                          | Exist (`lib/leaderboard.server.ts` scope `friends`).                                                                                                             |
| Coin spending insights                        | Exist (monthly statement with categories and CSV, `lib/economy/statement.ts`).                                                                                   |
| RMHMusic ear training                         | Exists (`lib/rmhmusic/learn/machines/ear.ts`).                                                                                                                   |
| API usage dashboard                           | Exists (`components/developer/KeyUsage.tsx`).                                                                                                                    |
| Article table of contents                     | Exists (`lib/reading/outline.ts`, `ArticleOutline`).                                                                                                             |
| Print stylesheets for articles and decks      | Adds site-tier CSS, which the Steel plan's B5 ledger says must shrink every phase.                                                                               |
| Accessibility statement page                  | A conformance claim the owner must make and sign off; not something to generate.                                                                                 |
| "Sign in with RMH Studios" (OAuth provider)   | A security-critical platform change that needs an owner decision on scopes, consent and review; too large to do safely as one of twenty.                         |
| Guest email subscriptions to the Logs         | Collecting addresses from signed-out visitors needs double opt-in, abuse handling and a privacy review; members-only (18) plus the existing RSS covers the need. |
| Anki `.apkg` import                           | A zipped SQLite database: shipping a SQLite reader to the client for one import path is not worth it; 03 imports Anki's text export.                             |
| Library-wide full-text search                 | Needs server-side indexing of user uploads (privacy, storage, a worker); 13 searches inside the open book instead.                                               |
| RMHTube watch history                         | RMHTube is a watch-party app; rooms, queues, playlists, watch-later and room history already exist.                                                              |
| Book clubs on the library                     | Library documents are private to their uploader (`docs/plans/2026-10-12-feature-ideas-every-surface.md` §4, P1), so there is nothing to share yet.               |
