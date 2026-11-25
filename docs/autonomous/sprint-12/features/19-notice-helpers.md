# 19 — The last English notices, in the reader's language

Surface: the inbox rows and previews of RMHLadder job alerts, API key suspension and restore notices, report decision
messages and the admins' review alerts; the notice-preview ratchet's helper list goes to zero. Wave 6. No namespace of
its own (`notice-language.json` templates, `feed.json` labels). Site tier. Hardening (sprint 09 19's remainder).

## User story

As a member who reads the site in Spanish (or any of the nine languages), I want every notice in my inbox — a job
alert, a key suspension, a moderator's decision on my report — in my language, so that the inbox never switches to
English mid-list.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 09 19 made `SYSTEM` notices keys: `createNotification({ ..., ...notice('<key>', params) })`
    (`lib/notifications/notice-keys.ts`: `NOTICE_TEMPLATES`, `NoticeParamTypes`, `notice`), previews rendered from the
    key in the reader's language (`components/feed/notice-previews.ts`, labels in
    `components/feed/notification-labels.ts`). `lib/__tests__/notice-preview-ratchet.test.ts` counts bare English
    previews (`REMAINING` is empty) and names, in `PASSED_THROUGH_HELPERS`, five files whose English reaches
    `createNotification` through a helper or a variable, "the list only shrinks":
    - `lib/rmhladder/alerts/dispatch.server.ts` — `deliverPendingLadderAlerts` sends `payload.text`, composed per alert
      kind in the same file: a preference match ("… is a N% preference match."), N new matches, a saved search's new
      roles (one and many), a follow-up ("Follow up on …"), an interview time, a closing deadline ("… closes in N
      days."); the same text goes to e-mail and Discord.
    - `lib/admin/api-keys.server.ts` — the suspend notice's preview is the admin's reason; the restore notice's preview
      is the key's name.
    - `lib/moderation/triage.server.ts` — the decision message to the reported author is `decision.message` (a
      moderator's macro-filled text).
    - `lib/admin-review.server.ts` — `notifyAdminsOfReview({ preview })`, which the ratchet's comment calls "eight callers"; the tip
      has **seven**: `lib/handles/impersonation.server.ts` ("New impersonation report needs review"),
      `lib/moderation/api/moderation.report.server.ts` ("New ${entityType} report needs review"),
      `lib/moderation/auto-moderate.server.ts` ("Automated screening flagged a …"),
      `lib/account/api/account.strikes.$id.appeal.server.ts` ("A user has appealed a moderation strike."),
      `lib/creator/earnings.server.ts` ("New … redemption for N coins"), `lib/rmhmusic/learn/sprint/review.server.ts`
      ("A Daily board score asks for a look"), `lib/listings/cosmetic.server.ts` ("Marketplace listing held for
      review: …").
    - `lib/developer/recipes.server.ts` — a recipe's message, the recipe author's text.
- **Decisions:**
  - **Ladder:** seven keys, one per alert kind (`ladder-match`, `ladder-matches`, `ladder-search-match`,
    `ladder-search-matches`, `ladder-follow-up`, `ladder-interview`, `ladder-closing`), with the job title, company,
    search name and label as member or employer text params, counts as `count`, the relevance as a number, the
    interview time as an ISO date the preview formats in the reader's locale and zone. The stored alert payload keeps
    `text` (for e-mail and Discord, which are English channels today) and gains `noticeKey` and `noticeParams`; the
    in-app channel uses the key.
  - **API keys:** `api-key-suspended` ("Your API key {{name}} was suspended: {{reason}}") and `api-key-restored`
    ("Your API key {{name}} works again"); the reason stays the admin's text, as a param.
  - **Report decisions:** `report-decision` ("A moderator reviewed a report about your content: {{message}}"), the
    message a param; the frame is translated, the moderator's words are not (as quoted text never is).
  - **Admin review:** the seven callers pass one key each: `admin-review-impersonation`, `admin-review-report`
    (param `kind`, the entity type as a key into the existing report kind labels), `admin-review-automod` (`kind`,
    `category`), `admin-review-appeal`, `admin-review-redemption` (`kind`, `count` = the coins),
    `admin-review-music-score`, `admin-review-market` (`count` = the price). The grouping `kind` argument and
    `entityType: 'admin-review'` are unchanged.
  - **Recipes:** the message is the recipe author's text, which is quoted member text, not a notice: the file leaves the
    list with that reason written in the ratchet's header comment's rule (quoted member text is not listed), and the
    emitter wraps it in a `recipe-message` frame ("{{recipe}}: {{message}}") so its preview is still a key.
  - The ratchet's `PASSED_THROUGH_HELPERS` ends empty; the test then holds it empty.

## Functional requirements

1. FR-1 The keys, templates and param types under the Wave 0 notice anchors; one literal `case` per key in
   `notice-previews.ts`; labels for any new `entityType` in `notification-labels.ts` and its test (the existing
   `ladder_job`, `report`, `admin-review` labels are reused where they exist).
2. FR-2 Ladder: `dispatch.server.ts` builds `{ text, noticeKey, noticeParams }` per kind (one helper, used by every
   kind), and the in-app branch spreads `notice(noticeKey, noticeParams)`; alerts already queued without a key fall back
   to their stored `text` (old rows drain).
3. FR-3 API keys: both emitters in `api-keys.server.ts` use `notice()`.
4. FR-4 Triage: the decision message through `report-decision`.
5. FR-5 Admin review: `notifyAdminsOfReview({ notice })` replaces `preview`; the seven callers converted (the ratchet's "eight callers" note is corrected).
6. FR-6 Recipes: the frame key; the file removed from `PASSED_THROUGH_HELPERS`.
7. FR-7 English templates added to `locales/en/notice-language.json` (and labels to `feed.json`); no other catalogue.

## Non-functional requirements

- **Compatibility:** notices already in inboxes keep rendering (a row without a key shows its stored preview, as today).
- **Text direction:** member and employer text params are isolated as every notice param is (sprint 09 20).

## Data model and API

No schema change; the ladder alert `payload` JSON gains two optional fields.

## Testing requirements

- Main suite `lib/rmhladder/alerts/__tests__/dispatch-notices.test.ts`: each kind's key and params; e-mail still gets
  `text`; an old payload without a key still delivers.
- Main suite `lib/admin/__tests__/api-key-notices.test.ts`, `lib/moderation/__tests__/decision-notice.test.ts`,
  `lib/__tests__/admin-review-notice.test.ts`.
- The ratchet with `PASSED_THROUGH_HELPERS` empty; the notice-key catalogue test
  (`lib/notifications/__tests__/notice-keys.test.ts`); labels test.

## Acceptance criteria

- [ ] A Spanish-reading member's inbox shows a saved-search alert, an API key suspension and a report decision in
      Spanish frames (with the quoted text as written).
- [ ] `PASSED_THROUGH_HELPERS` is empty and the ratchet passes.
- [ ] A ladder alert queued before the change still arrives.

## Out of scope

Translating e-mail and Discord alerts, translating moderators' or admins' own words.
