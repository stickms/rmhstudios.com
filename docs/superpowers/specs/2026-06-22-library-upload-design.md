# Library Upload — Design Spec

**Date:** 2026-06-22
**Status:** Approved (design) → pending implementation plan
**Feature:** Let users upload PDF files directly to the RMH Studios library from the browser.

---

## 1. Overview

Today the library is static: PDFs live in `public/library/`, and their metadata
(title, description, pages, cover) lives in `data/library-metadata.json`,
generated offline by `scripts/generate-library-metadata.ts` (DeepSeek + cover
render). Adding a book means committing files to the repo.

This feature adds a **runtime upload path**: any logged-in user can upload a PDF
from the bookshelf, have its title/description drafted by DeepSeek, and publish
it to the library immediately. Uploaded bytes go to **S3/R2**; metadata goes to a
new **Prisma table**. The bookshelf and reader merge the static catalog with
uploaded books transparently.

## 2. Goals / Non-goals

**Goals**
- Browser-based PDF upload available to any authenticated user.
- PDF + cover stored in R2; metadata in Postgres via Prisma.
- DeepSeek auto-drafts title + description; the uploader can edit before publish.
- Cover image and page count derived client-side via `pdfjs-dist` (no server PDF rasterizer).
- Uploaded books appear on the existing bookshelf and open in the existing reader, unchanged.
- Basic abuse controls (auth, rate limit, per-user quota, size cap, file validation).
- Attribution + owner/admin delete + report flag.

**Non-goals (this iteration)**
- A full moderation dashboard / approval queue (post-hoc moderation only).
- Editing a book's metadata after publish (delete + re-upload for now).
- Multi-file / batch upload.
- Migrating the existing static catalog into the DB (it stays as-is).

## 3. Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| PDF + cover storage | **S3 / R2** (`lib/storage/s3.server.ts`) |
| Metadata storage | **Prisma `LibraryDocument` table** (Postgres) |
| Who can upload | **Any logged-in user** |
| Title/description | **DeepSeek auto-generate**, editable before publish |
| Cover + page count | Client-side via `pdfjs-dist` |
| Publish model | Immediate (post-hoc moderation) |

## 4. Architecture

```
Browser (UploadModal)                       Server                         R2 / DB
─────────────────────                       ──────                         ───────
select PDF
  ├─ pdf.js: numPages, page-1 cover JPEG
  ├─ pdf.js: extract first ~8 pages text
  └─ POST /api/library/draft {text}  ──────► DeepSeek  ─────► {title, desc}
edit fields
  └─ POST /api/library (multipart:    ──────► validate ──────► putObject(pdf)
       pdf, cover, title, desc, pages)        + quota          putObject(cover)
                                              + slug           insert LibraryDocument
                                       ◄────── {slug} ◄─────────────────────┘
navigate /library/<slug>

Bookshelf loader  ──► listAllBooks()  = static JSON books ∪ DB rows
Reader loader     ──► getBook(slug)   = static map, else DB
```

### 4.1 Storage keys (R2)
- PDF:   `library/<id>.pdf`
- Cover: `library/covers/<id>.jpg`

`<id>` is the `LibraryDocument` id (cuid). Public URL uses the existing
`/library/...` convention served from R2/CDN (`lib/storage/asset.ts`), so the
reader resolves uploaded books identically to static ones. Key/url helpers live
in a new `lib/library/keys.ts` (mirroring `lib/storage/keys.ts`).

### 4.2 Data model (Prisma)
```prisma
model LibraryDocument {
  id               String   @id @default(cuid())
  slug             String   @unique
  title            String
  description      String   @default("")
  pages            Int      @default(0)
  pdfKey           String
  coverKey         String?
  sizeBytes        Int      @default(0)
  uploadedByUserId String?
  uploadedBy       User?    @relation(fields: [uploadedByUserId], references: [id], onDelete: SetNull)
  reported         Boolean  @default(false)
  hidden           Boolean  @default(false)
  createdAt        DateTime @default(now())

  @@index([createdAt])
  @@index([uploadedByUserId])
}
```
Add the inverse relation field on `User`. Migration via `prisma migrate`.

### 4.3 Merge layer
`lib/library/library.ts` stays pure/static/client-safe (existing static helpers
untouched). New **server-only** `lib/library/library.server.ts`:
- `listAllBooks(): Promise<LibraryBook[]>` — static books ∪ DB rows (excluding
  `hidden`), mapped to `LibraryBook`, sorted by title.
- `getBook(slug): Promise<LibraryBook | undefined>` — static map first, then DB.

`LibraryBook` gains optional fields: `id?`, `uploadedBy?: { handle, name } | null`,
`source: 'static' | 'upload'`. Static books keep `source: 'static'`.

## 5. API endpoints

All under `app/routes/api/library/`. JSON errors `{ error }` with appropriate status.

### `POST /api/library/draft`
- **Auth:** session required.
- **Body:** `{ text: string }` (≤ ~6k chars, untrusted; treated as data only in the prompt).
- **Action:** DeepSeek → `{ title, description }`. On model failure returns
  `{ title: '', description: '' }` (client falls back to filename-derived title).
- **Limits:** rate-limited per user/IP.

### `POST /api/library` (multipart)
- **Auth:** session required.
- **Fields:** `pdf` (File), `cover` (File, image), `title`, `description`, `pages`.
- **Validation:**
  - `pdf`: content-type `application/pdf`, leading bytes `%PDF`, size ≤ `LIBRARY_PDF_MAX_BYTES` (default 64 MB).
  - `cover`: image magic-byte check via existing `validateImageBuffer`, size ≤ 2 MB.
  - `title`: non-empty after trim, ≤ 200 chars; `description` ≤ 1000 chars; `pages`: int 1..100000.
  - **Quota:** per-user `count(LibraryDocument)` < `LIBRARY_USER_QUOTA` (default 20).
  - **Rate limit:** `LIBRARY_UPLOAD_LIMIT` (default 5) per 10 min per user/IP.
- **Action:** generate id; `slug = slugify(title)` with uniqueness suffix on
  collision; `putObject(pdfKey, ...)`, `putObject(coverKey, ...)`; insert row.
  On DB failure after S3 writes, best-effort `deleteObject` cleanup.
- **Response:** `{ slug, url }` (201).

> No separate `GET /api/library` listing endpoint: after publish the client
> navigates to `/library/<slug>`, and returning to `/library` re-runs the
> bookshelf loader (`listAllBooks()`) server-side, so the shelf refreshes
> without a dedicated JSON route.

### `DELETE /api/library/$slug`  (and `POST .../report`)
- **Delete:** owner (`uploadedByUserId === session.user.id`) or `isAdmin`.
  `deleteObject(pdfKey)`, `deleteObject(coverKey)`, delete row, purge CDN.
  Static books are not deletable here (404 / 403).
- **Report:** any session user sets `reported = true` (idempotent); returns 200.

## 6. Client (UI)

- **`components/library/UploadModal.tsx`** — dropzone + form; states: *select →
  analyzing (pdf.js) → drafting (DeepSeek) → review/edit → uploading → done/error*.
  Renders cover preview, page count, editable title/description, Publish button,
  progress, and inline errors. Reuses `components/library/library.css`.
- **`lib/library/pdf-client.ts`** — pdf.js helpers: `renderCover(file): Blob`,
  `countPages(file): number`, `extractText(file, maxPages, maxChars): string`.
  Runs only in the browser (dynamic import of `pdfjs-dist`).
- **`app/routes/_site/library/index.tsx`** — add an **Upload** button (shown to
  logged-in users) that opens the modal; switch the loader to `listAllBooks()`.
  Book cards show "added by @user" for uploads and a menu (Delete if owner/admin,
  else Report).
- **`app/routes/library.$slug.tsx`** — loader switches to async `getBook(slug)`.

## 7. Error handling

| Condition | Surface |
|---|---|
| Not logged in | 401; modal prompts sign-in |
| File not a PDF / bad magic bytes | 415; "That doesn't look like a PDF." |
| Too large | 413; states the size limit |
| Quota/rate exceeded | 429 + `Retry-After`; "You've hit the upload limit." |
| Validation (title/pages) | 422; field-level message |
| pdf.js parse failure (encrypted/corrupt) | client-side; "Couldn't read this PDF." (no upload attempted) |
| DeepSeek draft failure | non-fatal; fields left blank/filename, user types |
| S3/DB failure | 500 + cleanup; "Upload failed, nothing was saved." |

## 8. Security & abuse

- Auth required for all write endpoints.
- Per-user rate limit + quota; size cap; PDF/image magic-byte validation.
- Extracted text is inserted into the DeepSeek prompt **as data**, with explicit
  instructions to only summarize and ignore embedded instructions (prompt-injection guard).
- `slug` derived from title but sanitized; filenames never trusted for keys (keys use the cuid).
- Post-hoc moderation: `report` flag + owner/admin delete; `hidden` excludes from listing.

## 9. Testing

- **Unit:** `slugify` + collision suffixing; PDF magic-byte validator; quota check;
  `library.server` merge (static ∪ DB, hidden excluded, sort); key/url builders.
- **Endpoint:** upload (mock `putObject` + prisma) happy-path + each rejection;
  draft (mock DeepSeek incl. failure); delete (owner vs admin vs other); report.
- **Manual:** end-to-end upload in `pnpm dev` against a real PDF; verify cover,
  page count, reader playback, attribution, delete.

## 10. Rollout

1. Prisma model + migration.
2. Storage key helpers + `library.server.ts` merge layer (behind no flag; static
   set unaffected).
3. API endpoints.
4. Client modal + pdf.js helpers + bookshelf/reader wiring.
5. Verify R2 CORS + range for the site origin (existing static library already
   serves PDFs from R2, so expected to be configured; confirm during impl).

## 11. Open considerations (deferred, not blocking)

- Admin moderation dashboard for `reported` items.
- Editing metadata post-publish.
- Optional approval queue (publish-after-review) if open uploads get abused.
- De-dupe identical PDFs (hash) to avoid storage bloat.
