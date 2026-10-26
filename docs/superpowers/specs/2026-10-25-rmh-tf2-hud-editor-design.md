# RMH TF2 HUD Editor — design

Status: **approved and implemented** · Date: 2026-10-25 · Owner: stickms

> **As built** (see [`../../tf2-hud-editor.md`](../../tf2-hud-editor.md)): the preview paints with a small Canvas2D scene renderer instead of Konva (lighter, exact text control, no extra bundle); the base is the filtered TF2 default HUD the owner supplied on 2026-10-26 (real `hudlayout.res` and `.vmt` materials — so §6's placeholder layout is not needed); missing textures render as the engine's pink/black checkerboard.

## 1. Intent

A new RMH app, **RMH TF2 HUD Editor**, where anyone can create, edit, test,
save, share and download a Team Fortress 2 custom HUD entirely in the browser.
The preview should look like the game, every HUD page can be visualised, and
the file/folder structure is exactly what TF2 expects, so the downloaded zip
drops straight into `tf/custom/<hudname>/`.

Why: HUD authoring today means editing VDF `.res` files blind, alt-tabbing into
the game and running `hud_reloadscheme`. This closes that loop with a live
preview, a diff view, and community sharing.

## 2. Goals / non-goals / anti-goals

**Goals**

- Start a HUD three ways: **from scratch** (the "TF2 Default" base), **fork
  from the Workshop**, or **upload a zip**.
- Faithful folder structure (`resource/`, `resource/ui/`, `scripts/`,
  `materials/vgui/`, `sound/`, `info.vdf`) in the file tree and in exports.
- Live canvas preview with a screen/page picker covering every HUD panel, plus
  test controls (class, team, health, ammo, uber, round state, resolution, 4:3 /
  16:9 / 16:10, HUD scale) so each state can be visualised.
- Proper `.res` (KeyValues/VDF) support: a lossless parser and serializer
  (comments, ordering and `#base`/`#include` preserved), a syntax-highlighted
  code editor, and a visual property inspector for the same data.
- Changed-files view: diff of every file against the TF2 Default base, with a
  "modified only" tree filter and per-file revert.
- Custom fonts (`.ttf/.otf` with `clientscheme.res` font definitions and
  `customfontfiles`) and custom sounds (`.wav/.mp3` with a `game_sounds`
  override) with in-editor audio preview.
- Accounts: autosave, versions/history, private/unlisted/public visibility,
  share links, Workshop publishing, fork counts, likes, download as zip.
- Works signed out (local OPFS/IndexedDB draft); sign in to save to the cloud.

**Non-goals (v1)**

- Running the game or the Source engine; no `hud_reloadscheme` bridge.
- Bundling Valve fonts, sounds, textures or layouts.
- Real-time multiplayer co-editing.
- Editing VTF/VMT binary textures beyond upload/replace and PNG preview.

**Anti-goals** — failure even if it technically works:

- A preview that looks plausible but silently diverges from game semantics
  (xpos/ypos modifiers, `wide`/`tall` with `f`/`r`/`c` prefixes, proportional
  scaling, `zpos`, `visible`/`enabled` flags). Fidelity bugs are the main risk.
- Exports that TF2 refuses to load (bad folder layout, a rewritten file that
  lost data).
- Shipping Valve-owned assets.

## 3. Constraints

- **Base files:** the commit
  `stickms/stickshud@b0635b402419f602c72dfaa9835b3a0795622623` ("Added base tf2
  hud files") is the **"TF2 Default"** base. It is 735 files, 734 `.res` plus
  `ui/notifications/notification_manifest.txt`, all under `resource/`.
- **Licence:** that repo is **GPL-3.0**. Derived HUDs inherit it. Every export
  and share page carries the licence and a notice; the base is vendored with its
  `LICENSE`. (My call; flag if you want a different notice.)
- **Missing from the base:** `scripts/hudlayout.res`, `hudanimations_*.txt`,
  `materials/`, fonts, sounds. See §6.
- **Fonts:** placeholders until the TF2 fonts are sourced; the font layer is a
  swappable registry so dropping them in changes no code.
- **Repo conventions** (CLAUDE.md): TanStack Start routes, `defineHandler` for
  APIs, zod-validated input, rate-limited writes/uploads, Prisma, i18n through
  `t()`, catalog entry in `lib/catalog/apps/`, commit gate, no new warnings.
- **Stack already present:** `jszip`, `konva`, CodeMirror 6, `sharp`,
  `@aws-sdk/client-s3` (object storage).
- **Visual identity:** a full-screen app, so it uses the `--app-*` contract
  (`components/shared/app-theme.css`, `AppShell`) re-skinned to a TF2 scheme:
  cream/tan paper, rust orange, RED/BLU team accents, grungy slab type. Rim /
  jelly material is not used inside the app chrome. Dedicated theme tokens, not
  raw palette colours, so the design-consistency gates pass.

## 4. Approaches considered

Preview rendering:

1. **Canvas (Konva) scene graph driven by the parsed `.res` tree — chosen.**
   Each KeyValues panel maps to a node; we implement the VGUI layout rules in
   one tested module. Pixel-controlled, zoomable, hit-testable (click a panel
   in the preview to select its `.res` block), exportable to PNG.
2. DOM/CSS rendering. Easy text, but VGUI proportional scaling, borders and
   font metrics fight CSS; hit-testing is easy, fidelity is worse.
3. Server-rendered screenshots. Not interactive; rejected.

Filling the missing base data (§6): **placeholder-first with an optional
"import your own `tf/` files" upgrade** (chosen), versus commit-only boxes, or
waiting for `scripts/` and `materials/` to land in stickshud. All three share
one asset-resolution layer, so adding the real files later is a data change.

## 5. Architecture

```
app/routes/tf2-hud/ …            routes (editor, workshop, share, my HUDs)
app/routes/api/tf2-hud/ …        defineHandler endpoints
components/tf2-hud/              UI: file tree, editor, inspector, preview, dialogs
lib/tf2-hud/
  kv/        parse.ts serialize.ts  lossless KeyValues; includes #base/#include
  layout/    VGUI rules: proportional scale, xpos/ypos/wide/tall modifiers,
             alignment, zpos, scheme colour & font resolution, borders
  scene/     panel → Konva node mapping, per-element renderers
  fixtures/  test state: classes, teams, health/ammo, round states, killfeed…
  pages/     registry: HUD page → files + fixture + needed assets
  assets/    resolver (project → imported → bundled placeholder), font registry
  project/   in-memory project model, undo/redo, file ops, diff vs base
  zip/       import (validate, detect HUD root) and export (jszip)
  vdf/       info.vdf + game_sounds helpers
  store.ts   Zustand editor state
  *.server.ts persistence, storage, publishing
```

- **KeyValues parser:** tokenizer → CST that keeps comments, whitespace-only
  structure choices, duplicate keys and key order, so a no-op load/save is
  byte-identical (property-tested on all 734 base files).
- **Layout engine:** pure functions, no DOM, so they are unit-tested against
  hand-verified cases. Screen is 640×480-based proportional with the game's
  scaling rules; resolution/aspect are test controls.
- **Asset resolver order:** project file → user-imported `tf/` files (OPFS) →
  bundled placeholder. Anything resolved to a placeholder is flagged in the UI.
- **Persistence:** a HUD is metadata + a manifest of files. File bytes go to
  object storage (S3 key space `tf2-hud/`) content-addressed by hash, so forks
  and versions share blobs. Signed-out drafts live in OPFS.

### Data model (Prisma, new)

`Tf2Hud` (owner, slug, title, description, tags, visibility, baseRef, forkOf,
licence, counters) · `Tf2HudVersion` (hud, number, manifest JSON mapping path →
blob hash, size, message, createdAt) · `Tf2HudBlob` (hash, size, storageKey,
refCount) · `Tf2HudLike` · `Tf2HudShare` (token, hud, version, expiry). Only the
manifest changes between saves, which keeps history cheap.

### API (`/api/tf2-hud/*`, all via `defineHandler`)

list/search Workshop · get HUD + version · create/fork · save version (diff
upload: only missing blobs) · publish/unpublish · like · share-link create/revoke
· zip download · blob upload (size, type and count limits, rate-limited, zip
bomb and path-traversal guards on import).

## 6. Fidelity plan and the known gap

The base gives us the **dialogs and menus** (`resource/ui/*.res`, scheme, chat,
spectator, loadout, scoreboard-adjacent panels), which can be rendered from real
data. The **in-match HUD** (health, ammo, class status, cap points, kill feed,
crosshair/info) is positioned by `scripts/hudlayout.res`, which the commit lacks.

v1 handling:

- A bundled, clearly-labelled **placeholder `hudlayout.res`** and placeholder
  textures reproduce default geometry so the panels are visible and editable.
  Elements built on placeholders carry an "approximate" badge.
- "Import your TF2 files" lets a user drop their own `tf/` extraction; the
  resolver then uses the real `hudlayout.res`, animations and materials, giving
  true 1:1 for that user. Nothing of Valve's is stored server-side or shared.
- Adding the real files to stickshud later (or to our vendored base) removes the
  badges; no engine change.

Animations (`hudanimations_*.txt`): parsed and playable for the common events
(health pulse, ammo low, uber ready) in v2; v1 parses and lets you edit them as
text.

## 7. UX

- **Layout:** top bar (HUD name, save state, undo/redo, diff, share, download) ·
  left file tree (TF2 structure; filter: all / modified / added / errors) ·
  centre preview with page picker, test panel and zoom · right panel with
  Inspector / Code / Diff tabs.
- **Editing:** code view (CodeMirror with KeyValues mode, schema-aware
  completion for known keys and enum values, diagnostics) and inspector (typed
  fields, colour picker resolved against scheme colours, font/sound/image
  pickers, numeric nudge with live preview). Click-to-select and drag/resize
  panels in the preview write back to `xpos/ypos/wide/tall`.
- **Files:** new/rename/duplicate/delete, drag-drop upload of fonts, sounds,
  images, folders. PNG/TGA previews; VTF/VMT treated as opaque with a metadata
  stub.
- **Validation:** missing `#base` targets, unknown font/colour/image references,
  unparseable files, files in the wrong folder, oversized assets.
- **Quality-of-life:** command palette, keyboard shortcuts, snap/guides in the
  preview, PNG screenshot export, pinned test presets, side-by-side compare with
  the base, search across all files.
- **Sharing:** public Workshop (search, tags, sort, likes, forks, screenshots),
  unlisted share links, read-only embed view, fork-to-edit.
- Full i18n via `t()`; keyboard and screen-reader accessible chrome (the canvas
  has a text outline of panels as its accessible equivalent).

## 8. Phasing

Each phase ships working and gated.

1. **Foundation:** catalog entry, routes, TF2 theme, KeyValues parser with
   round-trip tests, vendored base, project model, file tree, code editor.
2. **Preview:** layout engine + scene renderer for the base's menus/dialogs,
   page picker, test controls, click-to-select.
3. **Import/export + assets:** zip import/export, fonts, sounds, images,
   changed-files view and diff, validation.
4. **Accounts + sharing:** Prisma models, storage, autosave, versions, share
   links, Workshop, forks, likes.
5. **Fidelity:** placeholder `hudlayout.res`, in-match panels, "import your
   TF2 files", animations playback, drag/resize in preview.

## 9. Testing

Vitest, colocated under `lib/tf2-hud/__tests__/`: parser round-trip over every
base file, layout-engine cases, zip import hostile inputs (traversal, bombs,
huge counts), diff correctness, API handlers. Component tests for tree/filter.
A Playwright smoke for create → edit → preview → download.

## 10. Decided by you / my calls

Decided by you: new app named "RMH TF2 HUD Editor", TF2-styled UI and fonts,
base from stickshud commit `b0635b4`, placeholder fonts for now, the base is the
"TF2 Default" HUD.

My calls (shout if you disagree): Konva canvas rendering; placeholder-first with
BYO-files upgrade; content-addressed blob storage; GPL-3 notice on exports;
route prefix `/tf2-hud`; phased delivery above; animations playback deferred to
phase 5; no jelly material in app chrome.

## 11. Left to the builder

Exact TF2 theme token values and open placeholder fonts; KeyValues edge cases
(escape sequences, conditionals like `[$X360]`); file-size limits; Workshop
moderation hooks (reuse the site's existing report flow).
