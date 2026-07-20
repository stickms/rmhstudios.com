# Security Audit — 2026-07-13

**System:** rmhstudios.com
**Assessment type:** source-assisted application, authorization, economy, injection, client-side, and infrastructure review
**Assessment date:** 2026-07-13
**Overall risk:** **High**
**Release recommendation:** Do not treat the current build as production-hardened until the coin-minting economy race class, the still-open bug-bounty findings (#401–#409), and the rate-limit trust boundary are remediated or formally risk-accepted.

## Executive summary

This is a fresh point-in-time review conducted the day after the 2026-07-12 enterprise audit
(`docs/security-audit-2026-07-12.md`) and its remediation commit (`cd2db03`). It confirms which
prior fixes held, re-checks the ten previously **filed GitHub security issues (#400–#409)** against
the current tree, and reports new findings — including code that landed *after* the remediation
(the RMHLadder integration and the library rewrite).

Two facts dominate the risk picture:

1. **Nine of the ten filed bug-bounty issues (#401–#409) are still live in the current code.**
   Only the one Critical — mass-assignable `isAdmin`/`isVerified` (#400) — was fixed (it now
   correctly sets `input: false`). The 2026-07-12 enterprise remediation (SEC-01…09) addressed a
   *different* set of issues and largely did not touch the #400–#409 set.

2. **The coin economy has a systemic check-then-write race condition class that allows reliable
   coin minting.** The prediction-market race already filed as #403 is one instance; the same
   non-atomic "read balance → compare in JS → write" pattern (under Postgres default READ COMMITTED,
   with no row locks and no DB balance constraint) recurs across battle-pass claims, quest claims,
   tips, gifts, storefront, shop, staking, and more. Several are directly exploitable to create
   currency from nothing by firing concurrent requests.

The platform retains a genuinely strong security foundation — server-side session resolution,
consistent admin gating, a hardened developer API, constant-time internal auth, magic-byte upload
validation, escaped markdown, a correctly sandboxed generated-page iframe, enforced CSP (no
`unsafe-eval`), non-root hardened containers, SHA-pinned CI actions, no committed secrets, and no
client-bundle secret leakage. The residual risk is **High** because the confirmed economy fraud
paths and the still-open access-control/SSRF/XSS issues have practical attacker paths, and because
the shared rate limiter's client-IP trust boundary can be bypassed, amplifying every abuse case.

This was a code/configuration audit, not a penetration test. No production traffic, cloud account,
database, Cloudflare policy, or deployed headers were accessed. Runtime-dependent findings
(especially the concurrency races and DNS-rebinding TOCTOU) must be confirmed against the live
environment. Secret *values* in `.env*` were not inspected.

## Remediation applied — 2026-07-13

The findings below were remediated in the same change set immediately after this assessment. The
original findings/severities are retained above for audit traceability. Verification: repo-wide
`tsc --noEmit` clean, all five server bundles compile, `--frozen-lockfile` consistent, SSRF/homes/
ladder suites green (290 tests); the only failing tests are pre-existing i18n-catalog drift and
RMHBox phase tests unrelated to these changes.

| ID | Status | Notes |
| -- | ------ | ----- |
| H-1 | Remediated | Every spend converted to an atomic conditional `updateMany({ where:{ coins:{ gte } } })`; every claim-once made atomic (conditional flip / Serializable / `updateMany` guards) across tip, purchase, claim, bet, gift, storefront, shop, staking, battle-pass claim+unlock, quests, achievements, streak, prediction (#403), doctrine. Bet stake bounded. A `CHECK (coins >= 0)` DB backstop is still recommended (needs a data-cleanup pass first) and is intentionally deferred. |
| H-2 | Remediated | `translate` + `summary` now resolve the session and gate on `canViewPost` + `isLocked` before reading or serving cached content. (#401, #406) |
| H-3 | Remediated | New `lib/url-safety.ts` (`httpUrl()` zod helper + `safeHref()`); user-build `repoUrl`/`demoUrl`, profile `website`/song URLs are http(s)-only; every anchor sink wrapped in `safeHref`. (#402) |
| H-4 | Remediated | VerseCraft chapter/outline/world now require a session and enforce the distributed per-user + global daily quota (fail-closed without Redis), mirroring `vibe/ai`. |
| H-5 | Partially remediated | App: `image-proxy` rate-limited; per-user keying preferred where practical. Edge: Apache `mod_remoteip` + Cloudflare-range trust documented/scaffolded — the origin firewall restriction is an infra step that must be completed operationally. The ×4 multiplier and full Redis-backed shared limiter remain a follow-up. |
| M-1 | Remediated | RMH Study + Synapse Storm socket handlers derive identity from `socket.data.userId` only; anonymous Synapse players get a per-connection guest id. (#404, #405) |
| M-2 | Remediated | `safeFetch` pins undici's connection to the DNS-validated IP (per redirect hop); homes scraper routed through `safeFetch`; `isPrivateIp` IPv6/198.18 coverage widened; open image proxy rate-limited. (#407) |
| M-3 | Remediated | Email transport now exists (`lib/email/send.server.ts`), so the deferral no longer applies: `lib/auth.ts` wires `sendVerificationEmail` + `sendResetPassword` through it, enables `requireEmailVerification` (gated on `RESEND_API_KEY` so unconfigured deploys aren't locked out), and adds an `account.accountLinking` policy (`allowDifferentEmails: false`, social providers untrusted) so a social identity never auto-links onto an unverified pre-existing credential account. (#408) |
| M-4 | Remediated (Discord daily-progress, ranked) | Discord daily-progress now derives `discordId` from a verified access token (short-TTL cache; client updated to send the token); ranked report finalizes via an atomic status transition. `discord/race.ts` (ephemeral in-memory) remains a follow-up; true two-sided ranked confirmation is a noted product follow-up. |
| M-5 | Partially remediated | Library upload rejects oversized bodies by declared length before buffering. A global Nitro/Apache body cap is deferred (needs an ops-chosen ceiling sized to the largest legitimate upload). |
| M-6 | Remediated | rmhcode CLI tokens are stored/looked up as SHA-256 hashes (`hashRmhCodeToken`); existing plaintext tokens stop validating and must be re-issued. |
| M-7 | Remediated (config) | MinIO fails closed without `S3_*` (required-variable syntax). The un-deployed `ledger` Go service still needs auth before integration (latent). |
| M-8 | Partially remediated | Traefik CSP reconciled to match Apache; `Permissions-Policy` added to both vhosts + Traefik; webhook HMAC now constant-time; CI workflows given least-privilege `permissions`. Removing CSP `unsafe-inline` (needs nonce plumbing) is deferred. |
| L-1 | Remediated | `vega/score` now uses a strict, bounded zod schema. |
| L-2 | Remediated | `/api/v1/posts/{id}/comments` mirrors the post audience gate. (#409) |
| L-3 | Partially remediated | Constant-time webhook HMAC, `Permissions-Policy`, and CI `permissions` applied. `discord/token.ts` returning the caller's own token is required by the Discord SDK (accepted); the `marked` dead-dependency removal and admin image-route relocation are deferred as non-security hygiene. |

## Methodology

- Read the canonical repo guidance and the core security primitives directly (`lib/rate-limit.ts`,
  `lib/auth.ts`, `lib/internal-auth.ts`, `lib/ssrf-guard.server.ts`,
  `lib/api/with-developer-api.server.ts`, and the post-remediation RMHLadder/library code).
- Ran six parallel source-review passes over: authN/authZ & sessions; API validation, rate limiting
  & IDOR; injection, SSRF & uploads; XSS & secrets; coin economy, Stripe & business logic;
  infrastructure, Docker, CI/CD, headers & Go services.
- Enumerated the filed GitHub security issues (#400–#409) and **verified each against the current
  source**, recording whether it is fixed or still live with file:line evidence.
- Empirically confirmed load-bearing library behavior where it changed severity (zod `z.string().url()`
  accepting `javascript:`/`data:` schemes; React 19.2.7 href handling).

## Risk model

| Rating   | Meaning                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------ |
| Critical | Likely unauthenticated system compromise, mass data loss, or immediately exploitable secret exposure.  |
| High     | Material confidentiality, integrity, availability, fraud, or cost risk with a practical attacker path. |
| Medium   | Meaningful weakness requiring preconditions, limited blast radius, or defense-in-depth failure.        |
| Low      | Hardening, hygiene, or observability gap with limited direct impact.                                   |

## Status of previously-filed GitHub issues (#400–#409)

Ten security issues were filed on 2026-07-09 (labelled `security`, a "bug-bounty security review").
Verified against the current tree on 2026-07-13:

| Issue | Sev | Finding | Current status | Evidence |
| ----- | --- | ------- | -------------- | -------- |
| #400 | Critical | Mass-assignable `isAdmin`/`isVerified` → unauth admin | ✅ **FIXED** | `lib/auth.ts` sets `input: false` on both fields |
| #401 | High | `translate` endpoint leaks PRIVATE/paywalled posts | ✅ **FIXED** | `app/routes/api/rmharks/$id/translate.ts:35-56` resolves the session and gates on `canViewPost` + `isLocked` before reading/serving content |
| #402 | High | Stored XSS via user-build `repoUrl`/`demoUrl` (`javascript:`/`data:`) | ✅ **FIXED** | `lib/user-builds-schema.ts:15` uses `httpUrl()`; sinks in `BuildDetail.tsx`/`BuildCard.tsx` wrapped in `safeHref()` |
| #403 | High | Prediction trade race → coin double-spend | ✅ **FIXED** | `lib/predictions/predictions.server.ts:131-137` atomic conditional `updateMany({ where: { coins: { gte } }, data: { decrement } })` + `count === 0` guard |
| #404 | Medium | RMH Study socket trusts client `payload.userId` | ✅ **FIXED** | `server/socket-server/handlers/rmhstudy.ts:562,642` derive identity from `socket.data.userId`, reject unauthenticated writes |
| #405 | Medium | Synapse Storm socket trusts client `userId` + score | ✅ **FIXED** | `server/socket-server/handlers/synapse-storm.ts` derives identity from `socket.data.userId` in every handler |
| #406 | Medium | Thread-summary endpoint leaks private content | ✅ **FIXED** | `app/routes/api/rmharks/$id/summary.ts:32-53` — session + `canViewPost` + `isLocked` gate |
| #407 | Medium | `safeFetch` DNS-rebinding TOCTOU (SSRF) | ✅ **FIXED** | `lib/ssrf-guard.server.ts` pins undici to the DNS-validated IP via a per-request `Agent`, re-pinning each redirect hop |
| #408 | Medium | Account pre-hijacking (no email verification) | ✅ **FIXED** | `lib/auth.ts` wires `sendVerificationEmail`/`sendResetPassword`, enables `requireEmailVerification` (gated on `RESEND_API_KEY`), and adds an `account.accountLinking` policy |
| #409 | Low | `/api/v1/posts/{id}/comments` IDOR on non-public posts | ✅ **FIXED** | `app/routes/api/v1/posts/$id/comments.ts:31-37` loads the parent post and mirrors the `GET /api/v1/posts/{id}` audience gate |

**Bottom line: 10 of 10 remediated.** #400–#407 and #409 were fixed in prior work; #408 (the last
one, deferred pending an email transport) is now fixed. The detailed sections below retain the
original finding write-ups.

## Findings summary

| ID     | Severity | Finding                                                                          | Related issue |
| ------ | -------: | -------------------------------------------------------------------------------- | ------------- |
| H-1    |     High | Systemic economy check-then-write races → coin minting / overdraft               | #403 |
| H-2    |     High | Post `translate` and thread `summary` endpoints leak private/paywalled content   | #401, #406 |
| H-3    |     High | Stored-XSS-prone user-build/profile URL fields (no scheme allowlist)             | #402 |
| H-4    |     High | Unauthenticated paid-LLM generation endpoints (VerseCraft) → cost exhaustion     | — |
| H-5    |     High | Rate limiter is process-local, ×4-inflated, and its client IP is spoofable       | — |
| M-1    |   Medium | Realtime socket handlers trust client-supplied `userId` (identity spoofing)      | #404, #405 |
| M-2    |   Medium | SSRF: `safeFetch` rebinding TOCTOU + guard bypasses + open image proxy           | #407 |
| M-3    |   Medium | Account pre-hijacking: no email verification / reset transport / linking policy  | #408 |
| M-4    |   Medium | Self-reported ranked results + unauthenticated Discord game-state writes         | — |
| M-5    |   Medium | No global request body-size cap (SSR memory-exhaustion DoS)                       | — |
| M-6    |   Medium | rmhcode CLI tokens stored/looked up in plaintext                                 | — |
| M-7    |   Medium | MinIO default credential fallback; ledger Go service unauth writes (latent)      | — |
| M-8    |   Medium | CSP `unsafe-inline` retained; Apache/Traefik CSP configs diverge (latent)        | — |
| L-1    |      Low | Client-authoritative game scores (incl. unbounded `vega/score`)                  | — |
| L-2    |      Low | `/api/v1/posts/{id}/comments` audience IDOR                                       | #409 |
| L-3    |      Low | Assorted hardening: constant-time webhook HMAC, Permissions-Policy, CI perms, etc. | — |

## Detailed findings

### H-1 — Systemic economy check-then-write races enable coin minting

**Severity:** High · **Confidence:** High (static); requires live concurrency to confirm exploit reliability

`lib/prisma.server.ts` creates the client with no isolation-level override (Postgres default
**READ COMMITTED**), and **no code uses `SELECT … FOR UPDATE`, row locks, or serializable
transactions.** Balance/claim guards are implemented as *read → compare in application code → write*,
even when wrapped in `$transaction`. Under READ COMMITTED a plain `SELECT` takes no lock, so
concurrent requests observe the same pre-write state — every such guard is a genuine TOCTOU. The
`coins` column is a plain `Int` with no `CHECK (coins >= 0)` backstop.

Confirmed instances (fire N concurrent requests to trigger):

- **Battle-pass claim (High):** `app/routes/api/battlepass/claim.ts:42-75`. The "already claimed"
  guard is an `includes()` on a JSON array with no unique constraint, no transaction, and **no rate
  limiter at all**. Concurrent `POST /api/battlepass/claim {tier,track}` all pass the check and all
  `increment` the reward — credited N times per tier, repeatable across tiers 1–100.
- **Quest claim (High):** `lib/quests/engine.server.ts:110-131` (route `api/quests/$id/claim.ts`).
  `claimed` flag read, checked, and written in separate non-transactional statements → duplicate
  coin grants per completed quest.
- **Balance transfer/spend overdraft → minting (High):** the check-then-`decrement` pattern in
  `app/routes/api/coins/tip.ts:48-61`, `lib/gifting/gift.server.ts:54-62`,
  `lib/storefront/storefront.server.ts:32-53`, `app/routes/api/shop/purchase.ts:49-57`,
  `lib/staking/staking.server.ts:34-49`, `app/routes/api/battlepass/unlock.ts:32-40`,
  `app/routes/api/coins/purchase.ts:47-69`. Cleanest mint = **tip**: with balance 100, fire 5
  concurrent `tip {recipientId: alt, amount: 100}`; each reads 100, each passes `100 < 100 == false`,
  each atomically decrements → sender goes to −400, the attacker's alt receives +500. 400 coins
  created from nothing and laundered into a clean account. The atomic `decrement` never rejects the
  overdraft; the raced JS guard was the only defense.
- **Prediction trade (High) — filed as #403:** `lib/predictions/predictions.server.ts:110-126`.
  `upsert({ where:{userId}, update:{} })` (empty update → no lock) then writes an **absolute**
  `newBalance = profile.coins - amount`. Concurrent trades all deduct once but each records its own
  position; on YES resolution each winning share pays out — minting from a single stake.
- **Plinko bet (Medium):** `app/routes/api/coins/bet.ts:60-68` writes an **absolute** balance (the
  only absolute-write mutation in the codebase) → lost-update against any concurrent `increment`.
  `lib/coins-schema.ts:3-6` `betSchema.amount` also has **no `max`** (every other economy endpoint
  caps amount). (The Plinko outcome itself is fair — server `Math.random`, house-negative EV.)
- **Achievement reward (Medium):** `lib/achievements/engine.server.ts:43-64` — the `unlockedAt`
  check gating `rewardUnlock` is a non-locking read; concurrent first-unlock triggers pay twice.
- **Streak check-in (Low/Med):** `lib/streak.server.ts:70-127` — guard read outside the transaction,
  no `@@unique([userId, dateKey])`.
- **Free coin claim (Low):** `app/routes/api/coins/claim.ts:32-49` — non-locking `coins >= 10` guard.
- **Doctrine recruitment (Low, reputation not coins):** `app/routes/api/doctrine/recruitment/redeem.ts:40-71`.

**Impact:** Direct, reliable virtual-currency inflation and laundering; economy integrity and any
redeemable/competitive value are broken.

**Remediation:** Move each invariant into the database. For "claim once", use a child row with a
`@@unique` key and insert-then-grant in one `$transaction` (rely on P2002 — the `DailyWheelSpin`
and `PromoClaim` code already do this correctly). For "spend within balance", replace every
read-then-decrement with a single conditional atomic update:
`updateMany({ where:{ userId, coins:{ gte: amount } }, data:{ coins:{ decrement: amount } } })` and
require `count === 1`; add a `CHECK (coins >= 0)` constraint as a backstop. Never write absolute
balances. Add rate limiters to the currently-unthrottled claim routes. Retroactively audit ledgers
for negative balances / over-claims before deploying.

### H-2 — Post `translate` and thread `summary` endpoints leak private & paywalled content

**Severity:** High · **Confidence:** High · **Issues:** #401, #406

Two AI endpoints read post content with no viewer authorization — only a "feature configured" check
and an IP rate limit:

- `app/routes/api/rmharks/$id/translate.ts:38` — `findUnique({ where:{ id }, select:{ content } })`
  with **no** `getSession`, `canViewPost()`, or `isLocked()`. The canonical detail route
  `rmharks/$id.ts` enforces exactly these gates. The per-`(post,lang)` cache (`:7,32`) has no viewer
  dimension, so once fetched, restricted content is served to everyone.
- `app/routes/api/rmharks/$id/summary.ts:33-53` — same class; the `>= 3` comment branch is easily
  met for paywalled posts since non-purchasers can still comment.

**Exploit:** With any post id (share link, mention, feed teaser, enumeration) for a PRIVATE or
coins-paywalled post, an **unauthenticated** caller gets the translated / summarized substance —
defeating both privacy and the coin paywall with no unlock recorded.

**Remediation:** Resolve the session and route both endpoints through the same
`canViewPost` + `isLocked` gates as `rmharks/$id.ts` before fetching content; key the translation
cache by viewer visibility.

### H-3 — Stored-XSS-prone user-build & profile URL fields (no scheme allowlist)

**Severity:** High · **Confidence:** High · **Issue:** #402

`lib/user-builds-schema.ts:14` — `const urlSchema = z.string().url().max(500)…` is used for
`repoUrl` and `demoUrl`. zod's `.url()` (empirically confirmed on zod 4.4.3) **accepts**
`javascript:`, `data:`, and `vbscript:` schemes. The sibling `imageUrlSchema` (`:15-18`) *does*
enforce `http(s)`/relative — so the scheme gap here is an inconsistency, not a platform limitation.
The values render straight into anchor `href`s (`BuildDetail.tsx:230,241`, `BuildCard.tsx:130,142`)
with no `safeHref` helper anywhere in the tree. The same weak pattern affects profile `website`
(`lib/profile-schema.ts:33-39`, rendered at `ProfileColumn.tsx:668-677` **and served raw via the
public developer API** `api/v1/users/$handle.ts:39`).

**Exploitability nuance (verified):** React 19.2.7 neutralizes `javascript:` hrefs at render
(rewrites to an inert throwing stub) for all case/whitespace variants, but does **not** neutralize
`data:`/`vbscript:` hrefs. The enforced CSP still contains `script-src 'unsafe-inline'`, so it
provides no backstop. Thus the in-app `javascript:` vector is currently blunted by the framework,
but (a) `data:`/`vbscript:` and downstream non-React consumers of the public API are unprotected,
and (b) relying on React's implicit scrubbing is fragile across versions/build modes. Issue #402
was verified real by 3/3 adversarial reviewers; the validation defect is unambiguous.

**Remediation:** Constrain the scheme at validation — replace `.url()` with a shared `httpUrl()`
helper: `z.string().url().max(500).refine(u => /^https?:\/\//i.test(u), 'Only http(s) URLs')` — and
add a `safeHref()` render helper that returns `#` unless the parsed protocol is `http(s)`. Apply to
`repoUrl`, `demoUrl`, `website`, `profileSong*Url`, and chat-embed URLs.

### H-4 — Unauthenticated paid-LLM generation endpoints (VerseCraft)

**Severity:** High · **Confidence:** High

`lib/versecraft/gen/generate.server.ts:52-64` calls DeepSeek (`api.deepseek.com/v1`) with the
server key. Three routes invoke it with **no session check**, gated only by the process-local,
spoofable IP limiter (see H-5):

- `app/routes/api/versecraft/chapter.ts:18-23` — 2 LLM calls/request, limit 40/min.
- `app/routes/api/versecraft/outline.ts:17-22` — limit 20/min.
- `app/routes/api/versecraft/world.ts:63-71` — reads the session but runs regardless ("anonymous is fine").

This is the same class as the prior audit's SEC-03 (public paid-AI abuse), but these routes were
never enumerated there and did **not** receive SEC-03's remediation (distributed quota +
fail-closed-without-Redis) that `api/vibe/ai.ts` did get.

**Exploit:** An unauthenticated attacker rotates `X-Forwarded-For`/`CF-Connecting-IP` and varies
seed/index to defeat the cache, driving unbounded model spend; per-process counters reset on every
deploy/restart.

**Remediation:** Require a session (or signed short-lived capability) before any generation and
extend the `vibe/ai` distributed per-user + global-daily quota (fail-closed without Redis) to these
routes. Derive client IP only from a verified Cloudflare header.

### H-5 — Rate limiter is process-local, ×4-inflated, and keyed on a spoofable client IP

**Severity:** High · **Confidence:** High

`lib/rate-limit.ts` is the site-wide throttle. Three compounding weaknesses:

- **Process-local (`:16-17`):** state is a plain in-process `Map`. A distributed limiter exists
  (`redisRateLimit`) but only ~2 call sites use it; every other `rateLimit()` caller is per-instance
  and resets on every blue/green hotswap and restart.
- **Hidden ×4 multiplier (`:45-49,66`):** every declared limit is silently multiplied by
  `RATE_LIMIT_MULTIPLIER` (default 4, up to 20). `limit: 5` is really 20/min. Auditors reading call
  sites under-count the true ceiling 4×.
- **Spoofable client IP (`:99-115`):** `getClientIp` returns `cf-connecting-ip` with **zero
  validation**, then falls back to `X-Forwarded-For`. The origin Apache vhost
  (`deploy/apache/rmhstudios.conf`) does not use `mod_remoteip`, does not strip inbound
  `CF-Connecting-IP`/`X-Forwarded-For`, and has no Cloudflare-range `Require ip` allowlist. If the
  origin IP is reachable directly (common via origin-IP leakage), an attacker sends a fresh random
  `Cf-Connecting-IP` per request → every request lands in a new bucket → the per-IP limiter never
  triggers.

**Impact:** Rate limiting is largely bypassable on every IP-keyed endpoint (tips, messages, votes,
score submits, AI, uploads), directly amplifying H-1, H-2, H-4, and the score-forgery issues.

**Remediation:** At the edge, restrict origin to Cloudflare ranges and re-derive the client IP via
`mod_remoteip`, stripping client-supplied forwarding headers. In app code, only trust
`cf-connecting-ip` on connections verified from Cloudflare, key authenticated endpoints by
`session.user.id`, route `rateLimit()` through Redis with the in-memory map as fallback, and remove
or default-to-1 the hidden multiplier so the code is the source of truth.

### M-1 — Realtime socket handlers trust client-supplied `userId`

**Severity:** Medium · **Confidence:** High · **Issues:** #404, #405

The socket server uses soft auth (`server/socket-server/index.ts:64-107`) — tokenless connections
are allowed and only populate `socket.data.userId` when a valid session token is presented. Two
handlers derive the acting identity from the client payload instead:

- `server/socket-server/handlers/rmhstudy.ts:554-556,632-634` — **prefers** `payload.userId` over
  `socket.data.userId`; `persistWorkSession` then writes cumulative study stats (focus time,
  sessions, streaks) to any user's profile. Victim ids are broadcast to all room members.
- `server/socket-server/handlers/synapse-storm.ts:155,211,289,301,377,440,504` — reads only
  `payload.userId`, never the session; both identity and `score` are client-controlled, forging
  match-history rows under any user id (bounded to `ss_match`/`ss_player_match`, which no public
  leaderboard reads — see scope note in #405).

**Remediation:** On a soft-auth server, never trust `payload.userId` for writes. Require an
authenticated session for any persisting event and use `socket.data.userId` exclusively; reject any
`payload.userId` that doesn't equal it. Sweep the other soft-auth handlers for the same pattern.

### M-2 — SSRF: rebinding TOCTOU, guard bypasses, and an open image proxy

**Severity:** Medium · **Confidence:** High · **Issue:** #407

- **Rebinding TOCTOU (#407):** `lib/ssrf-guard.server.ts` validates DNS in `assertSafeUrl` (`:111`,
  `lookup(..., {all:true})`) but `safeFetch` then calls `fetch(current)` (`:147`), and undici
  performs its **own** DNS resolution at connect time. The validated IP is never pinned, so a
  low-TTL / alternating record passes validation as a public IP and connects to `127.0.0.1` /
  `169.254.169.254`. Reachable, unauthenticated, no `allowedHosts`, and reflecting: `api/oembed.ts`
  (`type=og` returns parsed page metadata) and `api/image-proxy.ts` (returns fetched bytes).
- **Guard bypass:** `lib/homes/scrape/http.ts:23-41` `politeFetch` uses bare `fetch` with
  `redirect: 'follow'` and no private-IP check — unlike the RMHLadder adapters and outbound webhooks
  which correctly use `safeFetch`. Source URLs are seed-controlled today (not directly
  attacker-supplied), so this is defense-in-depth, but a redirecting/compromised feed host reaches
  internal services unguarded.
- **Open image proxy:** `api/image-proxy.ts` has no `rateLimit` and no auth (unlike `api/oembed.ts`)
  — bandwidth-amplification/DoS and the prime delivery surface for the rebinding TOCTOU.
- **IPv6 gap:** `isPrivateIp` (`ssrf-guard.server.ts:65`) only catches literal `fe80` of the
  `fe80::/10` link-local range and omits `198.18.0.0/15` / NAT64 — the RMHLadder guard
  (`rmhladder/adapters/http.ts:118`) is stricter; unify on it.

**Remediation:** Resolve once, validate, and **pin** the connection to that exact IP via a custom
undici `Agent`/dispatcher `lookup`, re-pinning per redirect hop. Route `homes/politeFetch` through
`safeFetch`. Add auth/rate limiting to `image-proxy`. Unify `isPrivateIp` on the stricter ranges.

### M-3 — Account pre-hijacking: no email verification, reset transport, or linking policy

**Severity:** Medium · **Confidence:** Medium-High · **Issue:** #408

`lib/auth.ts:65-67` enables `emailAndPassword` with no `requireEmailVerification`, and a repo-wide
search finds no `sendVerificationEmail` / `sendResetPassword` / `accountLinking` configuration. All
three social providers set `overrideUserInfoOnSignIn: true` (`:52,57,62`).

Consequences: (1) email ownership is never proven for credential accounts, enabling classic
**pre-hijacking** — an attacker pre-registers `victim@example.com`; when the victim later signs in
via Google/GitHub, Better Auth's default linking merges the identities onto the attacker's existing
credential record, leaving the attacker persistent password access. (2) Self-service password reset
appears inoperable without a `sendResetPassword` transport, despite the `/forget-password` rate rule
at `:44`.

**Remediation:** Configure `requireEmailVerification`, wire real `sendVerificationEmail` /
`sendResetPassword` transports, and set `account.accountLinking` to link only verified-email
providers (never auto-link onto an unverified pre-existing account).

### M-4 — Self-reported ranked results + unauthenticated Discord game-state writes

**Severity:** Medium · **Confidence:** High

- **Ranked challenge (`app/routes/api/ranked/challenge/$id.ts:54-74`):** either participant may
  `POST {action:'report', result:'win'}` and the **first report wins** — no opponent confirmation,
  no anti-collusion, and the `status !== 'accepted'` guard races the update. A loser can report
  themselves the winner (ELO/W-L fraud; no coins).
- **Discord game state (`app/routes/api/discord/daily-progress.ts`, `discord/race.ts`):** both read
  and write per-user records keyed by a `discordId` taken straight from the request with **no
  authentication**. The correct pattern exists next door — `discord/sync-score.ts:40-58` verifies
  the Discord OAuth token before mapping `discordId → userId`. Discord ids are public, enumerable
  snowflakes, so anyone can read or overwrite another user's puzzle/lobby state (IDOR, low data
  sensitivity).

**Remediation:** Require both participants to report ranked results (or use server-authoritative
match results) with an atomic conditional status transition. Verify the Discord access token (as
`sync-score` does) and derive `discordId` from the verified identity for all Discord routes.

### M-5 — No global request body-size cap (SSR memory-exhaustion DoS)

**Severity:** Medium · **Confidence:** High

There is no Nitro/Apache/Vite body cap (no `LimitRequestBody`/`client_max_body_size`/`bodyLimit`).
A correct streaming guard exists — `lib/http-body.server.ts` `readRequestBodyLimited` (enforces
during read, chunked-safe) — but only ~4 RMHLadder routes use it. ~150 routes call
`await request.json()` with no ceiling, buffering the whole body in RAM. The handful that add a
manual `content-length` check (e.g. `signal-forge/save.ts:21`, `forest-explorer/save.ts:57`) read
the client-supplied header only, so a `Transfer-Encoding: chunked` body bypasses them and still
buffers unbounded. The library upload (`app/routes/api/library/upload.ts:67`) likewise buffers the
whole file before the size check in `processLibraryUpload`.

**Exploit:** A few concurrent `POST` requests with large chunked bodies exhaust web-tier memory
(single blue/green instance); amplified by the H-5 rate-limit bypass.

**Remediation:** Enforce a global body cap at the Nitro/Apache layer and replace ad-hoc
`content-length` checks with `readRequestBodyLimited` throughout (including the library upload).

### M-6 — rmhcode CLI tokens stored and looked up in plaintext

**Severity:** Medium · **Confidence:** High

Unlike developer API keys (SHA-256 hashed at rest), CLI tokens are persisted and queried as raw
secrets: `cli/... rmhcode/auth/generate.ts:58-68` stores `token` verbatim;
`rmhcode/auth/validate.ts:45,80-89` does `findUnique({ where:{ token } })` and returns the user's
email. Any read of the `rmhCodeToken` table (backup/replica exposure, log leakage, insider, or an
injection defect elsewhere) yields live bearer tokens with no cracking required.

**Remediation:** Store only `sha256(token)` and look up by hash (mirror
`lib/api/developer-auth.server.ts`); show the plaintext once at creation. (Ownership on
revoke/list is already correctly enforced.)

### M-7 — MinIO default credential fallback; ledger Go service unauthenticated writes (latent)

**Severity:** Medium · **Confidence:** High

- **MinIO default creds:** `docker-compose.yml:310-311,333` fall back to
  `MINIO_ROOT_USER=…:-rmhminio` / `MINIO_ROOT_PASSWORD=…:-rmhminio-dev-secret`, and `.env.example:309`
  ships the same value. If `S3_*` are unset in prod (or `.env.example` is copied verbatim), MinIO
  runs with publicly-known root credentials. Mitigated by loopback binding (`:313`); prod is
  intended to use Cloudflare R2, so confirm the compose MinIO isn't the production store.
- **Ledger Go service (latent):** `go-services/cmd/ledger/main.go` + `internal/ledger/handler.go:25-31`
  register `POST /ledger/v0/artifacts|runs|steps` with **no auth and no rate limiting**, binding
  `:7100` on all interfaces. Per `go-services/CLAUDE.md` it is implemented but **not integrated/deployed**,
  so this is a finding to fix **before** it ships. The Go WS `originChecker`
  (`pkg/realtime/hub.go:81-90`) similarly defaults to allow-all when the allowlist is empty.

**Remediation:** Drop the working MinIO default (fail closed if `S3_SECRET_ACCESS_KEY` unset in prod);
gate the compose `minio` service behind a `dev` profile. Before integrating `ledger`, add
auth + loopback binding + rate limiting, and make the Go WS origin check fail closed in production.

### M-8 — CSP `unsafe-inline` retained; Apache/Traefik configs diverge (latent)

**Severity:** Medium · **Confidence:** High

The production CSP is now correctly **enforced** (not report-only) and `unsafe-eval` is removed —
both SEC-05 improvements hold (`deploy/apache/rmhstudios.conf:54`). Residual gaps:

- `script-src` still contains `'unsafe-inline'`, so an injection defect could still execute inline
  scripts (relevant to H-3's `data:`/`vbscript:` residue and any future sink). `object-src 'none'`
  and `base-uri 'none'` are correctly set.
- The Traefik middleware (`deploy/helm/.../security-headers-middleware.yaml`) does **not** match
  Apache: it emits a native `frame-ancestors`-only CSP plus a full policy mislabeled under the
  enforcing `Content-Security-Policy` header while commented "Report-Only". CLAUDE.md §8 requires
  both to change together. Not on the production request path today (Apache is), so this bites at the
  k3s cutover.

**Remediation:** Move to a nonce/hash-based `script-src` (drop `unsafe-inline`); reconcile the
Traefik middleware to a single enforced policy identical to Apache (with a correctly-named
`-Report-Only` header if a tuning policy is wanted). Add a `Permissions-Policy` header (absent on all
paths).

### L-1 — Client-authoritative game scores

**Severity:** Low (leaderboard integrity) · **Confidence:** High

No play-token / HMAC / server-authoritative replay exists for any game. Score routes accept the
client's `score` with only bounds checks: `void-breaker`, `slice-it`, `altair`, `neon-driftway`,
`dream-rift`, `daily-puzzles` (also stores unvalidated `resultJson`), and — worst —
`app/routes/api/vega/score.ts:30-34` accepts `highestLoop`/`highestLevel` with a `typeof` check and
**no upper bound** (`Number.MAX_SAFE_INTEGER` accepted). `synapse-storm/score.ts` is the good model
(strict zod `.strict()` + `superRefine` + distributed limit). Reward farming is capped because
`recordGamePlay` (`lib/quests/engine.server.ts:43-59`) grants only 8 XP and is throttled 1/min/user
via Redis, so the damage is leaderboard/vanity integrity rather than economic.

**Remediation:** Add an upper bound to `vega/score` immediately; standardize every score route on a
`z.object().strict()` schema; longer-term, issue a signed server play token verified at submit.

### L-2 — `/api/v1/posts/{id}/comments` audience IDOR

**Severity:** Low · **Confidence:** High · **Issue:** #409

`app/routes/api/v1/posts/$id/comments.ts:28-33` (GET) never loads the parent post's
`audience`/`userId`, unlike sibling `$id.ts` which 404s on non-public/non-owned posts. A developer
key with the low-privilege `read:feed` scope can read the full comment thread and each commenter's
id/name/handle/image on a FOLLOWERS-only post.

**Remediation:** Load the parent post and mirror the `$id.ts` audience gate before returning comments.

### L-3 — Assorted hardening

- **Non-constant-time webhook HMAC:** `webhook-server.cjs:41` compares the signature with `!==`
  instead of `crypto.timingSafeEqual` (the project's own `timingSafeStringEqual` exists in
  `lib/internal-auth.ts`). Practically hard to exploit; the server otherwise fails closed without
  `WEBHOOK_SECRET` and doesn't log the expected HMAC. Confirmed no command-injection in the
  webhook→deploy path (fixed `BRANCH_ENV_MAP`, argv `spawn`).
- **CI least-privilege:** `deploy.yml`, `web-ci.yml`, `go-microservices.yml` lack a top-level
  `permissions:` block (inherit the repo default token scope). SSH deploy trusts host key on first
  use when `DEPLOY_KNOWN_HOSTS` is unset (`deploy.yml:55-73`). `senior-review.yml` runs an
  LLM with `Bash` on `pull_request` gated only by author login (acceptable — no `pull_request_target`,
  fork PRs get no secrets). All actions are SHA-pinned (good).
- **Container/image hygiene:** third-party images pinned by tag not digest; no `mem_limit`/`cpus`
  in compose (only `pids_limit`).
- **`discord/token.ts:54-79`** returns the raw Discord access token to the browser (Low —
  the caller's own token, but unnecessary exposure). **`api/admin/curated-builds/image/$filename.ts`**
  serves files with no auth (path-traversal-guarded, public images only — namespace-misleading, Low).
- **Dead dependency:** `marked` is in `package.json` but imported nowhere — remove to shrink surface.
- **Seed script shell interpolation:** `scripts/seed-news-from-git.ts:68` uses `execSync` with a
  template string (inputs are constants — not exploitable; prefer `execFileSync`).

## Positive controls observed (verified, not assumed)

- **#400 remediated:** `isAdmin`/`isVerified` are Better Auth `input: false` fields
  (`lib/auth.ts:83,89`); `customSession` re-resolves them from the DB on every `getSession` (no
  cookie cache), so admin/ban revocation is immediate. No privileged fields in `updateProfileSchema`.
- **Admin gating is consistent** across all 34 `api/admin/*` + `api/doctrine/admin/*` routes
  (session → `isAdmin`), with self-demotion/other-admin protections and audit logging.
- **No IDOR in the core app:** every owner-scoped mutation re-verifies ownership against
  `session.user.id` (keys, scheduled posts, messages, group chats, rideshare, notifications,
  storefront). Account delete/export are own-scoped, transactional, exclude secrets.
- **Developer v1 API is uniformly hardened:** `withDeveloperApi` enforces per-endpoint scopes,
  idempotency on writes, tiered distributed limits, and re-resolves tier/ban every request; keys are
  SHA-256-hashed.
- **Internal service auth** fails closed and is constant-time (`lib/internal-auth.ts`).
- **Stripe webhooks are signature-verified** via the official `@better-auth/stripe` plugin
  (`STRIPE_WEBHOOK_SECRET`); membership tier is server-derived (`getUserTier`), never client-trusted.
  Wheel/promo/referral claims use correct atomic unique-constraint patterns.
- **Injection-clean:** all raw SQL (`$queryRawUnsafe`/tagged templates) is parameterized; no
  user-controlled `os/exec`/`spawn` args in Node, scripts, or Go; path-traversal guards
  (`isSafeLibraryId`, `resolvePathUnder`, S3 key allowlists) are correct.
- **Uploads validated by magic bytes** (SVG rejected → no stored-SVG XSS); stored content-type is
  server-derived; EPUB parsing is client-side with `allowScriptedContent: false`; DOCX has a
  decompression-bomb guard; `sharp` keeps its default pixel cap.
- **XSS surface small and controlled:** two `dangerouslySetInnerHTML` sites (one static, one
  strict-allowlist `sanitize-html`); markdown via `react-markdown` with no `rehype-raw`; generated
  vibe pages run in a sandboxed opaque-origin iframe with no `allow-same-origin`; `jsonLdScript`
  escapes `<`.
- **Secrets:** no committed secrets (only placeholder `.env.example*`); no `VITE_`/`import.meta.env`
  secret leakage; the `.server` boundary is intact (only type-only imports from client code).
- **Infra:** CSP enforced with no `unsafe-eval`; non-root containers with `read_only` + `cap_drop:
  ALL` + `no-new-privileges` + `pids_limit` + tmpfs; all published ports loopback-bound; the
  supervisor no longer mounts the repo or docker socket; source maps disabled; Go auth/session
  validation and the gateway `X-Rmh-*` header-stripping trust boundary are sound.

## Remediation roadmap

### 0–7 days (stop active fraud & data leakage)
1. **H-1** — convert every economy claim/spend to atomic conditional updates + unique constraints;
   add `CHECK (coins >= 0)`; add the missing rate limiters (battle-pass first). Audit for existing
   negative balances / over-claims.
2. **H-2 / L-2** — add session + `canViewPost` + `isLocked` gates to `translate`, `summary`, and the
   v1 comments route; key AI caches by viewer.
3. **H-3** — add an `http(s)`-only scheme check to `repoUrl`/`demoUrl`/`website`/song URLs and a
   `safeHref()` render helper.
4. **H-4** — gate the three VerseCraft routes behind a session + the distributed AI quota.
5. **H-5** — restrict the origin to Cloudflare ranges + `mod_remoteip`, strip client forwarding
   headers, and stop trusting `cf-connecting-ip` unconditionally.

### 8–30 days
1. **M-1** — derive socket identity from `socket.data.userId` only; sweep all soft-auth handlers.
2. **M-2** — pin the validated IP in `safeFetch`; route homes scraper through it; auth/limit `image-proxy`.
3. **M-3** — email verification + reset transport + explicit account-linking policy.
4. **M-4 / M-5 / M-6** — two-sided ranked reporting + Discord token verification; global body cap +
   `readRequestBodyLimited` everywhere; hash CLI tokens.
5. **M-7 / M-8** — remove MinIO default creds; harden the `ledger` service before integration;
   drop CSP `unsafe-inline` (nonces) and reconcile the Traefik middleware; add `Permissions-Policy`.

### 31–90 days
1. Server-authoritative or replay-verifiable scoring (L-1); route-inventory static test that
   default-denies unwrapped mutations.
2. Centralized security telemetry: auth anomalies, admin actions, score/economy anomalies, model
   spend, quota-bypass attempts, CSP reports.
3. Authenticated external penetration test focused on the concurrency races, DNS-rebinding SSRF,
   OAuth/passkey linking, Stripe webhook replay, developer-API scopes, uploads, and WebSocket authZ.
4. Add SBOMs, image-digest pinning, signed provenance, and formal vulnerability SLAs; make
   `DEPLOY_KNOWN_HOSTS` mandatory and add least-privilege `permissions:` blocks to all workflows.

## Scope limitations & required follow-up evidence

The following were not available or were intentionally excluded and must not be inferred as secure:

- Deployed Cloudflare WAF/rate-limit/bot rules, origin firewall, and actual response headers (H-5
  and M-8 severity partly depend on whether the origin rejects non-Cloudflare traffic).
- Live confirmation of the concurrency races (H-1, M-4) under real database timing/isolation, and of
  the DNS-rebinding TOCTOU (M-2) with a controlled malicious-DNS harness.
- Production/staging secret strength, age, rotation, and storage; `.env*` values were not inspected.
- GitHub branch protection, required checks, environment approvals, and Dependabot settings.
- Database row-level permissions, backup encryption/restoration, and audit retention.
- Go/Bazel third-party advisory scanning and container/OS package CVE scanning.
- This report is a code/configuration review, not a penetration test and not a SOC 2 / ISO 27001 /
  PCI DSS certification.
