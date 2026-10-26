# RMH TF2 HUD Editor

A browser-based editor for Team Fortress 2 custom HUDs: live preview of every HUD page, a code editor and a visual inspector over the real `.res` files, a changed-files view, zip import/export, and account saving, sharing and a workshop.

- App id `rmh-tf2-hud`, routes under `/tf2-hud` (`app/routes/tf2-hud*`), UI in `components/tf2-hud/`, logic in `lib/tf2-hud/`, API in `app/routes/api/tf2-hud/`.
- Design: [`superpowers/specs/2026-10-25-rmh-tf2-hud-editor-design.md`](superpowers/specs/2026-10-25-rmh-tf2-hud-editor-design.md). Plan: [`superpowers/plans/2026-10-25-rmh-tf2-hud-editor.md`](superpowers/plans/2026-10-25-rmh-tf2-hud-editor.md).

## How it fits together

```
lib/tf2-hud/
  kv/        lossless KeyValues parser/serializer, queries, text-to-text edits
  scheme/    clientscheme.res → colours, fonts, borders; platform conditionals ([$WIN32])
  layout/    VGUI proportional layout (integer, engine-exact), drag → .res deltas
  scene/     panel files → scene data (build.ts) → Canvas2D (paint.ts)
  assets/    VTF decoder, image store, fonts, TTF name reader
  project/   overlay model over the base, base loader, diff, paths
  zip/       import (hostile-input safe), export, shared builder
  store.ts   Zustand editor state: overlay, history, selection, view
  *.server.ts   persistence (Prisma + object storage)
```

**The project is an overlay on the TF2 Default base.** A file the author never touched is not stored; it is read from `public/tf2-hud/base/`. That keeps a project small, makes "what changed" a set lookup, and lets "changed files only" exports be real patches.

### The base

`public/tf2-hud/base/` is the filtered TF2 Default HUD (`resource/**`, `scripts/hudlayout.res`, `hudanimations*`, `mod_textures.txt`, `scripts/screens/`, and the `.vmt` material definitions for the HUD) plus `manifest.json` (`[path, size, sha1]` tuples). It is fetched lazily per file; only the manifest loads up front.

- Rebuild it from an extracted TF2 HUD tree: `node scripts/tf2-hud/import-base.mjs <dir>` then `node scripts/tf2-hud/build-manifest.mjs` (`--check` fails when stale).
- **Textures are not bundled.** A texture that cannot be found renders as the engine's pink/black checkerboard. Drop `.vtf`/`.png` files into `materials/…` in the editor (Assets → Textures) and they resolve; `.vmt` `$basetexture` indirection is followed.
- The licence text in `base/LICENSE` ships in every export. Confirm the terms that apply to the base files before publishing them more widely.

### Preview fidelity

- Layout is the engine's: values are virtual 640×480 units scaled by `height/480`, **truncated to whole pixels**, with `r`/`c`/`f` prefixes, `pin_to_sibling*`, `_minmode` variants and platform conditionals.
- `scripts/hudlayout.res` positions HUD elements and overrides the element's own file; dragging an element in the preview edits that block, as authors do by hand.
- Edits keep anchoring prefixes (`r120` stays right-anchored) and change the copy of a repeated key that is live for the previewed platform.
- Fonts: TF2's faces are placeholders until sourced (`lib/tf2-hud/assets/fonts.ts`). Fonts a HUD ships (`.ttf`/`.otf`) register under their internal family name and any `CustomFontFiles` name.
- Not yet: animation playback (`hudanimations_tf.txt` is editable as text), localisation tokens (`#Token` shows its name), 3D model panels (drawn as labelled boxes).

## Editing, history and saving

- **History:** every edit is an undo step; typing and drags coalesce. `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z` / `Ctrl+Y`, and a History tab to jump to any step. `?` lists all shortcuts.
- **Autosave:** drafts save to IndexedDB 1.2 s after the last edit and immediately when the tab hides or closes; the top bar shows the time. Signed-in users with a saved HUD also autosave to their account (toggle in Save & share). `Ctrl/⌘+S` saves a new version, or opens Save & share the first time.
- **Versions:** explicit saves add a version (kept: 100). Autosaves fold into the previous autosave if it is under 15 minutes old. Any version can be restored as a new one.
- **Validation:** syntax, missing `#base`, unknown font/colour/border, missing textures (info only), misplaced or oversized files, uppercase paths.

## Storage and the API

A HUD is rows in `tf2_hud` / `tf2_hud_version` (a JSON manifest per version) plus content-addressed blobs in object storage under `tf2-hud/blobs/<sha1[0:2]>/<sha1>`. Forks and versions share blobs.

Trust model (`lib/tf2-hud/hud.server.ts`):

- A manifest may only reference blobs its author uploaded (`tf2_hud_user_blob`), or can already read by forking. Knowing a hash never grants a file.
- The server re-hashes every upload and takes sizes from the stored blob.
- Paths are re-validated (`sanitizePath`, HUD root folders, extension allow-list); files are served with an extension-derived content type, `nosniff`, `Content-Disposition: attachment` and a sandbox CSP.
- Limits: 25 MB per file, 150 MB and 5,000 files per HUD, 100 HUDs per user.

| Route                                               | Purpose                                               |
| --------------------------------------------------- | ----------------------------------------------------- |
| `GET/POST /api/tf2-hud/huds`                        | workshop list / `?mine=true`; create                  |
| `GET/PUT/DELETE /api/tf2-hud/huds/:id`              | read, save version/metadata, delete (id or slug)      |
| `GET …/:id/file?path=&v=`                           | one file of a readable HUD                            |
| `POST …/:id/fork`, `/like`, `/download`             | fork into your account; toggle like; count a download |
| `POST/DELETE …/:id/share`                           | create / revoke the share link                        |
| `GET …/:id/versions`, `POST …/versions/:n`          | history; restore                                      |
| `GET /api/tf2-hud/share/:token[/file]`              | read-only access through a share link                 |
| `POST /api/tf2-hud/blobs/check`, `PUT /blobs/:sha1` | upload only what the server lacks                     |

Orphaned blobs (from deleted HUDs) are not yet garbage-collected.

## Zip import

Import is the untrusted boundary: entries are sanitised (no traversal/absolute paths), junk and unsupported types skipped, the HUD root is detected inside any nesting (`tf/custom/<name>/…`), letter case is normalised to the base, and unchanged files are dropped. Limits: 5,000 entries, 25 MB per file, 150 MB total — enforced while streaming, so a lying header cannot inflate past them.

## Working on it

```bash
pnpm exec vitest run lib/tf2-hud        # parser round-trip over every base file, layout, zip, history…
node scripts/tf2-hud/build-manifest.mjs --check
```
