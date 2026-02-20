# Security audit fixes and 10 GB song storage cap

## Summary

This PR implements all remediation items from **SECURITY-AUDIT-REPORT.md** (findings F1–F10) and adds a **10 GB site-wide cap** on total uploaded song storage. It does not change Better Auth or Prisma internals; rate limiting continues to use the in-memory store (F11/Redis remains optional for production at scale).

---

## Slice It! — Uploads and storage

| Change | Details |
|--------|--------|
| **Magic-byte validation** | Upload route now uses `lib/slice-it/upload-validation.ts`: audio validated by file signatures (MP3, WAV, OGG, FLAC), covers by image signatures (PNG, JPEG, GIF, WebP). Client MIME and inline size checks removed; limits are 50 MB per audio file, 5 MB per cover per SECURITY.md. |
| **Upload rate limit** | 10 uploads per 60 seconds per IP (prefix `slice-upload`). Returns 429 with `Retry-After` when exceeded. |
| **10 GB total storage** | New optional `Song.fileSizeBytes` (Prisma + migration). Before writing any file, upload route aggregates current total and rejects with 413 if adding the new file would exceed 10 GB. New uploads set `fileSizeBytes`; existing rows are treated as 0 in the sum. |
| **Path safety** | Stream, cover, and DELETE routes resolve paths with `resolvePathUnder()` so requests cannot escape `db/music` or `db/music/covers`. |

---

## Slice It! — PATCH and comments

- **PATCH** (`/api/slice-it/songs/[id]`): Rate limit 10/60s per IP (`slice-patch`). New cover file validated with `validateImageBuffer()` (magic bytes, 5 MB) before writing.
- **Comments POST** (`/api/slice-it/songs/[id]/comments`): Rate limit 10/60s per IP (`slice-comments`). Max length 2000 characters; 400 with clear message when exceeded.

---

## Username sanitization

- **Slice It! score** and **Laundry Sort score**: Same allowlist as Echoes — `a-zA-Z0-9_\-. ` (space allowed), max length 24, min 2. Invalid or empty result after sanitization is rejected.

---

## Rate limits (previously missing)

| Area | Endpoint / action | Limit |
|------|------------------|--------|
| Vega | Score POST | 5/60s (`vega-score`) |
| Vega | Leaderboard GET | 20/60s (`vega-leaderboard`) |
| Signal Forge | Save POST | 10/60s (`signal-forge-save`) |
| Signal Forge | Load GET | 20/60s (`signal-forge-load`) |
| Signal Forge | Abandon POST | 20/60s (`signal-forge-abandon`) |
| Signal Forge | Score POST | 5/60s (`signal-forge-score`) |
| Signal Forge | Leaderboard GET | 20/60s (`signal-forge-leaderboard`) |

---

## Signal Forge save — body size

- Before parsing JSON, request is rejected with 413 if `Content-Length` is present and &gt; 500 KB (512000 bytes). Prevents unbounded JSON from being stored (F6).

---

## Socket.IO server

- **CORS**: `origin` is now `process.env.SOCKET_CORS_ORIGIN || "*"`. Set `SOCKET_CORS_ORIGIN` (e.g. `https://rmhstudios.com`) in production to restrict origins.
- **Validation**:  
  - `join_lobby`: `lobbyId` sanitized (alphanumeric + hyphen only, max 64 chars); `userName` sanitized with Echoes-style allowlist, max 32 chars. Defaults used for missing/invalid.  
  - All events that take `lobbyId` use the same sanitizer before lookup.  
  - `update_difficulty`: `difficulty` object validated; numeric and boolean fields type-checked, `level` string length capped at 32.

---

## Documentation and client

- **SECURITY.md**: File size limits section updated to state 50 MB per audio file, 5 MB per cover, and **10 GB total song storage** site-wide; rejection occurs before any file is written.
- **SECURITY-AUDIT-REPORT.md**: New “Remediation” subsection at top listing how F1–F10 were addressed; F11 (Redis) noted as optional future improvement.
- **SongLibrary.tsx**: Client-side audio size check updated to 50 MB to match server.

---

## Audit findings addressed

| ID | Finding | Resolution |
|----|---------|------------|
| F1 | Comments POST has no rate limit | 10/60s per IP added |
| F2 | Comments POST has no max length | 2000 characters enforced |
| F3 | Slice It! / Laundry usernames not sanitized | Allowlist sanitization applied (same as Echoes) |
| F4 | Vega score has no rate limit | 5/60s per IP added |
| F5 | Signal Forge save/load/score/abandon not rate-limited | Rate limits added as above |
| F6 | Signal Forge save accepts unbounded JSON | 500 KB max body (Content-Length) enforced |
| F7 | Socket.IO CORS is `*` | Configurable via `SOCKET_CORS_ORIGIN` |
| F8 | Socket.IO identity is client-supplied | Documented as trade-off; unchanged |
| F9 | Socket.IO userName/lobbyId not validated | Sanitized and length-limited |
| F10 | Slice It! PATCH not rate-limited | 10/60s + cover magic-byte validation |

---

## Migration

- **Migration**: `20260219220000_add_song_file_size_bytes` — adds nullable `Song.fileSizeBytes`.
- **After merge**: Run `npx prisma migrate deploy` (or `prisma migrate dev`) when the database is available. Existing songs have `fileSizeBytes === null` and are counted as 0 toward the 10 GB cap until backfilled (optional).

---

## Testing suggestions

- [ ] Upload an audio file (verify magic-byte validation and 50 MB limit).
- [ ] Upload with cover (verify 5 MB cover limit).
- [ ] Confirm 429 on upload/comment/PATCH when rate limit exceeded.
- [ ] Post a comment &gt; 2000 characters (expect 400).
- [ ] Submit Slice It! / Laundry score with special characters in username (verify sanitization).
- [ ] Signal Forge save with body &gt; 500 KB (expect 413 if Content-Length set).
- [ ] Socket.IO: join lobby with invalid `userName`/`lobbyId` (verify sanitized values).
