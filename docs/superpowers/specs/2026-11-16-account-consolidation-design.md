# Account consolidation and email verification

Status: approved by the owner, 2026-11-16.

## Why

With eight ways to sign in (Discord, GitHub, Steam, Twitch, Microsoft, GitLab, X, email), one person can end
up with two RMH accounts: a Discord account and, after trying "Continue with Steam", a second, empty one. The
owner wants those joined the way large platforms do it, without ever creating a path to take over someone
else's account. Separately, email/password accounts need a complete verification flow; today verification is
enforced (when an email transport exists) but there is no way to resend a link and no screen that explains it.

## How the large platforms do it (the model)

Google, Microsoft, GitHub, Discord and Spotify do not merge two accounts that both have history. They and the
identity providers (Auth0, Clerk, Firebase Auth) do three things, and so does this design:

1. **Automatic joining only on two confirmed, matching emails.** A new provider sign-in whose verified email
   equals an account's verified email attaches to that account. Anything less is never joined silently.
2. **Otherwise the person proves it.** They sign in to the existing account and connect the new method.
3. **Settings lists every sign-in method**, with connect and disconnect, a recent sign-in required for
   changes, and a notice on every change.

## Goals

- Settings → Security → **Sign-in methods**: list, connect, disconnect, add or change email, email status.
- **Join an empty account**: right after a sign-in creates a new account, and in Settings while it stays empty,
  offer to move that sign-in method to an existing account.
- **Email verification**: check-your-inbox after sign-up, a clear message and a resend when signing in
  unverified, status and resend in Settings, a friendly landing for an expired link.

## Non-goals

- Merging two accounts that both have history (posts, coins, stats). An account with history keeps it; its
  sign-in method can still be moved by disconnecting it there and connecting it here.
- A one-time-code sign-in. The existing account is proven by signing in to it the normal way.

## Anti-goals (a failure even if it works)

- Any join decided by an email match alone, or by an unverified or placeholder email.
- Any join an attacker can start and a victim can finish.
- Any change to sign-in methods from a session the owner did not just create.

## Security rules

| Rule | Where it is enforced |
| --- | --- |
| Implicit joining needs the provider's email verified and the local email verified and equal | Better Auth (`requireLocalEmailVerified`, default true); `trustedProviders` stays empty |
| Placeholder addresses (`*.placeholder.invalid`) are never typed, emailed or joined | `isPlaceholderEmail`: before-hook on sign-up and change-email; `sendEmail` |
| Connect, disconnect, change email and the merge need a session created in the last 10 minutes | before-hook (`lib/auth/consolidation.server.ts`) |
| Never disconnect the last sign-in method | Better Auth `unlink-account` |
| Email changes: the new address is set only when its link is clicked; a verified account confirms from the old address first | Better Auth `changeEmail` + `sendChangeEmailConfirmation` |
| The empty-account merge is bound to the browser that started it, not to a link | signed, HttpOnly, SameSite=Lax cookie + hashed single-use intent, 15 minutes |
| The merge needs a sign-in to the target account **after** the intent was created | `session.createdAt >= intent.createdAt` |
| The source account is empty when started and when confirmed; all its sessions end at the start | schema-derived check (every foreign key to `user`) |
| Every change notifies the account (in-app, critical) and its confirmed email, and is logged | `security-notice.server.ts`, `logAdminAction` |
| Rate limits on start/confirm, resend and change-email | Better Auth `rateLimit.customRules` |

Explicit linking while signed in (`allowDifferentEmails: true`) is allowed to use a different email: proving
the provider identity is the OAuth round trip itself, and the recent sign-in rule stops a stolen session from
adding a way in. Implicit joining still matches by email and is unaffected by that flag.

## The merge, step by step

1. Signed in as the new account **B**, the person chooses "Use an existing account".
2. `POST /api/auth/account-merge/start` checks B is empty, stores `sha256(token)` with B's id for 15 minutes,
   sets the token in a signed cookie, ends every session of B and returns them to `/login`.
3. They sign in to **A** in that browser.
4. `/account/connect` (signed in as A) reads the pending intent through the cookie and names what will move:
   "Connect Steam (name) to this account?"
5. `POST /api/auth/account-merge/confirm` re-checks: intent valid, A ≠ B, A's session newer than the intent, B
   still empty. In one transaction it moves B's provider accounts and passkeys to A and deletes B. It notifies A
   and logs the merge.

The attack this blocks: an attacker starts a merge from their own fresh account and gets the victim to sign in.
The victim's browser never holds the attacker's cookie, so step 4 finds nothing.

"Empty" means: no row in any table with a foreign key to `user`, other than the rows a new account gets
automatically (its sign-in records, sessions and the tables listed in `EMPTY_ACCOUNT_ALLOWED_TABLES`). B's
email/password credential is never moved (a password belongs to an email); an account whose only method is a
password is not offered the merge.

## Email verification

- Enforced when an email transport is configured (`RESEND_API_KEY`), as today.
- `sendOnSignIn`: signing in unverified sends a fresh link; the login page says so and offers a resend.
- After sign-up with verification on, the login page shows "Check your inbox" with a resend.
- Links land on `/login`, which shows "Email confirmed" or "That link has expired".
- Settings shows the address, whether it is confirmed, and a resend.

## Left to the builder

Copy, exact component layout within the Steel settings grammar, the allowlist of automatic tables (measured
against a real sign-up), and test placement.
