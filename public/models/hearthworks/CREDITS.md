# Hearthworks character models: credits and provenance

**Nothing Valve-owned is committed in this repository.** This folder holds only this file; the manifest (which model, which skin,
which animation sequences, as text) is `features/hearthworks/engine/skins/models.manifest.json`, bundled into the app. The characters themselves are loaded **at run time** from the
project's own asset channels in Cloudflare R2, the same ones the Source-engine games on this site use
(`docs/tf2-game.md`, "Game assets" and "Models").

The models, meshes, skeletons, textures and animation sequences are **Valve's** (Half-Life 2 and Team Fortress 2,
(c) Valve Corporation). They reach the site this way:

- GitHub Actions workflow `.github/workflows/tf2-assets-sync.yml` downloads the retail games with **SteamCMD**
  (TF2 = Steam app 440, Half-Life 2 = app 219 as named in `docs/tf2-game.md`), converts the models with
  `scripts/tf2-game/models.py` to glTF (a mesh GLB with its WebP textures, plus an anim pack GLB holding every Source
  sequence of the model as a glTF animation) and publishes them to R2 under `tf2-game/mdl/`, `hl2-game/mdl/` and the
  shared `tex/`. (`csgo-assets-sync.yml`, app 740, builds the `csgo-game/` channel the same way; Hearthworks uses no
  CS:GO model.)
- The site serves them from `https://cdn.rmhstudios.com/<game>-game/...` and from the same-origin route
  `/api/<game>-game/assets/<kind>/<file>` (`lib/tf2-game/assets/`). Hearthworks fetches them from the route when a
  player wears the skin, caches them in the browser only, and re-hosts nothing.
- Earlier versions of this folder carried nine converted HL2 characters made from two unlicensed third-party GitHub
  repositories. **They are gone.** (Git history still contains those old `*.glb` files; history was not rewritten.)

The project owner has stated that the project is **non-commercial** and has approved this use of the retail game data.
Remove on request.

## Which skin is which model

`mdl` is the model's path in the channel's `mdl/index.json`. Every row is a genuine Source model with genuine Source
sequences; nothing is synthesised or substituted.

| Skin | Channel | Model (`mdl`) | Skin family | Sequences (Source names) |
| --- | --- | --- | --- | --- |
| `citizen` | `hl2` | `models/humans/group01/male_01.mdl` | 0 | idle_subtle, walk_all@4, run_all@4, jump_holding_jump, jump_holding_glide (fall), shootp1, reload_pistol, Fear_Reaction (hurt), cit_door frames 12-52 (death), Open_door_away (interact) |
| `worker` | `hl2` | `models/humans/group01/male_02.mdl` | 0 | same as `citizen` (the hl2 channel has no group03 humans, which the old importer used for the worker) |
| `rebel` | `hl2` | `models/humans/group01/female_06.mdl` | 0 | as `citizen` with reloadpistol; **no death sequence in its pack**: the figure plays Fear_Reaction and topples (the old importer borrowed `cit_door` from the male set) |
| `barney` | `hl2` | `models/barney.mdl` | 0 | as `citizen` |
| `metrocop` | `hl2` | `models/police.mdl` | 0 | batonidle1, walk_all@4, run_all@4, jump_holding_jump, jump_holding_glide, shootp1, reload_pistol, flinch2 (hurt), thrust (interact); **no death sequence**: flinch2, then topples |
| `gman` | `hl2` | `models/gman_high.mdl` | 0 | as `citizen` with walk_all_Moderate@4 and tiefidget (interact) |
| `scout` | `tf2` | `models/player/scout.mdl` | 0 (RED) | stand_PRIMARY, run_PRIMARY@7 (walk and run: TF2 has no walk cycle), Jump_Start_primary@7, Jump_Float_primary@7, AttackStand_PRIMARY (delta, shoot), PRIMARY_reload_start (delta, reload), a_flinch01 (delta, hurt), primary_death_backstab |
| `soldier` | `tf2` | `models/player/soldier.mdl` | 0 (RED) | stand_PRIMARY, run_PRIMARY@7, airwalk_PRIMARY (jump, fall), AttackStand_PRIMARY, ReloadStand_PRIMARY, a_flinch01, primary_death_headshot |
| `pyro` | `tf2` | `models/player/pyro.mdl` | 0 (RED) | as soldier; death primary_death_backstab |
| `demoman` | `tf2` | `models/player/demo.mdl` | 0 (RED) | as soldier without a reload; death PRIMARY_death_backstab |
| `heavy` | `tf2` | `models/player/heavy.mdl` | 0 (RED) | stand_PRIMARY, run_PRIMARY@7, airwalk_PRIMARY, attackStand_PRIMARY (shoot), PRIMARY_death_headshot; no reload, no flinch |
| `engineer` | `tf2` | `models/player/engineer.mdl` | 0 (RED) | as soldier; death PRIMARY_death_backstab |
| `medic` | `tf2` | `models/player/medic.mdl` | 0 (RED) | as soldier with jump_start_PRIMARY@7 / jump_float_PRIMARY@7; death primary_death_backstab |
| `sniper` | `tf2` | `models/player/sniper.mdl` | 0 (RED) | as soldier; death primary_death_headshot |
| `spy` | `tf2` | `models/player/spy.mdl` | 0 (RED) | stand_SECONDARY, run_SECONDARY@7, airwalk_SECONDARY, AttackStand_SECONDARY, ReloadStand_SECONDARY, a_flinch01, primary_death_backstab (the spy has no primary weapon: his revolver is the secondary) |

`@N` names a cell of a blend set; the forward cell is the one whose movement vector points along Source +X (`@4` for
HL2's `move_yaw = 0`, `@7` for TF2). "(delta)" sequences are Source's additive layers; the loader rebases them onto the
standing pose. TF2 team skins: family 0 is RED, family 1 BLU (set `skin` in the manifest).

## Skins without a model

`combine-soldier`, `combine-elite` and `breen` have **no source in any asset channel** (`models/combine_soldier.mdl`,
`models/combine_super_soldier.mdl` and `models/breen.mdl` are not in the `hl2` channel's `mdl/index.json`). They keep
their **procedural stand-in** figure (`features/hearthworks/engine/art`), and the manifest lists them as `provenance: "stand-in"`.
No other model stands in for them. They will get a model the day the channel carries one.

## What is not used

Normal maps, phong masks, env maps and face flexes are not used. The channel's textures are WebP albedo maps; surfaces
are forced matte by the loader to match the diorama.
