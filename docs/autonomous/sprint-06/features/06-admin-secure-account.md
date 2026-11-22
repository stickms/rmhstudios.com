# 06 — Secure a member's account

Surface: the admin user moderation drawer
(`components/admin/UserModerationPanel.tsx` on `/admin/users`), and the
member's notification and security activity. Wave 6. Namespace
`admin-secure-account`.

## User story

As the site operator handling a report that a member's account was taken over,
I want one action that signs the account out everywhere and revokes every key
and token that could still act for it — without banning the member who is the
victim — and that tells the member what happened and what to do next, so that
the attacker is cut off at once and the member can recover.

## Requirements elicitation

- **What exists (verified):**
  - Banning (`lib/admin/api/admin.users.$id.ban.server.ts`) ends sessions
    (`prisma.session.deleteMany`) but bans the victim too; there is no
    non-punitive equivalent.
  - Credentials that act for an account without a session:
    `DeveloperApiKey` (`revokedAt`), `WebhookEndpoint` (`secret`,
    `previousSecret`, `enabled`), `RmhCodeToken` (`revokedAt`), and
    `CalendarFeed` (a token in a URL, `rotatedAt`). Passkeys and OAuth links
    (`Passkey`, `Account`) are sign-in methods, not standing credentials.
  - The member can already see and end their own sessions
    (`components/settings/SecurityActivityPanel.tsx`) and has a security event
    log (`SecurityEvent`, sprint 02 10, `lib/auth/security-log.ts`).
  - Admin actions are audited with `recordAdminActionIn`
    (`lib/admin-audit.server.ts`); the drawer shows strikes, restrictions, bans,
    coin adjustments and moderator notes.
- **Decisions:**
  - "Secure account" does, in one transaction: delete every session; set
    `revokedAt` on every live API key and RMHCode token; disable every webhook
    endpoint (`enabled = false`) and replace its secret with a fresh one (the
    old secret and `previousSecret` are cleared so a stolen secret verifies
    nothing); rotate the calendar feed token. It does **not** touch passkeys,
    OAuth links or the password (removing a passkey could lock the real owner
    out; the owner of the account resets the password themselves).
  - The admin chooses which of the four groups to include (all ticked by
    default) and must write a reason (≤ 500 characters, stored in the audit
    entry and as a site moderator note).
  - The member gets a `SYSTEM` notification (label `account_secured`, urgency
    critical so quiet hours do not hold it) and, when email is configured and the
    "Account security" email preference allows, the existing security email path
    (`sendOnce`, `canEmail` as `lib/auth/session-alert.server.ts` uses them). The
    text says what was revoked and links to `/settings/security`, and tells them
    to change their password and check their passkeys. It never includes the
    admin's reason.
  - A `SecurityEvent` of kind `account_secured_by_admin` is written so the
    member sees it in their security activity.
  - An attacker who held the account may have added a passkey, linked an OAuth
    account or changed the password; this feature removes none of them (owner
    lock-out risk), so the preview lists the member's passkeys and linked
    sign-in accounts with their creation dates, read-only, and the member's
    notification tells them to remove any they do not recognise in
    `/settings/security`. Pending Better Auth `Verification` rows that point at
    the member (password-reset and email-change links: Better Auth keys a reset
    as `reset-password:<token>` with the user id as `value`; confirm against the
    installed version) are deleted in the same transaction.
    *(Integration note: only the password-reset rows carry the user id; an
    email-change verification is not keyed by the user, so a pending email
    change is not revoked. Signing out everywhere also deletes the member's
    `PushSubscription` rows, so a compromised device stops receiving pushes.)*
  - Known limits, stated in the drawer's help text and the summary: a deleted
    session can still **read** for up to the cookie cache's 300 s
    (`lib/auth.ts`, writes are refused at once), and an already-open realtime
    socket keeps its connection until it reconnects (no socket-kick path
    exists; the ban path has the same limit). Building a socket kick is out of
    scope.
  - Admins cannot run it on their own account from this drawer (they use
    settings) and cannot run it on another admin (403); the owner-level path for
    that is out of scope.

## Functional requirements

1. FR-1 The drawer gains a "Secure account" section: counts of live sessions,
   API keys, RMHCode tokens, enabled webhooks and whether a calendar feed exists;
   four checkboxes; a reason field; one danger button "Secure account",
   confirmed with `useConfirm` naming the member.
2. FR-2 On success the section shows what was revoked (numbers) and the time;
   the drawer's audit list shows the entry.
3. FR-3 The member's notification links to `/settings/security`, where the new
   security event is listed with its text.
4. FR-4 The member's developer console (`/developer`) shows revoked keys as
   revoked and disabled webhooks as disabled with "Disabled by RMH Studios
   staff — re-enable to get a new secret", using existing states where they
   exist.
5. FR-5 Re-enabling a webhook after this requires the member to generate a new
   secret (the existing rotate flow); the disabled state is not silently undone.

## Non-functional requirements

- **Correctness:** all revocations, the audit entry (`recordAdminActionIn`) and
  the moderator note are one `prisma.$transaction(async (tx) => …)`;
  notification and email are sent after commit, best-effort. Running it twice
  is safe (it revokes what is live; zero counts are fine).
- **Security:** `auth: 'admin'`; `rateLimit: { limit: 10, windowMs: 60_000,
  prefix: 'admin-secure' }`; zod for the groups and reason; target must exist,
  not be an admin, not be the actor. New webhook secrets come from
  `generateWebhookSecret` (`lib/webhooks/signature.ts`) and are never returned
  in the response.
- **Performance:** one count query per group for the preview, in parallel.
- **Privacy:** nothing new is stored about the member except the audit entry,
  moderator note and security event (all existing tables with existing erasure).
- **i18n:** `admin-secure-account`; the notification label in `feed`; the
  security event's description in the security activity's own labels file
  (literal `t()`).
- **Steel:** a section on a rule in the drawer; one danger button (the drawer's
  ink primary stays its existing action); no tinted warning box (D8).
- **Accessibility:** the checkboxes are a `fieldset` with a legend; the result is
  announced in a polite live region.

## Data model and API

No schema change. `SecurityEvent.kind` is a string column; add the new kind to
the kinds list in `lib/auth/security-log.ts`.

- `lib/admin/secure-account.ts` (pure: groups, reason limits, summary text keys),
  `lib/admin/secure-account.server.ts` (`previewSecureAccount`,
  `secureAccount`), `lib/admin/secure-account.contract.ts`.
- Module `lib/admin/api/admin.users.$id.secure.server.ts` (GET preview, POST
  secure).
- `components/admin/SecureAccountSection.tsx`, rendered in
  `UserModerationPanel.tsx`.

## Testing requirements

- Main suite `lib/admin/__tests__/secure-account.test.ts`: non-admin 403; target
  admin 403; self 400; every chosen group revoked and unchosen groups untouched;
  webhook secret replaced and `previousSecret` cleared; audit entry and
  moderator note written in the same transaction (the fake transaction records
  order); the notification omits the reason; a second run reports zeros.
- Product suite `lib/admin/__tests__/secure-account.product.test.ts`: summary
  composition, reason validation.
- `components/feed/__tests__/notification-labels.test.ts` pins
  `account_secured`.

## Acceptance criteria

- [ ] An admin secures a member's account: every browser where the member was
      signed in is refused on its next write and signed out within 300 s, their
      API keys return 401, their RMHCode CLI is signed out, their webhooks stop
      receiving events.
- [ ] The preview lists the member's passkeys and linked accounts with dates.
- [ ] The member is not banned and can sign straight back in with their passkey.
- [ ] The member sees a notification and a security activity entry, without the
      admin's reason.
- [ ] The action is in the admin audit log with the reason.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Forcing a password reset, removing passkeys or OAuth links, securing an admin
account, bulk securing many accounts.
