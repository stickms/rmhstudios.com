# 05 — Log drafts, scheduled publishing and revisions

Surface: `/admin/blog` (list), `/admin/blog/new`, `/admin/blog/$slug/edit`, and
every public reader of `BlogPost`. Wave 3. Namespace `log-drafts`. Depends on
sprint 02's 18 (Follow Logs and News), whose fan-out must only see published
Logs.

## User story

As the site's editor, I want to save a Log as a draft, preview it at its real
address while only admins can see it, schedule it to go out at a set time, and
see and restore earlier versions — so that writing a Log no longer means
publishing it the moment I press Save, and a bad edit can be undone.

## Requirements elicitation

- **What exists (verified):** `BlogPost` (`prisma/schema/library.prisma`) has
  no status: `lib/admin/api/admin.blog.server.ts` creates or updates the row
  and it is live at once on `/blog/$slug`, in the RSS feed, the sitemap
  (`lib/sitemap.server.ts`), search (`lib/search/indexer.server.ts`), the
  digest (`lib/digest/assemble.server.ts`), the sidebar
  (`lib/sidebar-data.ts`), the RSS route (`app/routes/blog.rss[.]xml.ts`), the
  developer API (`app/routes/api/v1/blog.ts`,
  `blog/$slug.ts`), OG cards (`lib/og/api/og.blog.$slug.server.ts`), AI
  takeaways, highlights and, after sprint 02, the subscription fan-out
  (`lib/reading/subscriptions.server.ts`). The editor
  (`components/admin/MDXEditor.tsx`) has a live preview but no draft. Edits
  overwrite `content` with no history (no revision model). Announcement Logs
  pop up for everyone as soon as they are saved.
- **Decisions:** a `status` column (`draft`, `scheduled`, `published`) with
  `published` as the database default, so the previous release (which knows no
  status) keeps creating live Logs and every existing row stays live.
  `publishedAt` is backfilled from `createdAt` and is the date readers sort and
  fan out by. One helper, `publishedLogWhere(now)`, is the only way public
  code filters Logs; a gate test forbids `prisma.blogPost.find*` outside the
  admin and the helper's module without it. Scheduled Logs are published by a
  pg-boss cron every minute (claim with `updateMany where status='scheduled'
  and publishAt <= now`, so two workers cannot both publish). A revision is
  saved on every save that changes title, description, tags or content; at
  most 50 kept per Log (oldest pruned).

## Functional requirements

1. FR-1 The editor has three actions: Save draft, Schedule (date and time in
   the editor's time zone, at least 5 minutes ahead), Publish. A published Log
   offers Update and Unpublish (back to draft).
2. FR-2 Drafts and scheduled Logs are invisible to every public reader listed
   above: 404 on `/blog/$slug` for non-admins, absent from RSS, sitemap,
   search, digest, sidebar, `/api/v1/blog*`, OG, subscriptions and
   announcement pop-ups.
3. FR-3 Admins see a draft at `/blog/$slug` with a "Draft — only admins can see
   this" banner; a shareable preview is not offered (out of scope).
4. FR-4 `/admin/blog` lists Logs with a status filter (All, Drafts, Scheduled,
   Published) using `Tabs`, showing the scheduled time or published date.
5. FR-5 The cron publishes due Logs, sets `publishedAt`, and from that moment
   the announcement and subscription paths treat it as new.
6. FR-6 A Revisions panel in the editor lists saves (time, author, a word count
   delta); selecting one shows a line diff against the current text (reuse the
   Toolbox's pure diff, `lib/toolbox/diff.ts`) and offers Restore, which loads
   it into the editor (it becomes current only when saved).
7. FR-7 The `date` string column stays as the displayed date; publishing sets
   it to the publish day when it was left empty.

## Non-functional requirements

- **Correctness:** the previous release must keep working on the migrated
  schema (defaults); the publish cron is idempotent and takes an advisory
  lock, as other jobs do.
- **Security:** every write is `auth: 'admin'`; `/blog/$slug` checks the
  session's admin flag on the server before rendering a draft, and sets
  `Cache-Control: private, no-store` for it; drafts never enter a shared cache
  (check `lib/api/response-cache.server.ts` and the route's cache headers).
- **Performance:** `@@index([status, publishedAt(sort: Desc)])`; public list
  queries keep their current plans (the index replaces the `date` sort where
  they sort by publication).
- **Accessibility:** the schedule control is a labelled date and time input
  pair with the time zone named; status is text in the list.
- **i18n:** admin strings in `log-drafts`; public pages show no new string
  except the admin-only banner.
- **Steel:** one ink primary in the editor (Publish, or Update when
  published); Save draft and Schedule are secondary.

## Data model and API

- `BlogPost` gains `status String @default("published") @db.VarChar(12)`,
  `publishAt DateTime?`, `publishedAt DateTime?`, `updatedById String?`. New
  model `BlogPostRevision { id BigInt @id @default(autoincrement()), postId,
  authorId String?, title, description, tags String[], content @db.Text,
  createdAt }` with cascade on the post, `@@index([postId, createdAt(sort:
  Desc)])`, `@@map("blog_post_revision")`.
- Migration `20261123030200_s03_log_drafts`: the columns, the table, the index
  and `UPDATE blog_post SET published_at = created_at WHERE published_at IS
  NULL`.
- `lib/blog/publication.ts` (pure: statuses, `publishedLogWhere(now)`,
  schedule validation); `lib/blog/publication.server.ts` (`publishDueLogs`,
  `saveRevision`, `listRevisions`, `getRevision`);
  `lib/blog/publication-jobs.server.ts` registered in `server/jobs/index.ts`
  (`blog.publish-due`, every minute).
- `admin.blog.server.ts` POST body gains `status` and `publishAt`; new modules
  `lib/admin/api/admin.blog.$slug.revisions.server.ts` (GET list) and
  `admin.blog.$slug.revisions.$id.server.ts` (GET one), with a contract in
  `lib/admin/blog-revisions.contract.ts`.
- Every reader in the list above switches to `publishedLogWhere`.

## Testing requirements

- Main suite `lib/blog/__tests__/log-publication.test.ts`: a draft is absent
  from each public reader (sitemap, RSS, search indexer, digest, v1 API,
  subscriptions fan-out, announcements) — mocked Prisma asserting the where
  clause; non-admin `/blog/$slug` for a draft is 404; the cron publishes once
  when run twice; revisions are capped at 50.
- Main suite gate `lib/__tests__/blog-published-filter.test.ts`: no
  `prisma.blogPost.find*` outside the allowed files without
  `publishedLogWhere`.
- Product suite `lib/blog/__tests__/publication.product.test.ts`: schedule
  validation, status transitions.

## Acceptance criteria

- [ ] A draft is visible only to admins and appears in no feed, sitemap or
      search.
- [ ] A Log scheduled for 10:00 is live, announced and fanned out by 10:01.
- [ ] Restoring a revision and saving makes it current; the old text is still
      in the list.
- [ ] Existing Logs remain live after the migration.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Shareable preview links for non-admins, multiple authors' review workflow,
scheduling News articles (they come from the pipeline).
