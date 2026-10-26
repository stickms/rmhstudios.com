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

## Colour, font and scheme tools

Panels refer to colours, fonts and borders by **name**, and those names live in `clientscheme.res` — so the editor shows what a value really resolves to and lets you change it at either level.

- **Colour picker** (`ColorPicker.tsx`): saturation/brightness square, hue and opacity, hex / `rgb()` / VGUI `r g b a` entry, eyedropper, recent colours and a searchable swatch grid of scheme colours. Dragging writes numbers; choosing a swatch writes the _name_. The field always shows the chain (`TanDark → 117 107 94 255`) and warns when a value is neither a colour nor a scheme name. "Save" turns the current colour into a new scheme colour.
- **Font picker** (`FontPicker.tsx`): every scheme font rendered in the face that is active at the current resolution (screen-height windows vs. proportional faces), with size and weight, and a status — _custom file_, _TF2 face_, _system font_ or _not installed_. The face field has a grouped browser (TF2 faces · this HUD's fonts · system fonts), each shown in itself; any other installed family can be typed in.
- **Fonts, in order of precedence:** a font file in the HUD (`resource/fonts/*.ttf`, registered under its internal name) → the six bundled TF2 faces (`TF2`, `TF2 Build`, `TF2 Secondary`, `TF2 Professor`, `tfd`, `Team Fortress Logo`, served from `public/tf2-hud/fonts/` and used by the preview _and_ the app chrome) → a system stack. The bundled faces are Valve's: they exist for preview only and are never written into an exported HUD or stored in an account.
- **Scheme tab** (`SchemePanel.tsx`): all colours and `BaseSettings`, all fonts (with a face editor: name, size, weight, flags, screen-height window, add a face) and all borders drawn with the preview's own border painter. Editing a scheme entry updates every panel that names it, live. Entries used by the selected panel are highlighted.
- **Inspector previews**: each position/size value is explained at the current resolution ("120 units from the bottom edge → 810 px from the top"), focusing one draws its measurement in the preview, `labelText` shows the substituted text (`%Health%` → `125`), `image` shows the texture or the missing-texture checkerboard, borders show a swatch, and elements positioned by `hudlayout.res` say so.

## Editing, history and saving

- **History:** every edit is an undo step; typing and drags coalesce. `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z` / `Ctrl+Y`, and a History tab to jump to any step. `?` lists all shortcuts.
- **Autosave:** drafts save to IndexedDB 1.2 s after the last edit and immediately when the tab hides or closes; the top bar shows the time. Signed-in users with a saved HUD also autosave to their account (toggle in Save & share). `Ctrl/⌘+S` saves a new version, or opens Save & share the first time.
- **Versions:** explicit saves add a version (kept: 100). Autosaves fold into the previous autosave if it is under 15 minutes old. Any version can be restored as a new one.
- **Validation:** syntax, missing `#base`, unknown font/colour/border, missing textures (info only), misplaced or oversized files, uppercase paths.

## Look and feel

The editor is plain Team Fortress 2, not the site's Plasmatic Jelly: flat panels (`--tf2-panel`), square-ish corners, the TF2 faces, and the system cursor. On `/tf2-hud/**` the jelly services and the globe cursor are not installed at all (`lib/native-material-routes.ts`, read by `Providers` and `GlobeCursorRoot`), tabs are `TfTabs` (flat, orange underline) and toggles are native checkboxes. Do not add `glass-*` classes or `data-jelly*` attributes here.

## Storage and the API

A HUD is rows in `tf2_hud` / `tf2_hud_version` (a JSON manifest per version) plus content-addressed blobs in object storage under `tf2-hud/blobs/<sha1[0:2]>/<sha1>`. Forks and versions share blobs.

Trust model (`lib/tf2-hud/hud.server.ts`):

- A manifest may only reference blobs its author uploaded (`tf2_hud_user_blob`), or can already read by forking. Knowing a hash never grants a file.
- The server re-hashes every upload and takes sizes from the stored blob.
- Paths are re-validated (`sanitizePath`, HUD root folders, extension allow-list); files are served with an extension-derived content type, `nosniff`, `Content-Disposition: attachment` and a sandbox CSP.
- Limits (`HUD_LIMITS`, `maxBytesFor`; sizes are uncompressed, i.e. what the game loads): per file — 64 KB `.vmt`, 1 MB text, 3 MB font, 4 MB sound or image (8 MB hard ceiling); per HUD — 2,000 files and 40 MB; per account — 400 MB of distinct uploaded files and 50 HUDs. The editor checks the same numbers before uploading and says which file is over.

**Compression.** Object storage is the site's R2/S3 layer (`lib/storage/s3.server.ts`). The browser gzips each upload (`CompressionStream`, skipped for PNG/JPEG/Ogg/MP3, sent with `x-upload-encoding: gzip`); the server inflates it with a hard output ceiling (a decompression bomb is refused, not allocated), checks the SHA-1 of the _uncompressed_ bytes, then stores it Brotli-compressed unless that saves under 5% (`blob-codec.server.ts`). `tf2_hud_blob.size` is the real size, `storedSize` the bytes on disk, `encoding` is `none` or `br`; files are decoded again, with the same bounded ceiling, when served. Because identity is the uncompressed hash, dedupe and manifests are unaffected.

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

Import is the untrusted boundary: entries are sanitised (no traversal/absolute paths), junk and unsupported types skipped, the HUD root is detected inside any nesting (`tf/custom/<name>/…`), letter case is normalised to the base, and unchanged files are dropped. Limits: 5,000 entries, 8 MB per file, 80 MB total — enforced while streaming, so a lying header cannot inflate past them.

## Working on it

```bash
pnpm exec vitest run lib/tf2-hud        # parser round-trip over every base file, layout, zip, history…
node scripts/tf2-hud/build-manifest.mjs --check
```
