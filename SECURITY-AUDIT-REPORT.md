# RMH Studios — Full Website Security Audit Report

**Date:** February 2025  
**Scope:** rmhstudios.com codebase (Next.js App Router, API routes, Socket.IO server)  
**Type:** Manual code review and inventory; no automated scanning.

---

## Executive summary

This audit covers the RMH Studios website: a Next.js application with multiple game modules (Slice It!, Echoes, Laundry Sort, Vega, Signal Forge), a Slice It! song library with user uploads and comments, and a standalone Socket.IO server for multiplayer lobbies. Authentication is handled by Better Auth (Discord OAuth + email/password) with Prisma and PostgreSQL.

**Key findings:** Slice It! file uploads are already hardened (magic-byte validation, size limits, rate limiting, path safety). Several API routes lack rate limiting (comments, Vega score, Signal Forge save/load/score/abandon, Slice It! PATCH). Username sanitization is inconsistent (Echoes sanitizes; Slice It! and Laundry Sort do not). The Socket.IO server accepts client-supplied identity with no server-side session check (spoofable) and uses permissive CORS. Signal Forge save accepts arbitrary JSON `runState` with no size limit. Comment content has no length limit or rate limit; XSS is mitigated by React’s default escaping.

**Overall risk:** Medium. No critical vulnerabilities identified. Main improvements: add rate limits to uncovered endpoints, standardize username validation, constrain Socket.IO inputs and CORS, and add a JSON size limit for Signal Forge save.

---

## Scope

| In scope | Out of scope |
|----------|--------------|
| Next.js app (App Router): `app/`, `components/` | Third-party hosting/infra (Vercel, etc.) |
| All API routes under `app/api/` | Penetration testing or live exploitation |
| Standalone Socket.IO server: `server/socket-server.ts` | Better Auth / Prisma internal security |
| Auth (Better Auth + Prisma), rate limiting, UGC handling | Automated vulnerability scanners |

---

## Methodology

1. **Inventory** — Listed every API route (method, path, auth, rate limit) and every Socket.IO event and its payload.
2. **Per-route / per-area review** — For each area (auth, Slice It!, Echoes, Laundry, Vega, Signal Forge, WebSocket), documented: purpose, input validation, auth, rate limit, and gaps.
3. **Compilation** — Single report with findings table and prioritized recommendations. No code changes; fixes to be done in separate work.

---

## Authentication and authorization

- **Provider:** Better Auth ([lib/auth.ts](lib/auth.ts)) with Prisma adapter (PostgreSQL). Features: Discord OAuth, email/password, optional `username` on user.
- **Auth API:** All auth flows are delegated to Better Auth via [app/api/auth/[...all]/route.ts](app/api/auth/[...all]/route.ts) (`toNextJsHandler(auth)`). No custom auth logic in app code; security depends on Better Auth and correct session handling.
- **Protected routes:** Session is required (401 if missing) for: Slice It! upload, PATCH/DELETE song, POST comment; Slice It!, Echoes, Laundry, Vega, Signal Forge score/save/load/abandon. Owner checks (uploadedBy === session.user.id) are enforced for Slice It! PATCH/DELETE and for Signal Forge load/abandon (userId).
- **Public by design:** GET songs list, GET stream, GET cover, GET comments, GET leaderboards (all games). No sensitive data is exposed; stream/cover use path canonicalization (see [SECURITY.md](SECURITY.md)).

---

## API security

### Route matrix

| Route | Method | Auth | Rate limit | Main inputs | Notes |
|-------|--------|------|------------|-------------|--------|
| `/api/auth/[...all]` | GET, POST | N/A (auth provider) | N/A | — | Better Auth |
| `/api/slice-it/songs` | GET | No | No | — | Public list; `take: 50` |
| `/api/slice-it/songs/upload` | POST | Yes | Yes (10/60s) | file, title, artist, bpm, duration, description, cover | Magic bytes, size limits; see SECURITY.md |
| `/api/slice-it/songs/stream/[id]` | GET | No | No | id | Path under `db/music`; no parser |
| `/api/slice-it/songs/cover/[filename]` | GET | No | No | filename | Path under `db/music/covers` |
| `/api/slice-it/songs/[id]` | PATCH, DELETE | Yes (owner) | No | title, artist, description, cover (PATCH) | Owner check; cover validated on PATCH |
| `/api/slice-it/songs/[id]/comments` | GET, POST | POST: Yes | No | content (POST) | No length/rate limit on POST |
| `/api/slice-it/score` | POST | Yes | Yes (5/60s) | username, score, accuracy, maxCombo, songId | Username length 2–24 only; not sanitized |
| `/api/slice-it/leaderboard` | GET | No | Yes (20/60s) | — | Public |
| `/api/echoes/score` | POST | Yes | Yes (5/60s) | username, timeSurvived, kills, totalXP | Username sanitized (`cleanUsername`) |
| `/api/echoes/leaderboard` | GET | No | Yes (20/60s) | — | Public |
| `/api/laundry-sort/score` | POST | Yes | Yes (5/60s) | username, score | Username length 2–24 only; not sanitized |
| `/api/laundry-sort/leaderboard` | GET | No | Yes (20/60s) | — | Public |
| `/api/vega/score` | POST | Yes | No | highestLoop, highestLevel | Server-derived username |
| `/api/vega/leaderboard` | GET | No | No | — | Public |
| `/api/signal-forge/save` | POST | Yes | No | runState (JSON) | Only floor/playerHp validated; no size limit |
| `/api/signal-forge/load` | GET | Yes | No | — | By userId |
| `/api/signal-forge/abandon` | POST | Yes | No | — | By userId |
| `/api/signal-forge/score` | POST | Yes | No | score, floorReached | Server-derived username |
| `/api/signal-forge/leaderboard` | GET | No | No | — | Public |

### Slice It!

- **Upload / stream / cover / PATCH / DELETE:** Covered in [SECURITY.md](SECURITY.md): magic-byte validation (audio + cover), 50 MB / 5 MB limits, path traversal protection, upload rate limit. Server does not decode or parse audio.
- **Comments:** POST requires session; `content` is required and trimmed. No max length, no rate limit. Stored and rendered as React text (XSS mitigated).
- **Score:** Username length 2–24; no character sanitization (unlike Echoes). Score/accuracy/songId validated.

### Echoes

- **Score:** Username sanitized with `cleanUsername` (allowlist `a-zA-Z0-9_\-. `), length ≤32. timeSurvived, kills, totalXP bounded. Auth and rate limit in place.

### Laundry Sort

- **Score:** Username length 2–24 only; no sanitization. Score bounded. Auth and rate limit in place.

### Vega

- **Score:** Username from session (name or email). highestLoop, highestLevel validated. No rate limit on score POST.

### Signal Forge

- **Save:** Accepts `runState` (arbitrary JSON). Only `runState.floor` and `runState.playerHp` are type-checked; full object is stored. No request-body or JSON size limit (DoS/storage risk).
- **Load / abandon:** Keyed by `session.user.id`; no IDOR.
- **Score / leaderboard:** Score and floorReached validated; no rate limit on score.

---

## File uploads

Slice It! song and cover uploads are documented in [SECURITY.md](SECURITY.md). Summary:

- **Audio:** Magic-byte validation (MP3, WAV, OGG, FLAC), 50 MB max, no server-side decoding.
- **Covers:** Magic-byte validation (PNG, JPEG, GIF, WebP), 5 MB max; same on upload and PATCH.
- **Paths:** Filenames sanitized; `resolvePathUnder()` used for stream, cover, and DELETE.
- **Rate limit:** 10 uploads per 60 s per IP.

---

## User-generated content

- **Comments (Slice It!):** Stored in `SongComment.content`. Rendered in [components/game/SongComments.tsx](components/game/SongComments.tsx) as `{comment.content}` (React text node — escaped). No `dangerouslySetInnerHTML` found in the codebase for song or comment content. **Recommendation:** Add max length (e.g. 2000 chars) and rate limit on POST.
- **Usernames (Slice It!, Laundry, Echoes):** Echoes uses `cleanUsername` (allowlist); Slice It! and Laundry only enforce length. Inconsistent; could allow confusing or problematic characters. **Recommendation:** Apply the same allowlist sanitization to Slice It! and Laundry usernames.
- **Song metadata (title, artist, description):** From upload/PATCH; rendered as text in UI. No server-side HTML; React escapes.

---

## WebSocket (Socket.IO)

- **Server:** [server/socket-server.ts](server/socket-server.ts); path `/socket/`; CORS `origin: "*"`.
- **Authentication:** `join_lobby` receives `lobbyId`, `userName`, `userId` from the client. There is no server-side session or token check; identity is client-asserted and can be spoofed.
- **Inputs:** `userName` and `lobbyId` are not sanitized or length-limited; `song` (host) and `difficulty` are passed through. Score/combo/health updates are numbers. **Recommendations:** Restrict CORS to allowed origins in production (e.g. env-based); sanitize and length-limit `userName` and `lobbyId`; consider validating or size-limiting `song`/`difficulty` to prevent abuse or log injection.

```mermaid
sequenceDiagram
  participant Client
  participant SocketServer
  Client->>SocketServer: connect
  SocketServer->>Client: connected
  Client->>SocketServer: join_lobby(lobbyId, userName, userId)
  Note over SocketServer: No auth check; identity from client
  SocketServer->>Client: lobby_update
```

---

## Data validation and injection

- **SQL:** All DB access is via Prisma; no raw SQL. No SQL injection from application code. Keep Prisma and dependencies updated.
- **IDOR:** Slice It! PATCH/DELETE and Signal Forge load/abandon/save are scoped by `session.user.id` or resource ownership; owner checks are present.
- **JSON (Signal Forge save):** `runState` is stored as-is with minimal validation. Large or deeply nested payloads can increase memory and storage. **Recommendation:** Enforce a max request-body size (e.g. 500 KB) and optionally a schema or field allowlist.

---

## Rate limiting and DoS

- **Implemented:** [lib/rate-limit.ts](lib/rate-limit.ts) — in-memory, IP-based; IP from `x-forwarded-for` or `x-real-ip`. Used by: Slice It! (upload, score, leaderboard), Echoes (score, leaderboard), Laundry (score, leaderboard).
- **Not rate-limited:** Comments POST; Vega score; Signal Forge save, load, abandon, score; Slice It! PATCH; leaderboards for Vega and Signal Forge (GET). **Recommendation:** Add per-IP (and optionally per-user) rate limits for all state-changing and moderately expensive endpoints.
- **Limiter behavior:** Single-process in-memory store; limits do not persist across restarts or scale across multiple instances. For production at scale, consider a shared store (e.g. Redis).

---

## Infrastructure and configuration

- **Secrets:** Server-side: `DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`. Client-exposed: `NEXT_PUBLIC_BETTER_AUTH_URL`, `NEXT_PUBLIC_SOCKET_URL`. Do not commit secrets; use environment variables and document required vars.
- **Next.js:** [next.config.ts](next.config.ts) has no custom security headers. Optional: add headers such as `X-Content-Type-Options: nosniff` and a Content-Security-Policy if not provided by the host.
- **Middleware:** No Next.js middleware file; auth and rate limiting are applied per route.

---

## Dependencies

- **Audit:** Run `pnpm audit` (or `npm audit`) regularly; at audit time the registry returned 500, so results could not be included. Re-run and document findings.
- **Key dependencies:** Better Auth, Prisma, Next.js, Socket.IO. Keep them and transitive dependencies updated for security fixes.

---

## Findings summary

| ID | Finding | Severity | Location | Recommendation |
|----|---------|----------|----------|----------------|
| F1 | Comments POST has no rate limit | Medium | `slice-it/songs/[id]/comments` | Add per-IP rate limit (e.g. 10/60s) |
| F2 | Comments POST has no max length | Medium | Same | Reject content over e.g. 2000 chars |
| F3 | Slice It! / Laundry usernames not sanitized | Low | score routes | Use allowlist (e.g. Echoes-style) for consistency |
| F4 | Vega score has no rate limit | Low | `vega/score` | Add per-IP rate limit |
| F5 | Signal Forge save/load/score/abandon not rate-limited | Medium | signal-forge routes | Add rate limits for save/load/score/abandon |
| F6 | Signal Forge save accepts unbounded JSON | Medium | `signal-forge/save` | Enforce max body size; optional schema/allowlist |
| F7 | Socket.IO CORS is `*` | Low | `socket-server.ts` | Restrict to allowed origins in production |
| F8 | Socket.IO identity is client-supplied | Low | `join_lobby` | Document as trade-off; optional: auth handshake/token |
| F9 | Socket.IO userName/lobbyId not validated | Low | `socket-server.ts` | Sanitize and length-limit |
| F10 | Slice It! PATCH (cover) not rate-limited | Low | `slice-it/songs/[id]` | Add per-IP rate limit |
| F11 | In-memory rate limiter doesn’t scale | Info | `lib/rate-limit.ts` | Consider Redis for multi-instance production |

---

## Recommendations (prioritized)

1. **High**
   - Add rate limiting to Comments POST and Signal Forge save/load/score/abandon.
   - Enforce a maximum request-body (or JSON) size for Signal Forge save (e.g. 500 KB).

2. **Medium**
   - Add a maximum length for comment content (e.g. 2000 characters).
   - Sanitize usernames in Slice It! and Laundry Sort (same allowlist as Echoes).

3. **Low**
   - Add rate limiting to Vega score and Slice It! PATCH.
   - Socket.IO: restrict CORS to allowed origins; sanitize and length-limit `userName` and `lobbyId`.
   - Document Socket.IO identity as client-asserted; optionally add server-side auth for higher assurance.

4. **Ongoing**
   - Run `pnpm audit` (or equivalent) and address findings.
   - Keep Better Auth, Prisma, Next.js, and Socket.IO updated.
   - For production at scale, consider a shared rate-limit store (e.g. Redis).

---

## Appendix

### API routes (full list)

| Path | Methods |
|------|---------|
| `app/api/auth/[...all]/route.ts` | GET, POST |
| `app/api/slice-it/songs/route.ts` | GET |
| `app/api/slice-it/songs/upload/route.ts` | POST |
| `app/api/slice-it/songs/stream/[id]/route.ts` | GET |
| `app/api/slice-it/songs/cover/[filename]/route.ts` | GET |
| `app/api/slice-it/songs/[id]/route.ts` | PATCH, DELETE |
| `app/api/slice-it/songs/[id]/comments/route.ts` | GET, POST |
| `app/api/slice-it/score/route.ts` | POST |
| `app/api/slice-it/leaderboard/route.ts` | GET |
| `app/api/echoes/score/route.ts` | POST |
| `app/api/echoes/leaderboard/route.ts` | GET |
| `app/api/laundry-sort/score/route.ts` | POST |
| `app/api/laundry-sort/leaderboard/route.ts` | GET |
| `app/api/vega/score/route.ts` | POST |
| `app/api/vega/leaderboard/route.ts` | GET |
| `app/api/signal-forge/save/route.ts` | POST |
| `app/api/signal-forge/load/route.ts` | GET |
| `app/api/signal-forge/abandon/route.ts` | POST |
| `app/api/signal-forge/score/route.ts` | POST |
| `app/api/signal-forge/leaderboard/route.ts` | GET |

### Socket.IO events (server)

| Event | Direction | Payload (from client) |
|-------|-----------|------------------------|
| `join_lobby` | Client → Server | lobbyId, userName, userId |
| `select_song` | Client → Server | lobbyId, song |
| `start_game` | Client → Server | lobbyId |
| `player_loaded` | Client → Server | lobbyId |
| `score_update` | Client → Server | lobbyId, score, combo, health |
| `player_finished` | Client → Server | lobbyId, finalScore |
| `leave_lobby` | Client → Server | lobbyId |
| `return_to_lobby` | Client → Server | lobbyId |
| `update_difficulty` | Client → Server | lobbyId, difficulty |
| `disconnect` | — | — |

---

## Pre-production security checklist

- [ ] All required env vars set (no secrets in repo): `DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `NEXT_PUBLIC_*` as needed.
- [ ] Rate limits in place for state-changing endpoints (comments, Vega score, Signal Forge save/load/score/abandon, Slice It! PATCH).
- [ ] Comment max length enforced; usernames sanitized where applicable.
- [ ] Signal Forge save: max JSON/body size enforced.
- [ ] Socket.IO: CORS restricted to allowed origins; userName/lobbyId sanitized and length-limited.
- [ ] `pnpm audit` (or equivalent) run and known issues addressed or accepted.
- [ ] Security headers (e.g. X-Content-Type-Options, CSP) configured if not provided by host.
- [ ] [SECURITY.md](SECURITY.md) and this report reviewed; link from SECURITY.md to this report for full audit.
