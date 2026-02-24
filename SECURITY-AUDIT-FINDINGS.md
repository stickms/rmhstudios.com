# RMH Studios — Security Audit Findings

**Date:** February 22, 2026  
**Scope:** RMH codebase (Next.js API routes, file handling, auth, rate limiting, RMH Code, Slice It!, game saves).  
**Intent:** List security vulnerabilities and server-crash risks with minimal reproduction steps. No fixes applied.

---

## 1. Server crash / DoS

### 1.1 Slice It! stream — malformed `Range` header

**Location:** `app/api/slice-it/songs/stream/[id]/route.ts`

**Issue:** The handler parses the `Range` header without validating it. Invalid or hostile values produce `NaN` or negative `chunksize` and are passed to `createReadStream` and `Content-Length`. This can cause an uncaught exception (server error/crash) or undefined behavior.

**Minimal reproduction:**

1. Choose any valid song ID (e.g. from `GET /api/slice-it/songs`).
2. Request:
   ```http
   GET /api/slice-it/songs/stream/<SONG_ID> HTTP/1.1
   Range: bytes=-
   ```
3. Alternatively try: `Range: bytes=10-5` (end &lt; start), or `Range: bytes=999999999-999999999` (beyond file size).

**Observed risk:** 500 response or process crash when `start`/`end` are `NaN` or when `createReadStream` receives invalid options.

---

### 1.2 Temple of Joy save — unbounded request body

**Location:** `app/api/temple-of-joy/save/route.ts`

**Issue:** No `Content-Length` or body size check. The route calls `req.json()` and stores `saveData` (JSON) in the database. A very large POST body can exhaust server memory during JSON parsing or bloat the database.

**Minimal reproduction:**

1. Log in and obtain a valid session (cookie or token).
2. POST to `/api/temple-of-joy/save` with a JSON body where `saveData` is a huge object (e.g. multi‑MB).
   ```bash
   curl -X POST https://<host>/api/temple-of-joy/save \
     -H "Content-Type: application/json" \
     -H "Cookie: <session_cookie>" \
     -d '{"saveData": {"x": "'$(python3 -c "print('A'*10_000_000)")'"}}'
   ```

**Observed risk:** High memory usage, possible OOM or slow/stuck request; large JSON stored in DB.

---

### 1.3 RMH Code — unbounded file `content` (PUT and POST)

**Location:**  
- `app/api/rmh-code/projects/[projectId]/files/[fileId]/route.ts` (PUT)  
- `app/api/rmh-code/projects/[projectId]/files/route.ts` (POST)

**Issue:** Request body is parsed with `req.json()` and `content` is accepted as a string with no maximum length. Storing or processing very large content can cause high memory use, large DB rows (`CodeFile.content` is `@db.Text`), and in the GitHub push flow, large base64 payloads.

**Minimal reproduction:**

1. Log in, create or open a project, get `projectId` and (for PUT) `fileId`.
2. **PUT** (update file):
   ```bash
   curl -X PUT "https://<host>/api/rmh-code/projects/<projectId>/files/<fileId>" \
     -H "Content-Type: application/json" \
     -H "Cookie: <session_cookie>" \
     -d '{"content": "'$(python3 -c "print('x'*50_000_000)")'"}'
   ```
3. **POST** (create file): same idea with `{"name":"x.txt","path":"x.txt","content":"<very long string>"}`.

**Observed risk:** Memory exhaustion during JSON parse or DB write; possible request timeouts or server instability.

---

### 1.4 Slice It! patch-analysis — unbounded `analysisData`

**Location:** `app/api/slice-it/songs/[id]/patch-analysis/route.ts`

**Issue:** Authenticated users can send arbitrary `analysisData` in the JSON body with no size limit. It is stored in `Song.analysisData` (JSON column). Large payloads can bloat the DB and increase memory use.

**Minimal reproduction:**

1. Log in and get a song ID whose `analysisData` is null or empty (e.g. newly uploaded).
2. POST a very large `analysisData`:
   ```bash
   curl -X POST "https://<host>/api/slice-it/songs/<SONG_ID>/patch-analysis" \
     -H "Content-Type: application/json" \
     -H "Cookie: <session_cookie>" \
     -d '{"analysisData": {"huge": "'$(python3 -c "print('A'*5_000_000)")'"}}'
   ```

**Observed risk:** Large JSON stored in DB; higher memory/CPU for parsing and storage.

---

### 1.5 Slice It! score — unbounded `modifiers`

**Location:** `app/api/slice-it/score/route.ts`

**Issue:** The `modifiers` field from the request body is stored as-is in `SongLeaderboard.modifiers` (JSON). No size or shape validation. A client can send a very large object.

**Minimal reproduction:**

1. Log in and submit a score with a huge `modifiers` object:
   ```bash
   curl -X POST "https://<host>/api/slice-it/score" \
     -H "Content-Type: application/json" \
     -H "Cookie: <session_cookie>" \
     -d '{"username":"testuser","score":1000,"modifiers":'$(python3 -c "import json; print(json.dumps({'x':'A'*1_000_000}))"}'}'
   ```

**Observed risk:** DB bloat and increased memory/CPU per submission.

---

## 2. Authorization / IDOR

### 2.1 Slice It! patch-analysis — any user can patch any song’s analysis

**Location:** `app/api/slice-it/songs/[id]/patch-analysis/route.ts`

**Issue:** The route checks that the user is authenticated and that the song exists. It does **not** check that the requester is the song owner (`uploadedBy`). Any logged-in user can overwrite or set `analysisData` for any song that currently has null/empty analysis data.

**Minimal reproduction:**

1. User A uploads a song and notes the song ID (or get any song ID from the public list).
2. User B (different account) logs in.
3. User B sends:
   ```http
   POST /api/slice-it/songs/<SONG_ID>/patch-analysis
   Content-Type: application/json
   Cookie: <user_B_session>

   {"analysisData": {"bpm": 120, "beats": [...], "tampered": true}}
   ```
4. The song’s `analysisData` is updated even though User B is not the uploader.

**Observed risk:** Integrity of beat/analysis data; possible abuse (e.g. injecting wrong BPM or beat map for other users’ songs).

---

## 3. Rate limiting and abuse

### 3.1 Rate limiter keyed by client-supplied IP

**Location:** `lib/rate-limit.ts` — `getClientIp()` used by all rate-limited API routes.

**Issue:** The IP is taken from `x-forwarded-for` (first value) or `x-real-ip`. If the app is behind a proxy that does not overwrite these headers, an attacker can set `X-Forwarded-For` to arbitrary values and bypass or dilute per-IP limits by rotating “IPs.”

**Minimal reproduction:**

1. Send many requests that would normally be rate-limited (e.g. Slice It! upload or score POST).
2. Vary the header on each request:
   ```http
   X-Forwarded-For: 1.2.3.1
   ... next request ...
   X-Forwarded-For: 1.2.3.2
   ...
   ```
3. If the server trusts this header, each value is treated as a different client and limits may not apply.

**Observed risk:** Rate limits bypass; easier DoS or abuse (e.g. many uploads or score submissions).

---

### 3.2 Webhook server default secret

**Location:** `webhook-server.js`

**Issue:** `SECRET = process.env.WEBHOOK_SECRET || 'change-me'`. If `WEBHOOK_SECRET` is not set (e.g. misconfiguration), the server uses a fixed default. The server binds to `127.0.0.1`, so only local callers can reach it; if the webhook is ever exposed or the secret is reused elsewhere, the default is weak.

**Minimal reproduction:**

1. Deploy or run the webhook server without setting `WEBHOOK_SECRET`.
2. Compute `HMAC-SHA256('change-me', body)` and send:
   ```http
   POST /webhook HTTP/1.1
   X-Hub-Signature-256: sha256=<computed_hex>
   ```
   (from localhost). Request is accepted.

**Observed risk:** Low if the server is only ever called from a trusted local process; medium if env is ever missing in a less trusted environment.

---

## 4. Summary table

| # | Category        | Issue                                           | Location(s)                                      | Crash / high impact? |
|---|-----------------|--------------------------------------------------|--------------------------------------------------|------------------------|
| 1.1 | Server crash/DoS | Stream `Range` header unvalidated                | `slice-it/songs/stream/[id]/route.ts`            | Yes (500/crash)       |
| 1.2 | Server crash/DoS | Temple of Joy save body unbounded               | `temple-of-joy/save/route.ts`                   | Yes (memory/DB)       |
| 1.3 | Server crash/DoS | RMH Code file content unbounded                 | `rmh-code/.../files` PUT and POST                | Yes (memory/DB)       |
| 1.4 | DoS / storage   | Patch-analysis `analysisData` unbounded         | `slice-it/songs/[id]/patch-analysis/route.ts`   | Storage/memory         |
| 1.5 | DoS / storage   | Score `modifiers` unbounded                     | `slice-it/score/route.ts`                      | Storage/memory         |
| 2.1 | IDOR            | Patch-analysis does not check song ownership     | `slice-it/songs/[id]/patch-analysis/route.ts`   | Integrity              |
| 3.1 | Rate limit bypass | IP from `X-Forwarded-For` (spoofable)          | `lib/rate-limit.ts` + all rate-limited routes   | Abuse/DoS              |
| 3.2 | Weak default    | Webhook secret defaults to `'change-me'`         | `webhook-server.js`                             | Depends on deployment  |

---

## 5. Notes

- **No raw SQL** was found; Prisma is used throughout. No SQL injection identified in app code.
- **Slice It! upload/stream/cover/delete** use path canonicalization (`resolvePathUnder`) and magic-byte validation; path traversal and arbitrary file types are mitigated.
- **Signal Forge save** already enforces a 500 KB request body limit in the current codebase.
- **Comments** (Slice It!) have a 2000-character limit and rate limiting in the current code.
- This document does **not** include fixes; it only lists problems and minimal steps to reproduce them.
