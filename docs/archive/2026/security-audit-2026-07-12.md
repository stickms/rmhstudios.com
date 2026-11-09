# Enterprise Security Audit — 2026-07-12

**System:** rmhstudios.com
**Assessment type:** source-assisted architecture, application, dependency, and deployment review
**Assessment date:** 2026-07-12
**Overall risk:** **High**
**Release recommendation:** Do not treat the current build as enterprise-ready until SEC-01 through SEC-04 are remediated or formally risk-accepted.

## Executive summary

The platform has a better security foundation than many applications of comparable breadth. Notable strengths include server-side session resolution, granular developer API scopes, hashed API-key storage, constant-time internal-secret comparison, strict SSRF URL/redirect checks, non-root Node containers, loopback-only service publishing, CodeQL, and a frontend CI workflow. No tracked private keys or recognizable live credential formats were found, and local environment files are ignored. Secret values in `.env` were intentionally not inspected or reproduced.

The current posture is nevertheless **High risk** because several controls do not yet hold at an enterprise trust boundary. The dependency tree contains 40 known advisories, including vulnerable media and XML-processing paths. Multiple score/progression APIs accept client-asserted results and update persistent rankings or quest progress without authoritative verification. The public paid-AI proxy is globally callable while its only abuse control is a spoofable, process-local IP limiter. Rate limiting is similarly inconsistent across the wider mutation surface. The production CSP is largely report-only, leaving the application without a strong containment layer if an injection defect is introduced.

This was a code/configuration audit, not a penetration test. No production traffic, cloud account, database, Cloudflare policy, GitHub repository settings, or deployed headers were accessed. Findings about runtime behavior must be verified against the live environment.

## Remediation update — 2026-07-12

The repository was remediated immediately after this point-in-time assessment. The original findings and severity remain below for audit traceability.

| Finding | Repository status                        | Evidence / remaining verification                                                                                                                                                                                                                                                                                               |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01  | Remediated                               | Patched dependency floors were applied in `package.json`/`pnpm-lock.yaml`; a fresh `pnpm audit --audit-level=low` reports no known vulnerabilities. Web CI now blocks high production advisories.                                                                                                                               |
| SEC-02  | Risk reduced; architectural work remains | The unbounded Synapse endpoint now has a strict invariant schema and distributed user limit. Quest/XP progression is independently throttled across score routes, limiting replay farming. Fully authoritative competitive scoring still requires per-game replay/server simulation and remains a product architecture project. |
| SEC-03  | Remediated in repository                 | Paid AI now enforces request size, per-client, global-minute, and daily distributed quotas and fails closed in production if Redis is unavailable. Compose now supplies an internal Redis service. Live spend alerts and Cloudflare origin enforcement still require operational verification.                                  |
| SEC-04  | Risk reduced; route migration remains    | The highest-risk identified mutation was wrapped with strict validation/distributed limiting and paid AI is fail-closed. Existing route-by-route manual controls remain inconsistent; migration of all mutation routes to one mandatory wrapper is not safely representable as a single mechanical patch.                       |
| SEC-05  | Remediated in configuration              | Apache and Traefik now enforce the full CSP and remove `unsafe-eval`; browser/deployed-header validation is required after rollout.                                                                                                                                                                                             |
| SEC-06  | Remediated in configuration              | Compose/Kubernetes add non-root enforcement, read-only roots, dropped capabilities, no-new-privileges, PID limits, seccomp, and tmpfs. The obsolete repository/worktree mount was removed entirely after confirming the active Go supervisor performs no Git operations. Runtime smoke testing requires Docker/Helm.                              |
| SEC-07  | Remediated                               | GET is confirmation-only; mutation requires POST. Tokens are action/slug-bound, constant-time verified, expire after 24 hours, and responses are no-store/no-referrer. Unit tests cover binding, expiry, and fail-closed behavior.                                                                                              |
| SEC-08  | Substantially remediated                 | GitHub Actions are pinned to resolved commit SHAs; MinIO moved off `latest`; dependency audit is blocking. Container tags should still be converted to registry digests by the release pipeline.                                                                                                                                |
| SEC-09  | Remediated                               | Canonical guidance now reflects web CI/CodeQL and TanStack terminology.                                                                                                                                                                                                                                                         |

The residual items in SEC-02, SEC-04, and image-digest/live-control verification must not be represented as fully closed in an external compliance attestation.

## Risk model

| Rating   | Meaning                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------ |
| Critical | Likely unauthenticated system compromise, mass data loss, or immediately exploitable secret exposure.  |
| High     | Material confidentiality, integrity, availability, fraud, or cost risk with a practical attacker path. |
| Medium   | Meaningful weakness requiring preconditions, limited blast radius, or defense-in-depth failure.        |
| Low      | Hardening, hygiene, or observability gap with limited direct impact.                                   |

## Findings summary

| ID     | Severity | Finding                                                                   | Primary impact                                           |
| ------ | -------: | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| SEC-01 |     High | Known vulnerable dependency set includes attacker-influenced parser paths | XSS, denial of service, supply-chain exposure            |
| SEC-02 |     High | Client-authoritative game results affect rankings and progression         | Fraud, leaderboard corruption, economy/progression abuse |
| SEC-03 |     High | Public paid-AI endpoint relies on spoofable, process-local throttling     | Unbounded cost, availability degradation                 |
| SEC-04 |     High | Mutation-rate limiting and schema validation are inconsistent             | Abuse, resource exhaustion, malformed state              |
| SEC-05 |   Medium | Full CSP is report-only and allows unsafe script execution modes          | Increased impact of an injection defect                  |
| SEC-06 |   Medium | Production containers lack several workload-isolation controls            | Larger post-compromise blast radius                      |
| SEC-07 |   Medium | News approval/rejection uses state-changing GET requests with URL tokens  | Token leakage, accidental or automated state change      |
| SEC-08 |   Medium | CI actions and infrastructure images are tag-based rather than immutable  | Supply-chain drift or compromise                         |
| SEC-09 |      Low | Security documentation and runtime guidance have drifted                  | Incorrect assurance and operational mistakes             |

## Detailed findings

### SEC-01 — Known vulnerable dependencies include parser paths

**Severity:** High
**Confidence:** High

`pnpm audit --audit-level=low` reported **40 vulnerabilities: 1 critical, 11 high, 20 moderate, and 8 low**. The critical `shell-quote` advisory is reached through the development tool `concurrently`, which reduces production exposure but still affects developer/CI trust. More importantly, vulnerable parser packages intersect content-processing features:

- `music-metadata-browser@2.5.11` resolves to `music-metadata@7.14.0`; the audit reports a high-severity infinite-loop issue in the ASF parser. The application imports it in `components/game/SongLibrary.tsx:15`.
- `epubjs@0.3.93` resolves to `@xmldom/xmldom@0.7.13`; the audit reports multiple high-severity XML injection and recursion/DoS advisories. EPUB data is parsed in `lib/library/epub-raster.ts:92-109`.
- Additional findings affect `undici`, `js-yaml`, `esbuild`, and transitive `dompurify` versions. Reachability varies and must be triaged rather than inferred solely from severity.

**Impact:** A crafted media/document input could freeze a browser or processing path, and vulnerable XML serialization may enable markup injection where attacker-controlled document structures are rendered or exported. Development-only vulnerabilities also threaten CI/developer workstations if untrusted scripts or arguments reach the affected tool.

**Recommendation:**

1. Replace deprecated `music-metadata-browser` with a supported `music-metadata` release at or above the patched version and test hostile/truncated ASF inputs in a worker with resource limits.
2. Upgrade or replace `epubjs` so every resolved `@xmldom/xmldom` instance is at least `0.8.13`; confirm that EPUB content is sandboxed and sanitized at the final render boundary.
3. Upgrade `concurrently`/override `shell-quote` to `>=1.8.4`.
4. Add `pnpm audit --prod --audit-level=high` as a blocking CI job and a separate full-tree advisory report. Establish a documented, expiring exception process.
5. Generate an SBOM for release images and enable automated dependency update PRs.

**Verification:** `pnpm audit --audit-level=low` returns no unaccepted high/critical findings; malformed media/EPUB regression tests terminate within fixed CPU/time/memory limits.

### SEC-02 — Client-authoritative game results affect rankings and progression

**Severity:** High
**Confidence:** High

Several authenticated endpoints trust result metrics supplied directly by the browser and immediately persist them or increment progression:

- `app/routes/api/void-breaker/score.ts:20-79` accepts a client score, wave, kills, and time, then updates highs/totals and calls `recordGamePlay`.
- `app/routes/api/slice-it/score.ts:20-141` accepts score, accuracy, combo, speed, and modifiers; it increments total score and writes leaderboard entries.
- `app/routes/api/altair/score.ts:31-81` accepts kills, XP, gold, and survival time and increments persistent totals.
- `app/routes/api/games/synapse-storm/score.ts:18-49` accepts unbounded/untyped metrics, writes them with Prisma, and records quest progress; this route also has no rate limiter.
- `app/routes/api/daily-puzzles/score.ts:36-166` stores asserted puzzle results and client-provided result JSON.

Range checks prevent some accidental corruption but do not establish that play occurred or that results are internally consistent. A signed-in user can call these APIs directly, repeat allowed submissions, or send maximum permitted values. Authentication proves identity, not result integrity.

**Impact:** Leaderboards, user statistics, quests, achievements, XP, gold, or any downstream rewards can be manipulated. If progression is redeemable or socially competitive, this becomes a fraud and trust issue rather than a cosmetic game defect.

**Recommendation:** Use server-authoritative match/session records. Issue a short-lived, single-use play token; record server start time and game configuration; validate event summaries/invariants; enforce one finalization; and calculate rewards server-side. For deterministic games, submit a compact replay/seed and verify it asynchronously. Separate unverified local scores from trusted competitive rankings. Add anomaly detection for impossible rates and retroactive leaderboard quarantine.

**Verification:** Directly posting maximum or inconsistent metrics cannot change trusted rankings/rewards; replayed finalization tokens fail; abuse tests cover concurrency and duplicate submission.

### SEC-03 — Public paid-AI endpoint relies on spoofable, process-local throttling

**Severity:** High
**Confidence:** High

`app/routes/api/vibe/ai.ts:28-54` deliberately exposes the paid model proxy to every origin and does not require a session, signed generated-page token, quota, or CAPTCHA. Its control is an IP limiter. `lib/rate-limit.ts:54-86` stores counters only in the current process, defaults to multiplying every declared limit by four, and evicts entries when the 10,000-key map fills. `lib/rate-limit.ts:94-103` trusts the leftmost `X-Forwarded-For` value. Unless every upstream overwrites that header and the app selects the trusted proxy hop correctly, a caller can rotate header values. Even with correct proxy behavior, botnets and process restarts bypass the cap.

At defaults, the declared 30/minute limit becomes 120/minute per perceived IP. Streaming requests also consume upstream capacity for longer than a simple request counter reflects.

**Impact:** Model spend, connection slots, and application capacity can be exhausted by an unauthenticated attacker. The permissive CORS policy makes browser-based distributed abuse easy.

**Recommendation:** Require a short-lived signed capability bound to a generated page/build and a user or anonymous risk identity. Enforce atomic Redis/edge quotas by user, capability, IP prefix, and global daily budget. Set explicit concurrency, token, duration, and monetary ceilings; reject when Redis/quota infrastructure is unavailable for paid operations. Derive client IP only from a verified Cloudflare header after the origin rejects non-Cloudflare traffic, or use an edge-provided trusted identity. Alert on spend velocity and implement an automatic circuit breaker.

**Verification:** Forged forwarding headers do not alter identity; limits survive restarts and apply across instances; a global budget cuts off model calls; capability replay/origin misuse is rejected.

### SEC-04 — Mutation-rate limiting and schema validation are inconsistent

**Severity:** High
**Confidence:** Medium-high

A heuristic review of 343 API route files found numerous state-changing handlers without a `rateLimit` call and many `request.json()` consumers without Zod or equivalent complete schema validation. Not every exception is vulnerable—admin, internal, webhook, idempotent, and developer API wrappers may supply compensating controls—but confirmed examples include the unthrottled Synapse score endpoint above and manual partial validation in the Discord score flow (`app/routes/api/discord/sync-score.ts:29-109`), where `resultJson` is persisted without a demonstrated size/schema bound.

The shared limiter itself is per-process and forwarding-header-dependent. This means even routes that invoke it do not receive enterprise-grade distributed enforcement. Administrative mutations commonly rely on authentication alone, which does not protect against compromised accounts, automation mistakes, or resource exhaustion.

**Impact:** Attackers can amplify database writes, create oversized or malformed records, trigger expensive work, and abuse compromised accounts. Inconsistent control placement makes future regressions likely.

**Recommendation:** Introduce a mandatory route wrapper that performs body-size enforcement, authentication/authorization, trusted identity derivation, distributed rate limiting, Zod validation, idempotency where relevant, structured audit logging, and uniform error handling. Default-deny mutation routes in an automated static test unless an explicit reviewed exception is present. Apply per-user limits after authentication and tighter limits to admin/economy/upload/AI operations.

**Verification:** A route inventory test proves every mutation is wrapped or explicitly exempted; multi-instance tests demonstrate atomic quotas; oversized JSON is rejected before full buffering.

### SEC-05 — Full Content Security Policy is report-only

**Severity:** Medium
**Confidence:** High

The active Apache configuration enforces only `frame-ancestors` (`deploy/apache/rmhstudios.conf:43-56`). The broader policy is `Content-Security-Policy-Report-Only` and currently includes both `'unsafe-inline'` and `'unsafe-eval'`. The application has legitimate HTML injection boundaries, including sanitized Wikipedia rendering (`components/rmhbox/minigames/wiki-race/WikiFrame.tsx`) and generated experiences, so containment matters.

**Impact:** If a sanitizer, URL-rendering path, dependency, or future component introduces XSS, the current policy offers little script-execution containment. Report-only CSP detects but does not block.

**Recommendation:** Move to an enforced nonce/hash-based CSP. Remove `unsafe-eval`; nonce necessary bootstrap scripts; use strict-dynamic where compatible; constrain `connect-src`, `frame-src`, and media hosts; add `form-action`, `object-src 'none'`, and `base-uri 'none'`. Give Discord Activity and generated/sandbox content purpose-built policies rather than one globally permissive policy. Ensure the same policy is implemented and tested in every active Apache/Helm path.

**Verification:** Automated browser tests run under enforced CSP without unexpected violations; injected inline/event-handler/eval payloads are blocked.

### SEC-06 — Production containers lack several workload-isolation controls

**Severity:** Medium
**Confidence:** High

The Node image correctly runs as a non-root `app` user (`Dockerfile`, runner stage), and public service ports bind to loopback (`docker-compose.yml:92-141, 207-299`). However, Compose does not set `read_only`, `cap_drop`, `no-new-privileges`, PID/memory/CPU limits, or a tmpfs for writable temporary data. The full supervisor image contains Git and Chromium and bind-mounts the entire host repository at the same path (`docker-compose.yml:169-195`), apparently read-write. All services receive a broad shared environment file rather than least-privilege secret subsets. MinIO uses floating `latest` images and development credential fallbacks (`docker-compose.yml:280-313`).

**Impact:** A web/worker/browser compromise gains unnecessary filesystem and secret reach. A supervisor compromise may alter the host checkout and therefore influence later builds/deploys. Resource-exhaustion attacks can contend with the whole host.

**Recommendation:** Make root filesystems read-only, drop all capabilities, set `no-new-privileges:true`, use explicit resource/PID limits, and mount only required writable directories as tmpfs or named volumes. Split worker images and credentials by responsibility. Replace the host repository bind mount with a narrowly scoped read-only input plus a dedicated writable worktree volume; perform deploys from a clean, verified checkout. Pin MinIO and all base images by digest and fail production startup if placeholder/default credentials are present.

**Verification:** Container inspection confirms effective restrictions; a compromised worker user cannot modify source/deploy files or read unrelated service credentials.

### SEC-07 — News approval/rejection uses state-changing GET requests with URL tokens

**Severity:** Medium
**Confidence:** High

`app/routes/api/news/approve.ts:18-59` publishes content via GET, while `app/routes/api/news/reject.ts:18-49` deletes content via GET. Authorization tokens are query parameters. HMAC comparison is constant-time and fails closed when the secret is absent, but URL tokens can enter browser history, proxy/CDN/access logs, referrer data, link scanners, and chat-preview crawlers. Automated link expansion can trigger the action without human intent. Tokens appear deterministic per slug and have no visible expiry or one-time nonce.

**Impact:** Leaked links remain reusable; security scanners or previews can publish/delete an article; logs become credential-bearing data.

**Recommendation:** Make the link open a confirmation page and require a POST with an expiring, single-use, purpose-bound token (`approve` versus `reject`) stored or nonce-tracked server-side. Put secrets in the POST body, set `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, log only a token fingerprint, and retain deleted drafts for recovery/audit.

**Verification:** GET never changes state; expired/replayed/wrong-purpose tokens fail; preview crawlers cannot approve or delete content.

### SEC-08 — CI actions and infrastructure images are not immutably pinned

**Severity:** Medium
**Confidence:** High

Workflows reference mutable major tags such as `actions/checkout@v4`, `github/codeql-action/*@v3`, and `anthropics/claude-code-action@v1` (`.github/workflows/*.yml`). The review action receives `id-token: write` and `pull-requests: write`. Container bases and MinIO use tags, including `minio/minio:latest` and `minio/mc:latest` (`docker-compose.yml:280-303`).

**Impact:** Upstream tag movement or compromise can change executable code without a repository diff. Floating infrastructure versions also create unreviewed operational and security drift.

**Recommendation:** Pin every GitHub Action and container image to a reviewed commit/digest; use automated PRs to update pins. Minimize job permissions, isolate the AI review into the least-privileged job possible, and avoid exposing write/OIDC permissions to steps that do not need them. Enforce artifact provenance/signing and admission verification for release images.

**Verification:** CI rejects mutable action/image references; updates occur only through reviewed dependency PRs.

### SEC-09 — Security documentation and runtime guidance have drifted

**Severity:** Low
**Confidence:** High

The canonical guidance states there is no frontend typecheck/lint CI gate, but `.github/workflows/web-ci.yml` now runs typecheck, lint, tests, and a build. `lib/rate-limit.ts` still describes “Next.js API routes” despite the TanStack Start stack. Drift does not directly create a vulnerability, but it can cause inaccurate control attestations and wasted remediation.

**Recommendation:** Update `CLAUDE.md`, directory guides, and architecture/control inventories as part of the same change that introduces or removes a control. Assign owners and quarterly evidence review dates to enterprise controls.

## Positive controls observed

- Local `.env`, production, and staging environment files are ignored; tracked environment files are examples only.
- Pattern-based tracked-file scanning found no recognizable private-key blocks, AWS access keys, Stripe live keys, GitHub tokens, or Slack tokens.
- Better Auth has an explicit trusted-origin allowlist and credential-route throttles (`lib/auth.ts`).
- Developer API keys are random, stored only as SHA-256 hashes, scoped, revocable, tier-checked, and subject to Redis-backed limiting when available (`lib/api/developer-auth.server.ts`, `lib/api/with-developer-api.server.ts`).
- Internal shared secrets use fixed-length hash comparison and fail closed if unset (`lib/internal-auth.ts`).
- User-controlled fetches have a strong reusable SSRF guard with protocol checks, DNS resolution, private/reserved IP rejection, redirect revalidation, and timeouts (`lib/ssrf-guard.server.ts`).
- Auth CORS reflects only an explicit origin allowlist and permits credentials only for those origins (`app/routes/api/auth/$.ts:4-20`).
- Production-facing Compose ports are loopback-bound and the Node runtime uses a non-root user.
- CodeQL covers JavaScript/TypeScript and Go with extended security queries; web CI runs typecheck, lint, tests, and build.
- Login callback validation rejects control characters, backslashes, and protocol-relative redirects (`app/routes/login.tsx:24-39`).

## Enterprise remediation roadmap

### 0–7 days

1. Patch/override the high and critical dependency findings; prioritize media/XML parsing.
2. Put the public AI proxy behind a global budget and distributed limiter; temporarily lower limits and enable a kill switch.
3. Disable trusted competitive/reward effects from unverifiable score endpoints or mark results untrusted.
4. Convert news approve/reject to confirmation + POST and rotate `NEWS_APPROVAL_SECRET` after deployment.
5. Verify Cloudflare/origin rules overwrite forwarding headers and block direct-origin access.

### 8–30 days

1. Build the mandatory secure API wrapper and inventory every mutation route.
2. Design server-authoritative or replay-verifiable scoring for all rewarded games.
3. Enforce the full CSP after a report-only burn-in and browser regression suite.
4. Harden Compose workloads and split secrets/images by responsibility.
5. Pin CI actions, images, and base images to immutable digests.

### 31–90 days

1. Add SBOMs, signed provenance, container scanning, secret push protection, and formal vulnerability SLAs.
2. Add centralized security telemetry: auth anomalies, admin actions, quota bypass attempts, model spend, score anomalies, and CSP reports.
3. Conduct an authenticated external penetration test covering account recovery, OAuth/passkeys, Stripe webhooks, developer API scopes, uploads, generated pages, WebSockets, and business-logic fraud.
4. Complete threat models and data-flow diagrams for identity, payments, economy, media, generated content, and worker/deploy trust boundaries.
5. Establish incident response, key rotation, backup restoration, disaster recovery, and access-review evidence suitable for SOC 2/ISO 27001 control mapping.

## Validation performed

- Read the canonical and directory-specific repository guidance plus active deployment/build configuration.
- Inventoried 343 API route files and heuristically screened mutation handlers for authentication, rate limiting, and schema validation; manually validated representative high-risk routes.
- Reviewed auth, internal auth, developer API auth, SSRF controls, CORS, login redirects, paid-AI proxy, scoring routes, CSP, Compose, Dockerfile, and CI workflows.
- Scanned tracked files for selected high-confidence credential formats without printing or reading local `.env` values.
- Ran `pnpm audit --audit-level=low` against the live npm advisory service on 2026-07-12.

## Scope limitations and required follow-up evidence

The following were not available or were intentionally excluded and should not be inferred as secure:

- Deployed Cloudflare WAF/rate-limit/bot rules, origin firewall, DNS, TLS, and actual response headers.
- Production/staging secret strength, age, storage, rotation, and access logs.
- GitHub branch protection, required checks, environment approvals, secret scanning, and Dependabot settings.
- Database row-level permissions, backup encryption/restoration, audit retention, and production IAM.
- Dynamic testing of SSRF DNS rebinding, XSS, CSRF, request smuggling, WebSocket authorization, file polyglots, race conditions, payment/webhook replay, or account recovery.
- Go/Bazel third-party advisory scanning and container/OS package CVE scanning.
- Privacy, regulatory, and contractual compliance; this report is not a SOC 2, ISO 27001, PCI DSS, or legal certification.

## Residual-risk acceptance template

Any deferred High/Medium finding should record: business owner, technical owner, affected assets/data, exploit prerequisites, compensating controls with evidence, monitoring/alert, target date, review date, and an explicit accepting executive. Exceptions should expire automatically and be re-approved after material architecture or threat changes.
