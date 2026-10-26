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

- **Where models live.** GLB files in the site's object storage at `tf2-models/<defindex>.glb`. `GET /api/tf2-loadout/models` lists which exist (cached 5 min) and `GET /api/tf2-loadout/models/:id.glb` serves one. An item with no GLB shows "No 3D model for this item yet."
- **Paint.** A material flagged `extras.tint = true` in the GLB has its base colour multiplied by the paint colour.
- **Getting models in.** Valve's models are not in the item schema or the public mirror, so they have to be converted once from a game install: [Creators_SourceMDLToGLTF](https://github.com/rob5300/Creators_SourceMDLToGLTF) (a Blender plugin, built for the Creators.TF loadout page) batch-converts TF2 weapons and cosmetics to GLB. Name the outputs `<defindex>.glb` and run `pnpm exec tsx scripts/tf2-models/upload.ts <dir>` against the target environment.

## Long lists

Every long list has search, and every list that can grow loads as you scroll (`hooks/useSentinel.ts`, an IntersectionObserver trigger): the item picker (search by name or type, type filter, 60 at a time), the paint and unusual-effect pickers (`SearchSelect`, a keyboard-navigable combobox), the HUD and loadout workshops, "My HUDs" and "My loadouts", and the HUD editor's font and colour pickers. Workshop search on loadouts also matches the names of the items in them (`Tf2Loadout.itemIds`, a GIN-indexed array).

### What this does not cover

- **Models are not included.** See above: the viewer works end to end, but real TF2 models have to be converted from a game install and uploaded. Until then items show "No 3D model yet".
- **Inventory icons need a Steam API key.** Without `STEAM_API_KEY`, tiles show the item's initials. Valve's icons live in packed game files, so the key (for `GetSchemaItems`) is the only public source.
- **The default HUD is not auto-updated.** The HUD Editor's base (`public/tf2-hud/base/`) is extracted from a game install by `scripts/tf2-hud/import-base.mjs`; those files are not in the public mirror either, so refreshing them stays a manual step when Valve changes the HUD.
- **Steam Workshop.** TF2's Steam Workshop takes cosmetic/weapon submissions, not loadouts. "Workshop" here is the RMH Studios workshop at `/tf2/workshop`.
