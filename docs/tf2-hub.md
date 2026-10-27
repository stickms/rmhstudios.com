# RMH TF2 Hub

One app, three parts, all under `/tf2` and sharing the TF2 palette shell (`app/routes/tf2.tsx`, `components/tf2-hud/Tf2HudShell.tsx`):

| Route                                                           | What                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `/tf2`                                                          | The hub menu (`Tf2HubLanding`).                                      |
| `/tf2/hud-editor` (`/editor`, `/mine`, `/h/:slug`, `/s/:token`) | The HUD Editor — see [`tf2-hud-editor.md`](tf2-hud-editor.md).       |
| `/tf2/loadout` (`/mine`, `/l/:slug`)                            | The loadout builder, your saved loadouts, and a shared loadout.      |
| `/tf2/workshop?type=huds\|loadouts`                             | The RMH Studios workshop: community HUDs and loadouts, one tab each. |

The HUD editor used to live at `/tf2-hud`; those URLs no longer exist (no redirects). Static assets under `public/tf2-hud/` keep their URLs.

## Loadouts

A loadout is one class plus `slots`: `{ [slotKey]: { item: defindex, paint?: defindex, effect?: id } }`. Slot keys are `primary secondary melee building pda pda2 action cosmetic1-3 taunt1-8`; which weapon slots a class shows comes from the catalog, not code. Items are referenced by the game's own defindex.

- **Per-class drafts** live in `localStorage` (`lib/tf2-loadout/local-drafts.ts`), so building needs no account.
- **Saved loadouts** (`Tf2Loadout`, `/api/tf2-loadout/loadouts*`) belong to an account, are `PRIVATE`, `UNLISTED` (link only) or `PUBLIC` (listed in the workshop), and can be liked and forked ("Edit a copy"). Visibility reuses the HUD enum. 100 per account.
- On save the server checks every item against the current catalog (exists, class can use it, fits the slot, paint only on paintable items, effects only on cosmetics/taunts, no overlapping equip regions, no duplicate cosmetic). Reads never re-validate: an item the game later retires stays in the saved loadout and shows as "no longer in the game".

## The item catalog (auto-updating)

`lib/tf2-loadout/catalog-build.ts` turns the game's `items_game.txt` and `tf_english.txt` into a compact catalog (~2.4k loadout items, paints, unusual effects, equip-region conflicts; ~250 KB). It follows the schema's own rules — `prefab` inheritance, per-class slot overrides in `used_by_classes`, `equip_conflicts` — and names no items, so a game update changes data, not code. Two families are deliberately left out: tournament medals and war-paint weapon skins.

`lib/tf2-loadout/catalog.server.ts` owns the source and the refresh:

1. **Source.** Default: the public [SteamDatabase/GameTracking-TF2](https://github.com/SteamDatabase/GameTracking-TF2) mirror. With `STEAM_API_KEY` set: Valve's own schema URL from `IEconItems_440/GetSchemaURL` (current the moment Valve ships), plus `GetSchemaItems` for **inventory icons**.
2. **Storage.** One row in `tf2_loadout_catalog` (Brotli JSON), so every web instance serves the same snapshot.
3. **Refresh.** No cron and nobody pushes anything: a read serves the stored snapshot and, when it was last checked more than 6 hours ago, refreshes it in the background. The mirror is queried with `If-None-Match`, so an unchanged schema is a 304. A failed refresh keeps the previous snapshot and backs off 15 minutes. The first-ever read builds synchronously.
4. **Serving.** `GET /api/tf2-loadout/catalog` — public, ETag = schema hash, `max-age` 15 min + a day of stale-while-revalidate.

## 3D models

The builder shows a 3D view of any item that has a model (`ItemModelViewer` → `Viewer3D`, three.js via react-three-fiber). The viewer, three.js and the model are all lazy: nothing loads until an item with a model is selected, and the canvas renders on demand (no idle cost), with orbit and zoom.

- **Where models live.** GLB files in the site's object storage at `tf2-models/<defindex>.glb`, or `tf2-models/<defindex>_<class>.glb` for an item with one model per class (the viewer prefers the per-class file for the selected class). `GET /api/tf2-loadout/models` lists which exist (cached 5 min) and `GET /api/tf2-loadout/models/:name.glb` serves one. An item with no GLB shows "No 3D model for this item yet."
- **Paint.** A material flagged `extras.tint = true` in the GLB has its base colour multiplied by the paint colour.
- **What not to upload:** `.vpk` files. The site serves **GLB** files; a VPK is the game's packed archive you extract _from_.

### Keeping the game files current (automatic)

Nothing here is uploaded by hand. `.github/workflows/tf2-assets-sync.yml` runs daily, after every deploy, and on demand (Actions → tf2-assets-sync → Run workflow), and keeps three things in object storage current:

| What                                                         | Where                                                | Built by                        |
| ------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------- |
| Item 3D models (GLB, textures baked in as WebP)              | `tf2-models/<defindex>[_<class>].glb`                | `scripts/tf2-assets/convert.py` |
| Item inventory icons (the pictures on the item tiles, WebP)   | `tf2-icons/<defindex>.webp`         | `scripts/tf2-assets/icons.py`          |
| Item inventory icons (the pictures on the item tiles, WebP)   | `tf2-icons/<defindex>.webp`         | `scripts/tf2-assets/icons.py`          |
| Item inventory icons (the pictures on the item tiles, WebP)   | `tf2-icons/<defindex>.webp`         | `scripts/tf2-assets/icons.py`          |
| HUD editor base: panels, schemes, materials **and textures** | `tf2-hud-base/<path>`                                | `scripts/tf2-assets/hud.py`     |
| One state file per channel                                   | `tf2-models/_state.json`, `tf2-icons/_state.json`, `tf2-hud-base/_state.json` | `scripts/tf2-assets/publish.ts` |

**Why a login is needed.** Valve's free dedicated-server download carries the _index_ of every texture but not the texture data, and the client's content depot refuses anonymous logins. The job therefore signs in to Steam on the CI runner with an account that owns TF2 (free to add). Use a dedicated account with Steam Guard off; the credentials exist only as repository secrets and only on the runner, never on the VPS.

**Secrets** (Settings → Secrets and variables → Actions): `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION`, `STEAM_USER`, `STEAM_PASS` (no Steam API key is used anywhere). While any is missing the job ends early with a notice and uploads nothing.

**What keeps it cheap** (in the order it applies):

1. **Gate.** One GET of each channel's state file, compared with the game's current public Steam build id. Same build → the job stops before downloading anything.
2. **Per-file hashes.** Every output carries a hash of exactly what it was built from (model + materials + textures + converter version; for HUD files, the file's own SHA-1). The state file is the only index — no bucket listing — and only files whose hash changed are converted and uploaded.
3. **Compression.** Changed files are Brotli-compressed and stored with `Content-Encoding: br` (kept raw when Brotli saves under 5%). `readModel` and `/api/tf2-hud/base` hand the stored bytes straight to browsers that accept `br`.
4. **Cleanup.** The 30+ GB install is deleted as soon as extraction finishes, and again if the job fails; the runner is discarded anyway. Objects for items that left the game are only deleted when a manual run sets **prune**, and never for a model that merely failed to convert this time.

`force` rebuilds and re-checks everything; `limit` converts only N models (for testing). Bump `CONVERTER_VERSION` in `convert.py` (and `MODEL_BUILDER_VERSION` in `lib/tf2-loadout/model-sync.ts`) when the converter's output changes, so every model is rebuilt once.

**HUD editor.** The editor asks `/api/tf2-hud/base/manifest.json` first; if a sync has published, that manifest and every file come from storage, otherwise it uses the copy shipped in `public/tf2-hud/base`. The two are never mixed.

**What the converter does.** `srcmodel.py` reads the Source model (MDL v44–49, VVD v4, VTX v7): LOD 0 of the default body groups, bind-pose geometry, normals, UVs, and the materials of skin family 0. `srctex.py` reads the VMT (following `patch` includes) and decodes the VTF (DXT1/3/5 and the common uncompressed formats) to WebP, capped at 512 px. `glb.py` writes the GLB; a material whose VMT blends the paint colour by base alpha is flagged `extras.tint`. Skeletons and animation are not exported — the cosmetics are static.

To try it on a few models locally you need a game install: `python3 scripts/tf2-assets/convert.py --root <install> --manifest model-manifest.json --out out --limit 20` (manifest from `pnpm exec tsx scripts/tf2-models/model-manifest.ts`), then open the GLBs in any glTF viewer.

### Producing the models by hand (fallback)

The older manual route still works if the automatic sync is not set up: list the needed files with `scripts/tf2-models/model-manifest.ts`, extract and convert them yourself, name them with `scripts/tf2-models/rename-glb.ts`, and upload with `scripts/tf2-models/upload.ts`. Prefer the sync — it is incremental and keeps itself current.

## Sign in with Steam

The login page offers Steam alongside Discord and GitHub. Steam speaks OpenID 2.0 rather than OAuth, so `lib/auth-steam.ts` is a small Better Auth plugin (`/api/auth/steam/start`, `/api/auth/steam/callback`) over the protocol checks in `lib/steam-openid.ts`. The identity is a normal `account` row (`providerId = 'steam'`, `accountId` = SteamID64). Steam shares no email, so a first sign-in creates a user with a non-routable placeholder address; Steam is never matched to an existing user by email, and attaching it to one needs a signed-in session (`/api/auth/steam/start?mode=link`). A new account takes the player's Steam name and avatar from their public profile page (no API key is needed; a private profile gets a generic name).

## Long lists

Every long list has search, and every list that can grow loads as you scroll (`hooks/useSentinel.ts`, an IntersectionObserver trigger): the item picker (search by name or type, type filter, 60 at a time), the paint and unusual-effect pickers (`SearchSelect`, a keyboard-navigable combobox), the HUD and loadout workshops, "My HUDs" and "My loadouts", and the HUD editor's font and colour pickers. Workshop search on loadouts also matches the names of the items in them (`Tf2Loadout.itemIds`, a GIN-indexed array).

## Accessibility and phones

Checked with axe-core (WCAG 2.0–2.2 A/AA + best practice) at 375 and 1360 px across the hub, both workshops, the builder (with the picker open), My loadouts and the HUD pages: zero violations. What that rests on, so it stays true:

- **One theme, contrast designed in.** `--app-text-dim` is 5.6:1 on `--app-bg-subtle` and `--app-accent-text` (the accent used _as text_) 6.3:1; the fill colour `--app-accent` is for fills, borders and rings only. New text colours should be checked against the lightest surface they land on.
- **Headings.** `Tf2Header` always renders the page's `h1` (a phone shows it too); a page with its own hero passes `heading={false}`. Cards are `h2`.
- **Cards** are one tap target: the title link stretches over the card and the actions sit above it.
- **Phones.** Below `lg` the item picker opens as a full-height sheet (`Modal sheet`) instead of a column far below the slots; slots are a 3-column grid; list grids are explicit `grid-cols-1` (an auto track sizes to its widest card and runs off the screen). A `SearchSelect` inside the sheet portals into the dialog, because a modal dialog makes everything outside it inert.
- **Screen readers and keyboard.** Equipping or emptying a slot is announced through a polite live region; opening a slot moves focus to the picker's search box on wide screens (not on phones, where it would raise the keyboard over the sheet); the combobox uses `aria-activedescendant`; the picker's visible item names are `aria-hidden` because each tile button already carries the name.

### What this does not cover

- **Models are not included.** See above: the viewer works end to end, but real TF2 models have to be converted from a game install and uploaded. Until then items show "No 3D model yet".
- **Inventory icons** come from the game's own files via the asset sync (below), so no Steam API key is needed. Until the first sync has run, tiles show the item's initials.
- **The default HUD is not auto-updated.** The HUD Editor's base (`public/tf2-hud/base/`) is extracted from a game install by `scripts/tf2-hud/import-base.mjs`; those files are not in the public mirror either, so refreshing them stays a manual step when Valve changes the HUD.
- **Steam Workshop.** TF2's Steam Workshop takes cosmetic/weapon submissions, not loadouts. "Workshop" here is the RMH Studios workshop at `/tf2/workshop`.
