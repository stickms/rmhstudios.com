# 17 — Notification inbox filters and per-item controls

Surface: the Notifications tab of the inbox (`/messages`,
`components/feed/InboxColumn.tsx` → `NotificationsColumn.tsx`). Wave 4.
Namespace `notifications-inbox`.

## User story

As an active member who gets dozens of notifications a day, I want to filter my
inbox to mentions and replies, see only unread ones, mark one as unread to come
back to it, and dismiss the ones I do not need, so that the notifications that
matter do not drown under likes.

## Requirements elicitation

- **What exists (verified):** `components/feed/NotificationsColumn.tsx` lists
  notifications newest first with grouping of likes, reposts and follows
  (`groupNotifications`), a "Later" snooze (reminders) and **marks everything
  read when opened** (`markNotificationsReadApi` with `all: true`). It fetches
  with a raw `fetch` of `/api/notifications` instead of the contract client. The
  API (`lib/preferences/api/notifications.server.ts`,
  `notifications.read.server.ts`;
  `lib/notifications.server.ts#listNotifications`) has cursor pagination and
  mark-all-read only. **There is no filter by type, no unread view, no per-item
  read toggle and no dismiss.**
- **Decisions:** keep auto-mark-read on open (it is how members expect the badge
  to clear) but let a member mark an item unread again, and keep an "Unread"
  view that shows what was unread when they arrived (the page snapshots unread
  ids before marking). Dismiss deletes the row (notifications are not an
  archive; the account export already captures them while they exist) with an
  8-second undo that recreates nothing — the delete is deferred until the undo
  window passes. Filters are server-side so pagination stays correct.

## Functional requirements

1. FR-1 A filter `Select` (`components/ui/select.tsx`; the inbox already has a
   tab strip above, and a second strip under it would be a hand-rolled one):
   All, Mentions and replies (MENTION, REPLY, COMMENT), Follows, Likes and
   reposts, System.
2. FR-2 An Unread switch: only notifications that were unread when the page
   opened, plus any marked unread since.
3. FR-3 Per row (and per group, applying to every row in it): Mark as unread /
   Mark as read, Dismiss. Groups dismiss all their rows.
4. FR-4 "Mark all as read" applies to the current filter.
5. FR-5 Dismiss shows an Undo toast; the delete request is sent when the toast
   closes; navigating away sends it immediately (`keepalive`).
6. FR-6 The unread badge (`adjustNotifUnread`) stays correct through every
   action.
7. FR-7 The column uses the contract client (`api(listNotificationsApi, …)`)
   instead of a raw fetch.

## Non-functional requirements

- **Security:** every per-item endpoint is scoped to `userId` in the `where`
  clause (a foreign id changes nothing and answers 404); `rateLimit: 'write'`.
- **Performance:** a new index `(userId, type, createdAt desc)` backs the type
  filter; mark-read by filter is one `updateMany`.
- **Accessibility:** row actions are in a menu button per row with a name
  ("Actions for: Ana replied to you"); the Unread switch is a labelled `Switch`;
  filter changes keep focus on the select and announce the new count.
- **i18n:** strings in `notifications-inbox`; existing verbs keep their keys.
- **Steel:** rows on rules; unread marked by a 6 px ink dot plus "Unread" in the
  accessible name, not by a tinted row.

## Data model and API

- `Notification`: add `@@index([userId, type, createdAt(sort: Desc)])`.
- Migration `20261122040200_s02_notification_type_index`.
- `listNotifications` gains `types?: NotificationType[]` and `ids?: string[]`.
- Contracts: extend the notifications section of
  `lib/preferences/preferences.contract.ts` (list query gains `filter`,
  `unreadIds`; mark-read body gains `filter`) and add
  `lib/notifications/inbox.contract.ts` for `PATCH /api/notifications/$id`
  (`{ read }`) and `DELETE /api/notifications/$id` (also
  `POST /api/notifications/dismiss` for a group's ids, at most 100).
- Pure `lib/notifications/filters.ts` (filter ↔ types map).

## Testing requirements

- Main suite `lib/notifications/__tests__/inbox.test.ts`: a foreign id is 404
  and unchanged; unread counter moves by exactly the number of rows changed;
  mark-all with a filter touches only those types; dismiss of a group caps
  at 100.
- Product suite `lib/notifications/__tests__/filters.product.test.ts`.

## Acceptance criteria

- [ ] Mentions and replies shows only mentions, replies and comments, and
      paginates past the first page.
- [ ] Marking an item unread raises the badge by one; reading it lowers it.
- [ ] Dismiss then Undo leaves the item; dismiss and wait removes it after
      reload.
- [ ] No raw `fetch('/api/notifications…')` remains in the column.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Notification categories beyond the existing enum, archive, email of the inbox.

## Review decisions

- The list query is validated by a zod schema (`listQuery` in `lib/notifications/inbox-schema.ts`). The API query
  arrives as a flat record, so the Unread snapshot is one comma-separated `unreadIds` param (at most 100 ids).
- Opening the inbox marks read only the rows actually shown (the first page), not everything: unread rows past the
  first page stay unread, keep the badge honest and still appear in Unread. The Unread view is a server query
  (`unread=true`): rows unread now, plus the ids that were unread at open (so rows auto-marked on open stay visible).
  "Mark all as read" remains the explicit way to clear everything (per filter).
