# Security

This document describes security-relevant behavior for RMH Studios projects, with emphasis on user-generated content and file uploads.

## Slice It! — Song & cover uploads

Slice It! allows authenticated users to upload audio files (MP3, WAV, OGG, FLAC) and optional cover images. The following measures are in place.

### Authentication & authorization

- **Upload** (`POST /api/slice-it/songs/upload`): Requires an authenticated session. Only logged-in users can upload.
- **Update/delete** (`PATCH` / `DELETE /api/slice-it/songs/[id]`): Require authentication; only the uploader can update or delete a song.
- **Stream** (`GET /api/slice-it/songs/stream/[id]`): Public by design so anyone can play listed songs. No sensitive data is exposed.

### File type validation (server-side)

- **Audio**: Type is validated by **magic bytes** (file signatures), not by client-provided MIME or filename. Allowed formats: MP3 (ID3 or frame sync), WAV, OGG, FLAC. See `lib/slice-it/upload-validation.ts`.
- **Cover images**: Validated by magic bytes. Allowed: PNG, JPEG, GIF, WebP. Same validation is used on initial upload and when updating the cover via PATCH.

### File size limits

- **Audio**: 50 MB maximum.
- **Cover images**: 5 MB maximum.

Rejection happens before any file is written to disk.

### Rate limiting

- **Upload**: 10 uploads per 60 seconds per IP (prefix `slice-upload`). Returns `429 Too Many Requests` with `Retry-After` when exceeded.

### Path traversal & path safety

- Stored filenames are sanitized (alphanumeric, dots, hyphens only) and prefixed with a unique suffix. No path separators or `..` are stored in the database.
- When reading or deleting files, paths are resolved and checked to stay under the intended directories (`db/music` for audio, `db/music/covers` for covers) via `resolvePathUnder()` in `lib/slice-it/upload-validation.ts`. Requests that would resolve outside those directories are rejected (404/400).

### Reporting vulnerabilities

If you believe you’ve found a security issue, please report it responsibly (e.g. private disclosure to the maintainers) rather than opening a public issue.
