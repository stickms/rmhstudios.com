# 18 — Follow Logs and News

Surface: Logs (`/blog/$slug`), News (`/news`, `/news/$slug`, story pages) and
`/settings/notifications`. Wave 6. Namespace `subscriptions`. Builds on 17 (the
inbox shows the new notification kinds).

## User story

As a member who reads RMH Studios' Logs and follows certain news topics, I want
to follow the Logs, a Log tag, a news category or a developing story and be told
when something new appears — in my notifications, and by email once a day if I
choose — so that I do not have to keep checking the site or use an RSS reader.

## Requirements elicitation

- **What exists (verified):** RSS for Logs, News and tags
  (`app/routes/blog.rss[.]xml.ts`, `news.rss[.]xml.ts`,
  `tag.$tag.rss[.]xml.ts`); announcement-mode Logs pop up once for everyone;
  admin email campaigns (`lib/email/campaign.server.ts`) and a weekly digest
  (`lib/digest/`). **A member cannot follow the Logs, a tag, a news category or
  a story** (no subscription model or code under `lib/` for `BlogPost` or
  `NewsArticle`). Logs are created in the admin
  (`lib/admin/api/admin.blog.server.ts`); News articles come from the pipeline
  (`scripts/news-pipeline/index.ts`) with `status`.
- **Decisions:** members only (guests have RSS). Fan-out is a pg-boss cron every
  15 minutes that reads new Logs and published News since a stored cursor —
  rather than hooks in each writer — so every way content arrives (admin,
  script, migration) is covered and a crash never loses or doubles a
  notification (the cursor advances only after the batch commits; notifications
  are deduped by `(userId, entityType, entityId)`). Email is a daily batch at
  most, never one email per article, with its own one-click unsubscribe list
  `logs`.

## Functional requirements

1. FR-1 Follow targets: all Logs; a Log tag; a News category (the values in
   `lib/news-categories.ts`); a News story (`NewsStory`).
2. FR-2 Follow buttons: on a Log's byline (Logs, and each tag via its menu), on
   the News category tabs, on a story page. The button shows Following and
   unfollows on a second press.
3. FR-3 Channels per subscription: in-site notification (on by default), email
   digest (off by default).
4. FR-4 The fan-out cron creates one SYSTEM notification per new item per
   subscriber (entity `blog_post` or `news_article`, link to the item), however
   many of their subscriptions match it.
5. FR-5 A daily email (17:00 UTC) to members with email-on subscriptions and new
   items since their last email: up to 20 items, title, description, link; sent
   through `sendOnce` with `canEmail` and a `List-Unsubscribe` header for the
   new `logs` list.
6. FR-6 `/settings/notifications` gains a "Logs and news" section listing the
   member's subscriptions with channel toggles and Unfollow.
7. FR-7 The inbox labels the new kinds (`systemIdentity` in
   `NotificationsColumn.tsx`: "Logs", "News").
8. FR-8 Unsubscribing from the email via the link turns email off on all the
   member's subscriptions and confirms on the existing unsubscribe page.

## Non-functional requirements

- **Security:** subscriptions are session-only and owner-only; at most 100 per
  member; targets validated (category in the known list, story and tag exist);
  the unsubscribe token is the existing signed scheme extended with `logs`.
- **Reliability:** idempotent fan-out (cursor + dedupe); the email job claims
  deliveries through `lib/email/deliveries.server.ts` so a retry never sends
  twice.
- **Performance:** subscribers are found by the `(kind, target)` index; fan-out
  processes at most 200 items per run and 5,000 notifications per batch.
- **Accessibility:** follow buttons are toggle buttons (`aria-pressed`) with the
  target in the name ("Follow the Logs", "Follow Science news").
- **i18n:** strings in `subscriptions`; emails render in the member's saved
  locale where the email templates support it, English otherwise.
- **Steel:** follow buttons are secondary (never the view's ink primary); the
  settings section is rows on rules.

## Data model and API

- New model `ReadingSubscription` in `prisma/schema/library.prisma`:
  `id String @id @default(cuid())`, `userId`, `kind String @db.VarChar(16)`
  (`blog`, `blog_tag`, `news_category`, `news_story`),
  `target String @default("") @db.VarChar(80)`, `inApp Boolean @default(true)`,
  `email Boolean @default(false)`, `lastEmailedAt DateTime?`, `createdAt`;
  cascades on user; `@@unique([userId, kind, target])`,
  `@@index([kind, target])`; `@@map("reading_subscription")`.
- New model `ReadingFanoutCursor` (`name String @id`, `lastSeenAt DateTime`,
  `@@map("reading_fanout_cursor")`).
- Migration `20261122060100_s02_reading_subscriptions`.
- Server `lib/reading/subscriptions.server.ts` (CRUD, `fanOutNewItems`,
  `sendDailySubscriptionEmails`), pure `lib/reading/subscriptions.ts` (target
  validation, matching an item to subscriptions), jobs
  `lib/reading/subscriptions-jobs.server.ts` registered in
  `server/jobs/index.ts` (`reading.subscriptions-fanout`, every 15 min;
  `reading.subscriptions-email`, daily).
- Contract `lib/reading/subscriptions.contract.ts`; endpoints
  `GET/POST /api/reading/subscriptions`,
  `PATCH/DELETE /api/reading/subscriptions/$id`.
- `lib/email/unsubscribe.ts` (`UNSUB_LISTS` gains `logs`) and
  `app/routes/api/email/unsubscribe.ts` (handles `logs`).
- `exportReadingSubscriptions(userId)` for the account export (integration).

## Testing requirements

- Main suite `lib/reading/__tests__/subscriptions.test.ts`: fan-out run twice
  creates each notification once; the cursor does not advance when the batch
  fails; an item matching two subscriptions notifies once; email-off members get
  no email; the `logs` unsubscribe token cannot unsubscribe another list.
- Product suite `lib/reading/__tests__/subscription-match.product.test.ts`.

## Acceptance criteria

- [ ] Following the Logs and publishing a Log from the admin produces one
      notification within 15 minutes.
- [ ] Following both "Science" and a Science story gives one notification for an
      article in both.
- [ ] With email on, at most one email a day arrives, and its unsubscribe link
      turns email off for every subscription.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Guest email subscriptions, push-only channel choice (push follows the existing
notification preferences), per-author follows (authors are members — that is
following).
