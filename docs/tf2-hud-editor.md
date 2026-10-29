# RMH TF2 HUD Editor

A browser-based editor for Team Fortress 2 custom HUDs: live preview of every HUD page, a code editor and a visual inspector over the real `.res` files, a changed-files view, zip import/export, and account saving, sharing and a workshop.

- Part of the [TF2 Hub](tf2-hub.md). App id `rmh-tf2-hud`, routes under `/tf2/hud-editor` (`app/routes/tf2/hud-editor/`), UI in `components/tf2-hud/`, logic in `lib/tf2-hud/`, API in `app/routes/api/tf2-hud/` (unchanged). Static base assets are still served from `/tf2-hud/base` and `/tf2-hud/fonts`.
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
- **Textures:** the base carries the HUD's most-used `.vtf` files (`materials/hud/**`, ~515 of them, supplied 2026-10-26 — the ones with no `.vmt` of their own are reached through other materials' `$basetexture`). Anything not shipped renders as the engine's pink/black checkerboard; drop `.vtf`/`.png` files into `materials/…` in the editor (Assets → Textures) and they resolve. Still missing from the pack: the logo (`materials/logo/TF2_Logo.vtf`) and most of `materials/vgui/**`.
- **How a texture is resolved** (`lib/tf2-hud/assets/{vmt,vtf,images}.ts`): the panel's `image` → `materials/vgui/<image>`; the `.vmt` there is authoritative — `patch` includes are followed, then `$basetexture` → `.vtf`, honouring `$color` (baked in), `$alpha`, `$additive` (drawn with `lighter`), `$translucent`/`$alphatest` (without either the texture is opaque, like the engine) and `$frame`. VTF 7.0–7.5 header layouts, mip/frame order, DXT1/3/5 and the 8/16/32-bit formats are decoded to the top mip. An `ImagePanel` without `scaleImage` draws at the texture's own pixel size, clipped to the panel; with it, stretched. `teambg_2`/`teambg_3` follow the previewed team and `CTFClassImage` shows the previewed class. Bytes are fetched on demand, so a page only downloads the textures it draws.
- The licence text in `base/LICENSE` ships in every export. Confirm the terms that apply to the base files before publishing them more widely.

### Preview fidelity

- Layout is the engine's: values are virtual 640×480 units scaled by `height/480`, **truncated to whole pixels**, with `r`/`c`/`f` prefixes, `pin_to_sibling*`, `_minmode` variants and platform conditionals.
- `scripts/hudlayout.res` positions HUD elements and overrides the element's own file; dragging an element in the preview edits that block, as authors do by hand.
- Edits keep anchoring prefixes (`r120` stays right-anchored) and change the copy of a repeated key that is live for the previewed platform.
- Fonts: the six TF2 faces are bundled for preview (`lib/tf2-hud/assets/fonts.ts`). Fonts a HUD ships (`.ttf`/`.otf`) register under their internal family name and any `CustomFontFiles` name.
- **Panel tree and order** (`scene/build.ts`): a file's panels form a tree. Siblings paint lowest `zpos` first, ties in file order; a panel paints before its children; children are positioned relative to their parent and clipped to it; a hidden panel hides its children; HUD elements (frames from `hudlayout.res`) order by their own `zpos`. `scripts/hudlayout.res` is always loaded — without it frames are missing and everything lays out against the screen.
- **Variables:** `%name%` takes the test-panel value; names with no fixture get a stand-in that reads like the real thing (`lib/tf2-hud/placeholders.ts`: times, counts, prices, class names, otherwise the name in words), and `#TF_Some_Token` is looked up in the TF2 language file (`resource/tf_<language>.txt`, UTF-16 KeyValues, `lib/tf2-hud/localisation.ts`) — the site's language when the game ships that file, else English, switchable from the preview toolbar, with English filling any token the chosen language lacks. Per token, the HUD's own `resource/*_<language>.txt` and `*_english.txt` win over the game's (`layeredTokens`, the same lookup the browser game uses); a game file can be loaded from the toolbar (kept on the device, never exported). The game's language files are published with the HUD base by the asset sync (`scripts/tf2-assets/hud.py`, every language TF2 ships, Brotli; counted against the game's storage budget); the copy in `public/tf2-hud/base/` does not ship them (they are Valve's) — drop `tf_english.txt` there and run `node scripts/tf2-hud/build-manifest.mjs` to try them locally. Only the selected language (and English) is fetched. Without a file a token shows as "Some Token".
- **Panel files loaded into panels:** a panel whose class loads its own file at run time (the freeze cam's `CTFFreezePanelHealth` → `freezepanelkillerhealth.res`, `CTFSpectatorGUIHealth` → `spectatorguihealth.res`) shows that file's panels inside it, as the game does; on a page that also lists the file it is drawn once, nested. Labels drop VGUI hotkey markers (`&3` draws "3"), and positions honour the `s` / `p` modifiers (`cs-0.5`: centred by half the panel's own width).
- **Weapon and class HUDs** (`lib/tf2-hud/game-state.ts`): the test panel's class, weapon, meter, stickies, sentry level and transient events decide which panels the game would show — the Medic meter only for a Medic, the Vaccinator's four bars instead of one, a weapon's own `huditemeffectmeter_*`, the Engineer's buildings, the Spy's disguise, kill-streak/alert/target-ID only when switched on. The _Weapons & classes_ pages (Medic Über/Vaccinator, Demoman stickies/charge, Sniper bow/focus, Engineer buildings and PDA build/destroy, Spy, Scout, Pyro, Soldier, Heavy) set that state for you.
- **Resolution:** presets from 640×480 to 5120×1440, or a custom size (swap, snap to 4:3 / 5:4 / 16:10 / 16:9 / 21:9 / 32:9, "use this screen"); the toolbar shows the aspect and the 480-high virtual canvas width. Platform conditionals (Windows / Linux / macOS / console) and the `_minmode` layout are toggles beside it.
- **Animations** play (see _Animations_ below). Not simulated: sounds (`PlaySound`), `FireCommand`, and animated properties with no visible effect here (`Blur`, `TextScan`, `PulseAmount`).
- **3D** — model panels show the loadout builder's own 3D player and items, and the backpack page shows a full page of items (see _3D and items_ below). Where WebGL, the synced models or the catalog are missing, panels are labelled boxes as before.
- **Alpha:** a panel's own `alpha` (and an animation's) fades it and everything inside it, as in the game.

## Colours from the preview

Select a panel and its colours appear beside it as chips (`ColorChips.tsx`): click one to change it in place. If the colour is tied to a scheme colour (`TanDark`), the popover lists what you can change: **this element only** (choosing a number detaches it from the name) or **each colour in its name chain, everywhere** (`TanDark`, then `Tan`), with a count of what else on the page and in the scheme uses it. `lib/tf2-hud/color-vars.ts` works that out (and `wouldCycle` refuses a colour that would end up pointing at itself); edits to a scheme colour or a `BaseSettings` name go through `scheme/edit.ts`. Where a panel edit lands (a block, a panel override, the file, the `_minmode` copy) is decided once in `lib/tf2-hud/panel-edit.ts`, shared by the inspector and the chips.

## AI help

The assistant (top bar, or any ✦ button) never writes files. It proposes key-level changes against the files it was shown, the editor dry-runs them with its own lossless edits and shows each key's before and after, and applying is one undo step. What was added:

- **It knows what you are looking at.** The ✦ button in the inspector header, the colour popover, a problem in the Problems tab and the Scheme tab's "Describe a look" box each open it with a context (`lib/tf2-hud/ai-context.ts`: the panel's name, control, key path, layout, text, font, colours with the scheme names they go through, and its block). The context also names the files the answer needs, so the "which files?" model call is skipped. It is built from your own project, capped, stripped of control characters, and sent as data (`SELECTED:` in the prompt, wrapped like the player's own words), never as instructions. A chip above the message box shows it and removes it.
- **Palettes:** describe a look ("dark teal with amber") and the assistant changes several scheme colours together, keeping shared colours aliased and text readable; you see every swatch before applying.
- **Questions:** "what does this do?" is answered in the summary with no changes.
- **Fix problems:** the ✦ on a problem asks for a fix to that file.
- Server: the `edit` stage of `POST /api/tf2-hud/ai` accepts `context`; prompt `tf2-hud-edit` is at version 2.

## Blocks

A **block** is a named group of panels that share a look, so "all the charge bars" is edited once instead of one `.res` entry at a time. Blocks never replace the files: a block writes ordinary keys into its members, and the export is a normal HUD.

- **Make one:** Shift-click panels in the preview (or Shift-drag a box round them, or Shift-click in the outline), then _Make block_ in the **Blocks** tab; or take a suggestion there. Built-in groupings (`lib/tf2-hud/blocks/presets.ts`: the meter bars, labels and backgrounds across every meter file, the health and ammo numbers) are rules over file names and controls, so they find the panels in whatever HUD is open; panels that look alike and sit near each other are suggested from the current page. A panel is in at most one block.
- **Shared values:** looks and sizes only (`SHARABLE_KEYS`: colours, font, border, `wide`/`tall`, image keys…). Position is relative to each panel's parent, so it is moved and arranged, never copied. Setting a value writes it into every member that follows the block, as one undo step; `_minmode` copies and the platform conditional that is live are respected, and applying twice changes nothing.
- **Exceptions:** in the inspector, a panel in a block marks each shared value as following the block (a dot) or overridden (a reset arrow). _Edits change the whole block / only this panel_ chooses what an edit does; "only this panel" pins that key. Hand edits in the code view are never overwritten: the block lists them as **differs from the block** (use for all, keep as an override, or restore).
- **Moving and arranging:** Alt-drag (or Alt-arrow) moves a whole block; a multi-selection drags together. Align, distribute and stack (with a gap) work on the selection or the open block, keep each panel's own anchoring (`r120` stays right-anchored), and do not move a panel twice when it rides on one that moves (a child, or a panel pinned to a moving sibling).
- **Storage:** the sidecar file `resource/_rmh_blocks.txt` (JSON, ignored by the game). It is saved with the project and left out of the zip unless _Include block data_ is ticked.
- Code: `lib/tf2-hud/blocks/` (pure engine; `actions.ts` talks to the store), `components/tf2-hud/{BlocksPanel,BlockBar,PropControl}.tsx`.

## Play mode

The play button in the preview toolbar turns the preview into the HUD. Buttons run their `command` (`lib/tf2-hud/play/commands.ts`): dismiss commands go back, `openloadout`/`open_charinfo`/`open_store`/`jointeam …`/`select N` and a few more open the matching page (picking a class starts a match); anything else is reported rather than guessed. A hovered button takes its `armed…` colours. On in-game pages the keys in the bar above the preview drive a small match (`play/sim.ts`: weapon switch, fire, reload, damage, heal, die/respawn, kill, target ID, alert, plus a 1 Hz clock for the round timer, Medic charge and weapon meters), through the same state as the Test panel. Esc exits.

## Test in game

**Test in game** (top bar) saves the draft and opens `/tf2/play?hud=draft:<id>` in a new tab, where the
HUD is drawn by this editor's own renderer from the live match (see [the game's docs](tf2-game.md#custom-huds-in-game)).
Later saves reach the open game (it re-reads the draft). In the game, pause → HUD → **Edit HUD** opens this
editor over the match; its back control and **Test in game** return to the match.

## 3D and items

`components/tf2-hud/ModelLayer.tsx` draws the game's 3D content over the preview: class model panels get the loadout builder's player, item panels an item (or its icon), and the toolbar's second 3D button puts a player behind the whole HUD. At most four live WebGL views are shown at a time. The builder's viewer logic lives in `usePlayerParts` and the single import surface `components/tf2-hud/loadout/embed.tsx` (`PlayerStage`, `ItemStage`, `useSampleInventory`), so there is one implementation. `lib/tf2-loadout/sample.ts` picks a plausible loadout and backpack from the catalog. The **Backpack** page's cells are made by the game at run time; `lib/tf2-hud/scene/inventory.ts` lays out a full page (10 × 5) from the panel file's own numbers, and fills it with the sample items. Also new pages: Item inspection and Mann Co. Store.

## Animations

`scripts/hudanimations_manifest.txt` lists the scripts; `lib/tf2-hud/anim/` parses them (`parse.ts`), runs them (`controller.ts`, deterministic, with the game's rules: a new `Animate` replaces the old on that variable, `StopEvent` cancels an event's pending and running work, looping events run themselves, work per step is bounded) and turns running values into property overrides for the scene (`style.ts`, through `SceneContext.styleFor`). Animated: `Alpha`, `FgColor`/`TextColor`, `BgColor`, `Position`/`XPos`/`YPos`, `Size`/`Wide`/`Tall`, `SetVisible`; curves `Linear`, `Accel`, `Deaccel`, `Spline`, `Pulse`, `Flicker`, `Gain`, `Bias`, `Bounce`. In Play mode the game's own triggers start events as the numbers change (`play/anim-events.ts`: overheal, dying, low ammo, Über ready, damage); the Test panel's **Animations** runner starts any event by name. The runtime's timer only runs while something is moving.

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
