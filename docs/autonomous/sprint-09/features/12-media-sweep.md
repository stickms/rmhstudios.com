# 12 — Uploads nobody uses, cleaned up safely

Surface: the jobs worker (a nightly media sweep and a weekly clip sweep), a new admin page `/admin/media-sweep`. Wave 4.
Namespace `media-sweep`.

## User story

As the site owner, I want pictures that were uploaded and never used — and the files of deleted posts once their
recycle-bin window has passed — to be removed from storage on their own, without ever deleting a picture that a
scheduled post, a flashcard or a build page still needs, and I want to see what a run would remove before I let it run.

## Requirements elicitation

- **What exists (verified against the sprint 08 tip, plus what the sprint 08 squash brings):**
  - `sweepUnreferencedMedia(deps)` (`lib/media/sweep.server.ts`) deletes the objects (and CDN copies) of `Media` rows
    that are `PENDING` past `ORPHAN_TTL_MS` (24 h, `lib/media/sweep-policy.ts`), of posts soft-deleted past
    `DELETED_POST_GRACE_MS` (90 days, the recycle bin's window), and of `ATTACHED` rows whose post was hard-deleted
    (`attachedAt` set, `postId` null). It is tested (`lib/__tests__/media-sweep.test.ts`) and **wired to nothing**: no
    job, route or script calls it. Its query has no `take` and no order.
  - **The exclusions arrive with the sprint 08 squash.** Sprint 08's integration adds to `sweepUnreferencedMedia`, with
    a test, the rule that `PENDING` media still referenced by an unpublished `ScheduledPost`, by a flashcard picture or
    by a build screenshot is never a target. **This feature does not re-specify or re-implement those exclusions**; it
    builds on them. The implementer confirms they are in the wave's base
    (`grep -n scheduledPost lib/media/sweep.server.ts` and the test) and stops and reports if they are not.
  - `Media` records `key`, `url`, `status`, `postId`, `createdAt` and `attachedAt`, and **not** the upload policy. A row
    is written only where the ingest caller passes `record: true` (`lib/media/ingest.server.ts`, `IngestCtx.record`,
    opt-in), and it holds the **full-size** variant's key only, while a policy with several widths (`album`
    400/1600/4096, `flashcard` 400/1200) also writes suffixed variants (`-<width>` before the extension, `ingestImage`)
    that no row names.
  - The upload policies are `POLICIES` in `lib/media/ingest.server.ts`: `avatar`, `post`, `album`, `library`, `build`,
    `flashcard`, `chat`. Object writers outside the ingest door: persona avatars (`lib/personas/avatar.server.ts`), the
    pronunciation clip (`lib/profile/plus.server.ts`, `PRONUNCIATION_PREFIX = 'profile-pronunciation/'`), emoji packs
    (`lib/emoji/packs.server.ts`, `ATTACHED` rows with no post and no `attachedAt`).
  - Sprint 08 19's follow-up: "a pronunciation clip whose storage delete keeps failing is orphaned; a sweep of
    `profile-pronunciation/` would close it". `listObjects(prefix, limit = 5000)` (`lib/storage/s3.server.ts`) returns
    keys only, without their times.
  - The trash module (`lib/trash/trash.server.ts`) relies on the sweep to retry objects whose delete failed.
  - Flags: `isFeatureEnabled(key)` (`lib/flags/flags.server.ts`); admin audit: `recordAdminActionIn`
    (`lib/admin-audit.server.ts`, the `AdminAuditLog` table).
- **Decisions:**
  - **Every surface classified.** `MEDIA_SWEEP_SURFACES` in new `lib/media/sweep-surfaces.ts` maps every `POLICIES` key,
    and the three writers outside the ingest door (`persona-avatar`, `pronunciation`, `emoji`), to one of: `swept` (by a
    named rule of `sweepUnreferencedMedia`), `excluded` (with the file whose reference keeps the object alive — the
    sprint 08 exclusions are cited here, not rewritten), or `not-recorded` (no `Media` row is written, so the row sweep
    never sees it; with the follow-up that would cover it). A test fails when `POLICIES` gains a key the map lacks. A
    surface is `swept` only when the rule is in the code; otherwise it is `excluded` or `not-recorded`. `chat` (which
    shares the feed key space) is `excluded` unless the implementer shows its rows are attached the way posts are, and
    says which.
  - **Variants go with their row.** When a row is swept, its policy's suffixed variants are deleted too, their keys
    derived with the ingest's own naming (export the helper from `ingest.server.ts` rather than copying it); a variant
    that does not exist is not an error. Rows do not record the policy, so the variant widths are found by trying each
    width of the policies whose key prefix matches (the prefix comes from `mediaKey`).
  - **Bounded and observable.** The nightly job (`media.sweep`, jobs anchor `s09-12`, at a fixed minute off the hour)
    takes at most 2 000 rows per run, oldest first (`orderBy: { createdAt: 'asc' }`, `take`), processed in batches of
    200, and records a summary (counts per rule, failures, duration) in the log and the audit row (no member ids, no
    object keys in the log).
  - **A dry run first.** `sweepUnreferencedMedia` gains `dryRun`, which returns the targets (counts per rule and the
    first 50 keys) and deletes nothing; the preview and the run call the same function with the same exclusions, so what
    the preview shows is what the run deletes. `/admin/media-sweep` (admin only) shows the last five runs (rows on
    rules, `t-meta` figures; D10 stays open), "Preview", and "Run now" (a `useConfirm`). Every run — nightly, weekly or
    "Run now" — writes one `AdminAuditLog` row with the action `media_sweep_run` (or `media_clip_sweep_run`) and the
    summary as its metadata (the nightly ones with the system actor the jobs worker already uses for audited work, or,
    if there is none, the run summaries go in the log only and the page lists "Run now" runs; the implementer records
    which). No new table.
  - **The flag.** A feature flag `media-sweep` (an absent flag is off) gates the nightly and weekly jobs, so the owner
    turns them on after reading a preview. "Run now" works with the flag off (it is the owner's explicit act).
  - **The clip sweep.** A weekly job (`media.clip-sweep`, same anchor) deletes `profile-pronunciation/` objects that no
    `ProfilePlus.pronunciationKey` names and whose last-modified time is more than 7 days old. It needs the time, so
    `lib/storage/s3.server.ts` gains `listObjectEntries(prefix, limit)` beside `listObjects`, returning
    `{ key, lastModified }` (S3's `LastModified`; the local fallback uses the file's modification time); an entry
    without a time is skipped. At most 5 000 objects per run; the summary says when the limit was reached.

## Functional requirements

1. FR-1 `MEDIA_SWEEP_SURFACES` and its coverage test.
2. FR-2 `sweepUnreferencedMedia`: the cap, batches, oldest-first order, the variant deletion and `dryRun` — on top of
   the sprint 08 exclusions, which stay exactly as they are.
3. FR-3 The nightly job and the weekly clip sweep, behind the flag; `listObjectEntries`.
4. FR-4 The admin page with runs, preview and "Run now"; admin hub entry (anchor); sitemap exclusion (anchor).

## Non-functional requirements

- **Safety:** an object is deleted only after its row is chosen; the row is deleted only after its object delete
  succeeded (as today); a failure is retried next run. The sprint 08 exclusions apply to the dry run too.
- **Performance:** every query is indexed (`Media @@index([status, createdAt])`, `[postId]`); the exclusion checks run
  per batch of at most 200 candidates.
- **Security:** the admin endpoints are contract + `implement()` with `auth: 'admin'`; the preview shows keys and
  counts, never member ids or names.
- **Operations:** the flag defaults off; the summary is visible without the logs.

## Data model and API

- No schema change. New `lib/media/sweep-surfaces.ts`, `lib/media/sweep-jobs.server.ts`,
  `lib/media/clip-sweep.server.ts`, `lib/media/sweep-admin.contract.ts`, `lib/media/api/admin.media-sweep*.server.ts`,
  `app/routes/_site/admin/media-sweep.tsx`. Edits: `lib/media/sweep.server.ts` (cap, order, variants, `dryRun`),
  `lib/media/ingest.server.ts` (export the variant-key helper only), `lib/storage/s3.server.ts` (`listObjectEntries`),
  `server/jobs/index.ts` (anchor), `app/routes/_site/admin/index.tsx` (anchor), `lib/sitemap.ts` (anchor). The owner
  creates the flag in `/admin/flags`; the code treats an absent flag as off.

## Testing requirements

- Main suite `lib/__tests__/media-sweep.test.ts` (extend; sprint 08's exclusion cases stay green unchanged): the 2 000
  cap and batches of 200; oldest first; a swept `flashcard` row also deletes its `-400` variant; `dryRun` deletes
  nothing and returns the targets a run then deletes.
- Main suite `lib/media/__tests__/sweep-surfaces.test.ts`: every `POLICIES` key classified; no surface is `swept`
  without a named rule.
- Main suite `lib/media/__tests__/clip-sweep.test.ts`: only unreferenced clips older than 7 days are deleted; an entry
  without a time is skipped.
- Main suite `lib/media/__tests__/sweep-admin.test.ts`: admin-only, audited run, the flag gates the jobs and not "Run
  now".
- `lib/__tests__/sitemap-coverage.test.ts`, `lib/__tests__/server-fn-guard-ratchet.test.ts`,
  `lib/api/__tests__/route-table.test.ts`.

## Acceptance criteria

- [ ] With the flag on, a 2-day-old abandoned upload is removed by the night's run with its smaller variants; a picture
      of a post scheduled for next month is not (sprint 08's exclusion, checked end to end here).
- [ ] The admin preview lists the same objects the run then removes.
- [ ] An orphaned pronunciation clip older than a week is removed by the weekly sweep.
- [ ] With the flag off, nothing runs at night.

## Out of scope

Re-specifying sprint 08's exclusions; storage tiering (`Media.tier`); a quota per member; sweeping Slice It audio (its
own `O8` dashboard); writing `Media` rows for surfaces that do not record them today (each is named as a follow-up in
the map); deleting avatars of deleted accounts.
