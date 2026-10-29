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

Nothing here is uploaded by hand. `.github/workflows/tf2-assets-sync.yml` runs daily, after every deploy, and on demand (Actions → tf2-assets-sync → Run workflow), and keeps the following channels in object storage current:

| What                                                         | Where                                 | Built by                          |
| ------------------------------------------------------------ | ------------------------------------- | --------------------------------- |
| Item 3D models (GLB, textures baked in as WebP)              | `tf2-models/<defindex>[_<class>].glb` | `scripts/tf2-assets/convert.py`   |
| Item inventory icons (the pictures on the item tiles, WebP)  | `tf2-icons/<defindex>.webp`           | `scripts/tf2-assets/icons.py`     |
| War paint scripts and pattern textures                       | `tf2-paintkits/`                      | `scripts/tf2-assets/paintkits.py` |
| HUD editor base: panels, schemes, materials **and textures** | `tf2-hud-base/<path>`                 | `scripts/tf2-assets/hud.py`       |
| Unusual particle graphs, materials and animated textures     | `tf2-particles/`                      | `scripts/tf2-assets/particles.py` |
| One state file per channel                                   | `<channel>/_state.json`               | `scripts/tf2-assets/publish.ts`   |

**Why a login is needed.** Valve's free dedicated-server download carries the _index_ of every texture but not the texture data, and the client's content depot refuses anonymous logins. The job therefore signs in to Steam on the CI runner with an account that owns TF2 (free to add). Use a dedicated account with Steam Guard off; the credentials exist only as repository secrets and only on the runner, never on the VPS.

**Secrets** (Settings → Secrets and variables → Actions): `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION`, `STEAM_USER`, `STEAM_PASS` (no Steam API key is used anywhere). While any is missing the job ends early with a notice and uploads nothing.

**What keeps it cheap** (in the order it applies):

1. **Gate.** One GET of each channel's state file, compared with the game's current public Steam build id. Same build → the job stops before downloading anything.
2. **Per-file hashes.** Every output carries a hash of exactly what it was built from (model + materials + textures + converter version; for HUD files, the file's own SHA-1). The state file is the only index — no bucket listing — and only files whose hash changed are converted and uploaded.
3. **Compression.** Every uploaded file is Brotli-compressed (`lib/tf2-loadout/asset-codec.ts`: level 11 for text, 9 for binary) and stored with `Content-Encoding: br`; a file is stored raw only if Brotli cannot make it smaller. Reading it back is lossless: a browser that accepts `br` (all of them) gets the stored bytes untouched and inflates them itself, anything else gets the inflated original from the serving routes (`readModel`, `readBaseFile`, `readIcon`). The upload log prints raw → stored size.
4. **Cleanup.** The 30+ GB install is deleted as soon as extraction finishes, and again if the job fails; the runner is discarded anyway. Objects for items that left the game are only deleted when a manual run sets **prune**, and never for a model that merely failed to convert this time.

`force` rebuilds and re-checks everything; `limit` converts only N models (for testing). Bump `CONVERTER_VERSION` in `convert.py` (and `MODEL_BUILDER_VERSION` in `lib/tf2-loadout/model-sync.ts`) when the converter's output changes, so every model is rebuilt once.

**The 3D player.** The builder shows the selected class under the class bar (above the slots on a phone), animated, with its equipped cosmetics and held weapon. The class bodies are synced as `tf2-models/class_<class>.glb`: a **skinned** model (bone weights from the VVD, the MDL's skeleton and inverse bind matrices) with the game's own loadout-screen idle (`selectionMenu_Idle`, looped) baked in as the clip `idle`. Eyes are the game's `EyeRefract` material approximated for glTF: the eye proxy mesh gets UVs projected the way the Eyes shader projects its iris, and a texture of sclera with the material's `$iris` painted in the middle.

Animations come from `<class>_animations.mdl` (`scripts/tf2-assets/srcanim.py`: raw and RLE channels, sectioned long clips, and the all-zero-delta "taunt" sequences that point at an absolute `layer_*` sequence). The root bone is re-expressed in the bind pose's space using the model's own `ref` sequence. Every whole-body sequence of every class that decodes (taunts first, but also stances, runs and attacks; layers, gestures and vehicle poses are skipped) is published as `anim_<class>_<clip>.glb` (skeleton + one clip, no mesh), and `anims.json` indexes the clips per class and which clip each taunt item plays. The item → clip mapping resolves the item's scene file name (`taunt.custom_taunt_scene_per_class`, listed by `taunt-manifest.json`) to a sequence by name (spelling-insensitive, with a class prefix and the `hi5` alias, then loosely: without the `taunt` prefix or a `_start`/`_loop` suffix, then by containment). The sync log lists every taunt scene that still matched no sequence; a taunt with no match shows "No animation is available for this taunt yet" and the player keeps idling. Taunt previews animate the selected class rather than showing a prop model. The "Animation" dropdown under the viewer plays any published clip on the player in place of the taunt (cleared by selecting a slot again). Selecting an equipped taunt slot plays that taunt on the builder's player; otherwise the first equipped taunt plays. Idle sequence lookup is case-insensitive across all nine classes.

A cosmetic is authored around the model origin and, in the game, follows a bone of the wearer, so the converter writes per cosmetic the bone it follows and its pose on it (`extras.attach`); `PlayerScene.tsx` adds it to that bone with the pose as its local matrix, which is the game's bone-merge, and keeps it there while the clip plays. The held weapon (primary, else secondary, else melee) is a world model attached the same way (stock weapons are listed because the manifest keeps the schema's `baseitem` entries). Unusual effects are parented to the same bone. Until the first sync has published the class bodies the panel says the 3D player is not available yet.

**HUD editor.** The editor asks `/api/tf2-hud/base/manifest.json` first; if a sync has published, that manifest and every file come from storage, otherwise it uses the copy shipped in `public/tf2-hud/base`. The two are never mixed.

**What the converter does.** `srcmodel.py` reads the Source model (MDL v44–49, VVD v4, VTX v7): LOD 0 of the default body groups, bind-pose geometry, normals, UVs, and the materials of skin family 0. `srctex.py` reads the VMT (following `patch` includes) and decodes the VTF (DXT1/3/5 and the common uncompressed formats) to WebP, capped at 512 px. `glb.py` writes the GLB; a material whose VMT blends the paint colour by base alpha (`$blendtintbybasealpha`) is flagged `extras.tint`: its texture keeps its alpha (the paint mask, not transparency), and the material's default tint (`$color2`, else `$colortint_base`) and `$blendtintcoloroverbase` go in `extras.tintDefault` / `extras.tintReplace`. The viewer applies the game's formula, `albedo = mix(albedo, mix(albedo * tint, tint, replace), alpha)`, so an unpainted item keeps its colour and paint tints only the masked parts. Edge cases, found by auditing every cosmetic's materials (`scripts/tf2-assets/paint_audit.py`): a paint-masked material always stays opaque and never glows from that alpha (the game ignores base alpha for translucency when it paints by it, and the self-illumination shader combination does not exist); a paintable item with `$colortint_base` but no mask is tinted whole (`extras.tintWhole`); a constant `$color2` / `$color` becomes the glTF base colour factor (linear). Only models with a tinted material are re-hashed (`PAINTMASK_VERSION`). Skeletons and animation are not exported — the cosmetics are static.

Weapon GLBs include `extra_wearable` (including Botkiller heads and chains, using the item's RED skin family), permanent `visuals.attached_models`, and optional `attached_models_festive`. Shared bones align the attachment's bind space with the weapon. Optional parts carry `extras.festive` on their materials and both viewers toggle them from the saved festive flag. Self-illuminated bulbs use an emissive texture masked by the base alpha. War paint only replaces the weapon texture, never its attached parts. These attachments retain their static bind pose; Source jigglebone physics is not simulated.

**Body groups and bone-merge.** A class body lists named groups (`hat`, `headphones`, `shoes_socks`, …) with a few submodels each; the game shows submodel 0 unless a worn item selects another, usually an empty one, which is how a cosmetic takes the class's own cap off. The converter keeps every submodel of a switchable group in the class GLB as its own primitive (`extras.bodygroup`, `extras.sub`; the group names and counts are in the scene's `extras.bodygroups`), and the catalog records what each cosmetic selects (`bg` from the schema's `visuals.player_bodygroups`, plus a style's `additional_hidden_bodygroups`). `PlayerScene` shows the submodel the worn items select (`lib/tf2-loadout/bodygroups.ts`); an unlisted group shows submodel 0, and a clash is settled by the higher submodel. Cosmetics whose vertices follow several bones (boots, gloves, sleeves, capes; a second bone with at least 2% of the weight) are exported skinned and flagged `extras.boneMerge`; the viewer binds them to the player's own bones (`lib/tf2-loadout/bone-merge.ts`) instead of hanging the whole model from one, so both mantreads follow their own foot. Only class bodies and flagged cosmetics hash `BODYGROUPS_VERSION` / `BONEMERGE_VERSION` into their source hash, so a change to either rebuilds those files and no other model; bump `MODEL_BUILDER_VERSION` (which only makes the sync run and changes the `?v=` on URLs) alongside it.

**Caching.** Served models carry an `ETag` and `Cache-Control: public, max-age=300, stale-while-revalidate=300`: a browser keeps a file for five minutes, then revalidates with a bodyless 304. The window is short on purpose: a sync can replace a model at the same URL without the builder version changing, and a long max-age left browsers on a stale class body for a day. `stored-cache.server.ts` keeps what was read from the bucket in a 64 MB LRU for ten minutes (simultaneous reads share one request, a missing key is remembered for a minute, a file over 8 MB passes through), so a popular file is read from storage once rather than once per viewer. In the browser, parsed models are shared by URL for the page's life, particle bundles stay cached for the session, particle textures outlive their last viewer by a minute, and `prefetch.ts` fetches the model (or taunt clip) of a tile the pointer dwells on, two at a time at low priority, never on `saveData` or 2g and never while the tab is hidden. The same URLs the viewer requests are prefetched, so nothing is stored twice.

Model and animation URLs include the model builder version, and GLB responses revalidate after five minutes instead of keeping replaced conversions for days. Bumping both converter versions triggers a rebuild even when the Steam build is unchanged. Eye projection is restricted to eye shader meshes and matches eyeballs by spatial centre, preserving body and weapon UVs. Format regressions run with `python -B -m unittest discover -s scripts/tf2-assets -p test_models.py` and in the model sync job.

To try it on a few models locally you need a game install: `python3 scripts/tf2-assets/convert.py --root <install> --manifest model-manifest.json --out out --limit 20` (manifest from `pnpm exec tsx scripts/tf2-models/model-manifest.ts`), then open the GLBs in any glTF viewer.

### Unusual particles

Weapon effects resolve their `use_suffix_name` mapping against each weapon's `particle_suffix`. Their manifest keys are `<effect ID>:<weapon suffix>`, so a scattergun loads its scattergun particle graph and attachment control points. The held-weapon viewer and the item customizer both use this mapping. Taunts with a schema `refire_time` repeat their bursts while already-emitted particles finish their lifetimes.

The catalog preserves the schema's particle `system` and family (cosmetic, taunt or weapon) alongside each effect's ID and display name. Each item dropdown lists only its own family, and draft cleanup, AI-proposed equips and server validation use the same eligibility helper. Weapons require the schema's `particle_suffix`; decorated skins inherit it from their base weapon. The viewer loads the corresponding PCF graph, rather than inferring colours and motion from English names. Before the particle channel has been published, the item customizer says the effect has not been synced and draws no substitute dots.

`scripts/tf2-assets/particles.py` uses `srctools==2.6.2` to read the game's DMX/PCF files and VTF resource directories. It follows all child systems, resolves VMT patch includes, preserves material parameters and proxies, and exports full-resolution lossless RGBA WebP images for **every** VTF frame. Embedded SHT sequences retain their frame durations, clamping and four UV rectangles per frame. Each bundle contains the effect's complete graph and material dependencies. Files live under `tf2-particles/effects/<hash>.json` and `tf2-particles/tex/<hash>.webp`; `manifest.json` maps effect IDs to bundles. The public `/api/tf2-loadout/particles/*` endpoint serves only these paths, using the stored Brotli encoding when accepted.

The sync adds its own build/version gate and state file, performs extraction before deleting the game, skips decoding unchanged images, uploads dependencies first, and publishes the manifest last. An individual broken effect retains its previously published manifest entry. Immutable versions are retained even on a prune run because cached bundles can still reference them. The model converter version is also bumped: models export MDL attachment transforms, root bones and animated hitboxes. Cosmetics with private jiggle bones fall back to their nearest ancestor shared with the player.

`lib/tf2-loadout/particles/` owns fixed-step simulation, initializers/operators/forces/constraints, delayed child systems and control points, plus instanced textured sprite cards, velocity trails and subdivided ropes. It uses the same Source-unit scale and reference basis as the model converter. Particles simulate in world space; only the PCF's lock operators make already-emitted particles follow a moving attachment. Default placement adds no bounding-box-based offset or size adjustment. Optional saved offsets and scaling still work.

Materials support atlas frame interpolation, dual sequences, alpha/additive/premultiplied blending, overbright, supported material proxies, soft intersections and refraction. Soft/refractive effects share one scene/depth capture per canvas/frame. Viewers share loaded textures and release GPU resources on unmount; unseen particles stop simulating. The existing Still material setting holds the effect at a populated frame.

This is a browser implementation of Source particle behavior, not the Source engine itself. Random-number sequences and coherent noise differ from Valve's implementation; collision queries use the preview model and a studio floor rather than a BSP map. New, unrecognized operators produce a diagnostic. Visual parity with TF2 still needs checking under matching camera, lighting and animation conditions; a successful extraction is not a claim of pixel-identical rendering.

Local extraction: `python -B scripts/tf2-assets/particles.py --root <install> --out <dir> [--only 13,14]`. Format regression tests require `vpk numpy pillow srctools==2.6.2`: `python -B -m unittest discover -s scripts/tf2-assets -p test_particles.py`. They also run in the particle sync job. No game assets are committed.

### War paints

A war paint is a pattern script from the game's `paintkits_master.txt`: per (kit, weapon) five wear levels, each a tree of `texture_lookup`, `combine_multiply`, `combine_lerp` and `select` operations over the game's own textures that paints the weapon's whole texture. The catalog lists the kits (`catalog.kits`: names from `tf_proto_obj_defs_english.txt`, plus the script name for each weapon the kit exists for) and marks the weapons that can take one (`item.wk`); the war-painted weapon skins in the schema (`paintkit_weapon_*`) are the (kit, weapon) pairs and their `name` is the script name.

The sync's `paintkits` channel (`scripts/tf2-assets/paintkits.py`, `tf2-paintkits/` in object storage) publishes each script as compact JSON (`kits/<script>.json`) and every texture the scripts read as WebP (`tex/<path>.webp`; the "groups" maps that give each region of a weapon an id are lossless), served by `/api/tf2-loadout/paintkits/*`. In the browser `lib/tf2-loadout/warpaint.ts` runs the tree for the chosen wear level and seed in a worker (`warpaint.worker.ts`) and the result replaces the weapon's base colour map. The tree, the group masks and the layering are the game's; the seed's random draws (rotation, offset, scale and level ranges) and our reading of the black/offset/gamma level adjustment are ours, so the same seed is stable here but can differ from the game in detail. The decals some kits paste onto the weapon (`apply_sticker`) are not drawn; the pattern underneath is.

### Decorated skins, tiers, Halloween and festivizing

Some weapon skins are not war paints: the schema gives each its own item id (`15000+`, prefab `paintkit_weapon_<weapon key>`, `paintkit_proto_def_index` = the kit). The catalog lists them as `decorated` items named "<kit> <weapon>" with `item.sk = { kit, base }`: the model and icon come from the base weapon (`modelItemId`), the kit is fixed (a loadout entry may not set `kit` on them), and the player picks only wear and seed. `kitOf` / `warPaintOf` in `warpaint.ts` resolve the kit either way.

Other per-item marks come from the schema as well: `item.rt` is the tier from `item_collections` (the `items { <tier> { <item name> } }` blocks, matched on the item's `name`), `item.hr` is a `holiday_restriction` containing "halloween", and `item.fz` is the `can_be_festivized` tag. `LoadoutEntry.festive` records a festivized weapon and is only valid on `fz` items. The item tile sits on the tier's colour (`lib/tf2-loadout/rarity.ts`: the `ItemRarity*_GreyedOut` entries of the HUD's own `clientscheme.res`, kept equal by a test), and a Halloween-only item shows a ghost mark in the tile's corner. Weapons use the grade names (Civilian … Elite), everything else Common … Ancient.

Not drawn: the festivizer's lights are recorded and shown as a label, but the festive attachment model is not rendered in the 3D preview. Wear on a decorated weapon is applied by the same compositor as a war paint, which has the approximations described above.

### Producing the models by hand (fallback)

The older manual route still works if the automatic sync is not set up: list the needed files with `scripts/tf2-models/model-manifest.ts`, extract and convert them yourself, name them with `scripts/tf2-models/rename-glb.ts`, and upload with `scripts/tf2-models/upload.ts`. Prefer the sync — it is incremental and keeps itself current.

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
