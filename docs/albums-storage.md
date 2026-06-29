# Library Albums — object storage migration

Albums (the library photo/video carousels) used to be **hardcoded in
`lib/albums.ts`** with all media committed under `public/albums/`. The Alex Wu
album alone was **349 MB** (312 MB of full-res originals), which:

- bloated the Docker build context + the runtime image, and
- made the `COPY public` layer cache miss on any change under `public/`, so a
  trivial PR pushed deploys from ~3 min to ~7 min.

Albums are now **database-backed** (`Album` / `AlbumSlide`) with all media in
**object storage** (R2/S3) under the `albums/` key space. Nothing heavy lives in
the repo or the image anymore.

## What changed

- `prisma/schema.prisma` — `Album` + `AlbumSlide` models (migration
  `20260629000000_add_albums`).
- `lib/albums.ts` — now just the shared client-safe types.
- `lib/albums.server.ts` — reads the DB, resolves storage keys → URLs.
- `lib/albums.admin.server.ts` — create/edit/delete albums + slides; image →
  WebP (full/web/thumb), video → compressed MP4 + poster.
- `lib/video-optimize.server.ts` — ffmpeg transcode + poster extraction.
- `app/routes/api/albums/asset/$.ts` — streams album assets from storage (dev /
  no-CDN); serves resized image variants for blur-up + thumbs.
- `app/routes/api/admin/albums/**` — admin CRUD + **bulk** upload endpoint.
- `app/routes/_site/admin/albums/**` — admin UI: create an album, then
  bulk-upload many photos/videos at once, reorder, delete.

## Required env

Same object-storage vars the rest of the app already uses (see `.env.example`):
`S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
`S3_BUCKET`, and `VITE_CDN_BASE_URL` (prod, to serve from the CDN edge).
`ffmpeg` must be on `PATH` for video compression — it already is in the runtime
image; without it, uploads store the original video bytes.

## Rollout order

The migration writes to **shared infra** (S3 + DB), independent of which code is
deployed — so run it first, then ship the code.

1. **Apply the DB migration** (creates the `album` / `album_slide` tables):
   ```sh
   pnpm db:migrate:prod      # prisma migrate deploy
   ```
2. **Seed the existing Alex Wu album** into storage + DB. Run from a checkout
   that still has `public/albums/` (e.g. `main`, or your saved copy):
   ```sh
   pnpm albums:migrate
   # or point at a saved copy if the files are already gone from the repo:
   ALBUMS_SOURCE_DIR=/path/to/saved/albums pnpm albums:migrate
   ```
   It uploads each photo (full/optimized/thumb) and clip (mp4 + poster)
   verbatim, then seeds `Album` + `AlbumSlide`. Idempotent (skips if the album
   already has slides; `--force` to add anyway).
3. **Deploy this branch.** The carousel + library now serve from the DB/storage.
4. The committed removal of `public/albums/` takes effect — build context and
   image shrink, and deploys return to ~3 min.

New albums afterward: **Admin → Library Albums → Create**, then bulk-upload.

## Optional: purge the originals from git history

Removing `public/albums/` from the tree (done in this branch) stops it shipping
going forward, but the ~312 MB of originals **remain in git history** (added in
PRs #286/#287, already merged to `main`). To reclaim the clone size you must
rewrite history and force-push — this was intentionally **not** done
automatically because it must run on `main`, requires a force-push to a shared
branch, and rewrites every commit SHA from that point on (invalidating other
clones and any open PRs based on the old history). Do it deliberately:

```sh
# 1. Install git-filter-repo (https://github.com/newren/git-filter-repo)
pip install git-filter-repo            # or: brew install git-filter-repo

# 2. From a FRESH mirror clone of the repo:
git clone --mirror git@github.com:stickms/rmhstudios.com.git
cd rmhstudios.com.git

# 3. Strip the album media from ALL history:
git filter-repo --path public/albums --invert-paths

# 4. Force-push the rewritten history (coordinate with collaborators first):
git push --force --all
git push --force --tags
```

After everyone re-clones, run `git gc --prune=now --aggressive` to reclaim local
space. Anyone with an existing clone must re-clone or hard-reset.
