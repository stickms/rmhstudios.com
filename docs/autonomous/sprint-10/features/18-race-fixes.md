# 18 — Close the gaps sprints 08 and 09 left open

Surface: handle changes from the profile form, race ghosts, recurring community threads, the scheduled-posts API's
"held" hint, admin spam sweeps, the admin membership grant. Wave 6. Namespace `race-fixes` (two dialog strings).
Hardening.

## User story

As a member and as an admin, I want the protections the site already promises — that a released handle cannot be grabbed
for 30 days, that an assisted run never sets a ghost, that a recurring thread posts once, that an undo restores
everything a sweep removed — to hold on every path, not only the path that was tested, so that nobody can walk around
them by using the other door.

## Requirements elicitation

- **What exists (verified), one gap each:**
  1. **Handles.** `changeHandle` (`lib/handles/history.server.ts`) enforces the cooldown, the 30-day reclaim block and
     writes the `HandleChange` row in one transaction; its own note says `lib/api/routes/profile.server.ts` "still
     changes handles directly (14-day cooldown, no history row, no reclaim block)". It does (`canChangeHandle`, a direct
     `user.update`), so the profile form — the path most members use — skips the reclaim block that guards against a
     handle takeover, and writes no history ("previously known as" stays empty).
  2. **Race ghosts.** `POST /api/replays/ghost` (`app/routes/api/replays/ghost.ts`) stores the caller's ghost with no
     assisted check; the score path decides "assisted" on the server from the run-start claim (`consumeAssistRun`,
     `lib/game/assist-run.server.ts`, readable by a second submit path for `SETTLE_GRACE_MS`). Sprint 09 17 recorded it.
  3. **Recurring threads.** The cron path claims an occurrence by moving `nextAt`
     (`lib/communities/recurring-jobs.server.ts`) and "Post now" claims `lastPostedAt` (`postRecurringNow`,
     `lib/communities/recurring.server.ts`); the two claims are on different columns, so a cron tick and a "Post now" in
     the same instant can both post. Sprint 09 11 recorded it.
  4. **The held hint.** `heldReasonsFor` (`lib/api/v1/scheduled.server.ts`) predicts sanctions and missing image
     descriptions but not AutoMod, so the API says a scheduled post will publish when AutoMod will hold it (sprint 09
     11's follow-up).
  5. **Spam sweeps.** A worker crash between removing an item and writing its sweep-item row leaves the removal
     unrecorded, so undo misses it (sprint 08 18); a `FAILED` sweep holding only pending item rows reads "0 removed" and
     refuses undo until settled (sprint 09 13). `lib/admin/sweeps.server.ts`.
  6. **Membership grant.** `app/routes/_site/admin/users.tsx` asks twice through `usePrompt`; cancelling the months
     prompt grants one month (`parseInt(monthsStr || '1')`), so "Cancel" grants (sprint 04 19's follow-up).
- **Decisions:**
  1. The profile route delegates a handle change to `changeHandle`, keeping its own response shape and mapping
     `HandleChangeFailure` to its existing messages; the route's 14-day `HANDLE_COOLDOWN_MS` (`lib/handle.ts`) gives way
     to `changeHandle`'s 30-day `HANDLE_CHANGE_COOLDOWN_MS` (`lib/handles/history.ts`, whose own comment says "two
     cooldowns is one too many"), and the profile form's help text says 30 days (a new string key in `race-fixes`).
  2. The ghost POST reads the run's assist claim the way the second submit path does; an assisted run stores no ghost
     and answers `{ saved: false, reason: 'assisted' }` (200, the client shows nothing new).
  3. Both recurring paths claim through one compare-and-set on one column: "Post now" also moves `nextAt` only when the
     occurrence it posts is the next due one within the window, and the cron claim also requires `lastPostedAt` outside
     `POST_NOW_WINDOW_MS`; a test drives both orders.
  4. `heldReasonsFor` runs the community's AutoMod rules (`getAutomodRules` and the matcher `prepareCommunityPost`
     (`lib/communities/post-gate.server.ts`) uses) on the draft's text and reports `automod` (an additive value of the
     existing `held` field, type `HeldReason` in `lib/api/v1/scheduled-schema.ts`; the rule's text is never returned).
  5. The sweep writes the item row and the removal in one transaction per item (removal first inside it); a `FAILED`
     sweep counts items in either state for `removedCount` and allows undo of the removed ones.
  6. One dialog for the grant (tier select, months number field 1–24, "Grant" and "Cancel"); cancel grants nothing.

## Functional requirements

1. FR-1 to FR-6 as above, each with its test.
2. FR-7 Each fix removes its entry from the follow-up lists it came from (the sprint summary records it).

## Non-functional requirements

- **Compatibility:** no response shape changes except the additive `automod` value and the ghost's `saved: false`; the
  developer API change is additive (changelog bullet under the anchor, SDK regenerated: the enum gains a value).
- **Correctness:** every claim is a single compare-and-set; no advisory lock is held across a post creation.

## Data model and API

- No schema change. Edits: `lib/api/routes/profile.server.ts`, `app/routes/api/replays/ghost.ts`,
  `lib/communities/recurring.server.ts`, `lib/communities/recurring-jobs.server.ts`, `lib/api/v1/scheduled.server.ts`
  (and `HeldReason` in `lib/api/v1/scheduled-schema.ts`, `lib/api/registry.ts` in place), `lib/admin/sweeps.server.ts`,
  `app/routes/_site/admin/users.tsx`, new `components/admin/GrantMembershipDialog.tsx`,
  `docs/developer-api/changelog.md` (anchor).

## Testing requirements

- Main suite `lib/handles/__tests__/profile-route-handle.test.ts`: the profile route writes a `HandleChange` row and
  refuses a handle inside another member's reclaim block.
- Main suite `lib/game/__tests__/ghost-assisted.test.ts`: an assisted run stores no ghost.
- Main suite `lib/communities/__tests__/recurring-claims.test.ts`: cron then "Post now", and "Post now" then cron, in
  the same instant, post once.
- Main suite `lib/api/v1/__tests__/scheduled-held-automod.test.ts`: a draft AutoMod would hold reports `automod`.
- Main suite `lib/admin/__tests__/sweep-item-atomic.test.ts`: a failure after removal leaves the item recorded; a
  `FAILED` sweep with pending rows can be undone.
- `components/admin/__tests__/grant-membership-dialog.test.tsx` (`renderToStaticMarkup`).
- Existing handle, ghost, recurring, scheduled API and sweep tests stay green.

## Acceptance criteria

- [ ] Changing a handle on the profile form records it and shows "previously known as"; the old handle cannot be taken
      by someone else for 30 days.
- [ ] An assisted Neon Driftway run sets no ghost.
- [ ] A recurring thread never posts twice from one instant.
- [ ] `GET /api/v1/me/scheduled` marks a draft AutoMod would hold.
- [ ] Cancelling the grant dialog grants nothing.

## Out of scope

New protections; the rest of the follow-up list (each needs its own design or an owner decision).
