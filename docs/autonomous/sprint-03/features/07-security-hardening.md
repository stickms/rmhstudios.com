# 07 — Password resets in the security log, and the last unkeyed address hashes

Surface: `/settings/security` → Recent activity (sprint 02's
`SecurityActivityPanel.tsx`), and the two server modules that still hash client
addresses on their own. Wave 6. Namespace `security-activity` (sprint 02's;
this feature adds keys to it). Depends on sprint 02's 10 (Account security
activity).

## User story

As a member, I want my account's security log to show when someone asked to
reset my password and when the password was reset — and I want every place the
site stores my network address to store it in a form that cannot be turned back
into the address — so that I notice an attack on my account and my privacy
does not depend on nobody ever reading a database dump.

## Requirements elicitation

- **What exists (verified on `main` after sprint 02):** `hashIp` in
  `lib/hash-ip.server.ts` is now a keyed HMAC (`IP_HASH_SECRET`, or a key
  derived from `BETTER_AUTH_SECRET`), used by
  `lib/auth/session-alert.server.ts`, `lib/profile/visitor-hash.server.ts`,
  `lib/security-reports.ts` and `lib/auth/security-log.server.ts`, and pinned by
  `lib/__tests__/hash-ip.test.ts`. **Two modules bypass it:**
  `lib/feed/api/rmharks.$id.comment.$commentId.view.server.ts` hashes with a
  bare `createHash('sha256').update(ip)` (reversible over the IPv4 space), and
  `app/routes/api/user-builds/$id/view.ts` has its own `hashIp` whose `ip +
  process.env.IP_HASH_SALT || 'rmh-salt'` has an operator-precedence bug:
  without the variable it hashes `"<ip>undefined"`, and with it the fallback is
  dead code. Their stored hashes (`RMHarkCommentView`, `BuildView`) are
  reversible today. Sprint 02's security log records sign-ins, method changes,
  password changes and account changes, but **not password reset requests or
  completed resets** (`onPasswordReset` and `sendResetPassword` in `lib/auth.ts`
  send email and start the recovery hold, and log nothing) — a sprint 02 review
  follow-up.
- **Decisions:** both modules call the shared `hashIp` (truncated to their
  columns' existing lengths, so no column changes). A data-only migration
  nulls the reversible hashes already stored in those two tables — they only
  serve view deduplication, which a null hash simply skips (check how each
  handler dedupes: if a unique index includes the hash column, null rows do
  not collide in Postgres, so no view is lost or double-counted beyond that
  day). A gate test forbids any other `createHash(...).update(ip` in the code
  base. A reset request is logged only for an existing account and without
  awaiting, so the response time does not reveal whether an address has an
  account.

## Functional requirements

1. FR-1 The comment-view and build-view handlers use `hashIp` from
   `lib/hash-ip.server.ts`; the local `hashIp` in `user-builds/$id/view.ts` and
   the bare SHA-256 are removed.
2. FR-2 The migration nulls the existing hash values in the two view tables.
3. FR-3 Two new security event kinds, `password_reset_requested` and
   `password_reset_completed`, recorded from `sendResetPassword` and
   `onPasswordReset`; both are in the `methods` filter and both get the "Not
   you?" line (with a link to change the password and sign out elsewhere).
4. FR-4 A completed reset's log row says that every device was signed out and
   that coin transfers are paused for 72 hours (the existing recovery hold).
5. FR-5 The security log CSV export includes the new kinds.
6. FR-6 `.env.example`'s `IP_HASH_SECRET` comment states that it now covers
   view deduplication too.

## Non-functional requirements

- **Security:** neither the reset URL nor its token is stored; the gate test
  pins that no module hashes an address without the key.
- **Timing:** the reset-request log write is fire-and-forget, after the
  existence check Better Auth already makes, mirroring how the email is sent.
- **Compatibility:** no column type changes (the additive gate refuses them);
  hashes are truncated to the existing column lengths.
- **Accessibility, i18n, Steel:** the two new sentences and the "Not you?"
  text live in `security-activity` next to the existing kinds; no new layout.

## Data model and API

- No new table or column. Migration `20261123060000_s03_ip_hash_reset`: the
  two `UPDATE … SET <hash column> = NULL` statements (check the real `@@map`
  table and column names of `RMHarkCommentView` in `social.prisma` and
  `BuildView` in `builds.prisma`).
- `lib/auth/security-log.ts`: the two kinds and filter membership;
  `lib/auth.ts`: the two hooks call the security log recorder
  (`lib/auth/security-log.server.ts`);
  `components/settings/SecurityActivityPanel.tsx`: the two sentences.

## Testing requirements

- Main suite `lib/auth/__tests__/password-reset-log.test.ts`: a reset request
  for an existing account writes one row; the hook does not await the write; a
  completed reset writes one row; neither stores the reset URL or token.
- Main suite gate `lib/__tests__/no-unkeyed-ip-hash.test.ts`: no
  `createHash('sha256').update(ip` (or `update(ip +`) outside
  `lib/hash-ip.server.ts`.
- Main suite `lib/feed/__tests__/comment-view-hash.test.ts` (or an extension of
  an existing view-handler test): both view handlers call `hashIp`.
- Keep `lib/__tests__/hash-ip.test.ts` and
  `lib/auth/__tests__/security-log.test.ts` green.

## Acceptance criteria

- [ ] Requesting a reset adds "Password reset requested" to the log with a
      "Not you?" line.
- [ ] Completing it adds "Password reset" and the member is signed out
      everywhere.
- [ ] No module hashes an address without the key (gate test), and the stored
      reversible view hashes are gone.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Geolocation of addresses, per-purpose keys, rotating the key, recovery codes
and trusted contacts (see the README's rejected ideas).
