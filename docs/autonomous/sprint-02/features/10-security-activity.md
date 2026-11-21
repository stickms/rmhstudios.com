# 10 — Account security activity

Surface: `/settings/security`. Wave 2. Namespace `security-activity`.

## User story

As a member who cares about my account, I want a dated list of security events —
sign-ins and from what kind of device, sessions ended, sign-in methods and
passkeys added or removed, handle and email changes, deletion scheduled or
cancelled — so that I can spot something I did not do and act on it from the
same page.

## Requirements elicitation

- **What exists (verified):** `/settings/security`
  (`app/routes/_site/settings/security.tsx`) shows passkeys, sign-in methods,
  **current** sessions (`components/site/SessionManager.tsx`, Better Auth
  sessions with `deviceFp` and `ipHash`) and account standing. A new-device
  alert (`lib/auth/session-alert.server.ts`) and a sign-in-method notice
  (`lib/auth/security-notice.server.ts`) send a one-off notification and email.
  **No history is kept**: a revoked session disappears, and the notices are
  scattered among ordinary notifications. Handle changes keep their own table
  (`HandleChange`, `lib/handles/history.server.ts`).
- **Decisions:** one append-only `SecurityEvent` table written by a single
  never-throwing recorder. No raw IP addresses are stored or shown — only the
  existing coarse device fingerprint ("Chrome on macOS") and the existing salted
  IP hash, which the page uses only to say "same network as this device" or not.
  Events are kept 365 days, then pruned by a pg-boss cron. There is no
  geolocation (the stack has no geo-IP provider, and `session-alert.server.ts`
  explains why it does not guess).

## Functional requirements

1. FR-1 Record these kinds: `sign_in`, `sign_in_new_device`, `sign_out`,
   `session_revoked`, `other_sessions_revoked`, `method_connected`,
   `method_removed`, `account_merged`, `passkey_added`, `passkey_removed`,
   `password_changed`, `email_changed`, `handle_changed`, `deletion_scheduled`,
   `deletion_cancelled`.
2. FR-2 Hook points: `databaseHooks.session.create.after` and
   `databaseHooks.account.create/delete.after` in `lib/auth.ts` (beside the
   existing alert and notice calls); a `hooks.after` `createAuthMiddleware`
   keyed on Better Auth paths for passkey registration and deletion, session
   revocation, sign-out, password and email change (verify the exact path
   strings against `node_modules/better-auth` before relying on them); the
   handle writer in `lib/handles/history.server.ts`; `scheduleDeletion` and
   `cancelDeletion` in `lib/account/deletion.server.ts`; the merge in
   `lib/auth/consolidation.server.ts`.
3. FR-3 "Recent activity" section on `/settings/security`: newest first, 30 per
   page; each row has an icon, a sentence ("Signed in on Firefox on Windows"), a
   relative time with the exact time in a tooltip and `<time>`, and "This
   device" on the current session's events.
4. FR-4 A filter: all, sign-ins, changes to how you sign in, account changes.
5. FR-5 A "Not you?" line under unfamiliar events linking to the session list
   (revoke) and the sign-in methods panel.
6. FR-6 Download the log as CSV.
7. FR-7 The account export (`/api/account/export`) includes the log through an
   `exportSecurityEvents(userId)` function (integration wires it in).

## Non-functional requirements

- **Security and privacy:** the recorder never throws and never delays sign-in
  (called un-awaited, like the existing hooks); no tokens, raw IPs or full user
  agents are stored; the list endpoint is session-only and scoped to the session
  user; CSV cells are formula-guarded.
- **Performance:** one insert per event; the list reads
  `(userId, createdAt desc)`; the prune cron deletes in batches of 5,000.
- **Accessibility:** a list of rows with text, not icons alone; times are
  `<time datetime>`; the filter uses the shared `Tabs` primitive
  (`components/ui/tabs.tsx`) — no hand-rolled tab strip.
- **i18n:** strings in `security-activity`; event sentences are keys with
  interpolated device names; no English built on the server.
- **Steel:** rows on rules, `t-meta` times, no coloured badges; one primary at
  most (the page already has its own).

## Data model and API

- New model `SecurityEvent` in `prisma/schema/auth.prisma`:
  `id BigInt @id @default(autoincrement())`, `userId`,
  `kind String @db.VarChar(32)`, `device String? @db.VarChar(80)`,
  `ipHash String? @db.VarChar(64)`, `sessionId String? @db.VarChar(64)`,
  `detail Json?` (provider id, old/new handle; never secrets),
  `createdAt DateTime @default(now())`; cascades on user;
  `@@index([userId, createdAt(sort: Desc)])`; `@@map("security_event")`.
- Migration `20261122020200_s02_security_events`.
- `lib/auth/security-log.server.ts` (`recordSecurityEvent`,
  `listSecurityEvents`, `exportSecurityEvents`, `pruneSecurityEvents`); kinds
  and pure helpers in `lib/auth/security-log.ts`.
- Contract `lib/auth/security-log.contract.ts`; endpoints
  `GET /api/settings/security/activity?cursor=&filter=` and
  `GET /api/settings/security/activity/export` (a registered handler returning a
  file response).
- Cron: queue `security-log.prune`, daily, registered in `server/jobs/index.ts`
  `REGISTRATIONS` (pattern: `lib/streak-reminders.server.ts`).

## Testing requirements

- Main suite `lib/auth/__tests__/security-log.test.ts`: the recorder swallows a
  database error; no row ever contains a raw IP or full user agent; listing is
  scoped to the session user; CSV formula guard; prune keeps 365 days.
- Main suite: the session hook records `sign_in` without awaiting (the sign-in
  path does not wait on a slow recorder).

## Acceptance criteria

- [ ] Signing in on a second browser adds a "Signed in" row with that browser's
      device name and no "This device" label on the first browser.
- [ ] Revoking that session from the list adds "Session ended".
- [ ] Adding and removing a passkey adds two rows.
- [ ] Changing the handle adds a row naming old and new handles.
- [ ] The CSV opens in a spreadsheet with no formulas evaluated.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Geolocation, email alerts for every event (the existing alerts stay as they
are), admin views of other members' logs.
