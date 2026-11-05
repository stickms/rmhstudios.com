# Hearthworks character models: credits and provenance

The `*.glb` files here are converted from **Valve Source-engine content (Half-Life 2)**: the meshes, skeletons,
textures and animation sequences are Valve's. Valve proprietary content, redistributed at the owner's
instruction (2026-11-04); remove on request.

The models were converted by `scripts/hearthworks/source-import/` (see its README). The source files were
obtained only as downloaded data from the public GitHub repositories below and were parsed, never executed.
Every file read by the conversion is listed with its repository, commit, path inside the repository and SHA-256
(the same list is `scripts/hearthworks/source-import/sources.json`, which `fetch_sources.py` re-downloads and
verifies).

## Repositories

- `DoArInF/LambdaWarsRework-main` at commit `230ab7d39e5aa347e933dee2af88c56cae66193c`; files under `lambdawars/` (key `lambdawars`)
- `JJL772/source-2013-custom` at commit `188deca179ebb705af3dc59fffea35a0435c1a5c`; files under `game/hl2/` (key `hl2`)

## What each skin is

| Skin | Source model | Geometry / textures | Animation clips (all genuine Source sequences) |
| --- | --- | --- | --- |
| `citizen` | `models/humans/group01/male_01 (HL2 citizen)` | Valve geometry + Valve textures (VTF/VMT) | idle_subtle, walk_all, run_all, jump_holding_jump, jump_holding_glide, shootp1, reload_pistol, Fear_Reaction, cit_door[12-52] (death), Open_door_away (all `male_shared`) |
| `worker` | `models/humans/group03/male_02` | Valve geometry + Valve textures (VTF/VMT) | same male_shared clips as citizen |
| `rebel` | `models/humans/group03/female_01` | Valve geometry + Valve textures (VTF/VMT) | female_shared: idle_subtle, walk_all, run_all, jump_holding_*, shootp1, reloadpistol, Fear_Reaction, Open_door_away; death borrowed: male_shared cit_door[12-52] |
| `barney` | `models/barney` | Valve geometry + Valve textures (VTF/VMT) | barney_animations idle_subtle; male_shared walk/run/jump/shootp1/reload_pistol/Fear_Reaction/cit_door[12-52]/Open_door_away |
| `metrocop` | `models/police` | Valve geometry + Valve textures (VTF/VMT) | police_animations: batonidle1, walk_all, run_all, shootp1, reload_pistol, flinch2, thrust; jump/fall/death borrowed from male_shared |
| `combine-soldier` | `models/combine_soldier` | Valve geometry + Valve textures (VTF/VMT) | combine_soldier_anims: Idle_Unarmed, WalkEasy_all, RunALL, jump_holding_*, shootSMG1s, reload, flinchbig, signal_advance; death borrowed: male_shared cit_door[12-52] |
| `combine-elite` | `models/combine_super_soldier` | Valve geometry + Valve textures (VTF/VMT) | same combine_soldier_anims clips as combine-soldier |
| `breen` | `models/breen` | Valve geometry + Valve textures (VTF/VMT) | breen_anims B_idle01; male_shared walk_all_Moderate/run_all/jump/shootp1/reload_pistol/Fear_Reaction/cit_door[12-52]/Open_door_away |
| `gman` | `models/gman` | Valve geometry + Valve textures (VTF/VMT) | gman.mdl idle_subtle, walk_all_Moderate, tiefidget; male_shared run_all/jump/shootp1/reload_pistol/Fear_Reaction/cit_door[12-52] |

Nothing here is invented: where a clip is borrowed from another model of the same `ValveBiped` rig family
(bones matched by name) the table says so. Skins without a row (the nine TF2 classes) have **no** Valve model in
this folder: no public copy of the TF2 player models could be found, so the game keeps its procedural stand-ins
for them (`provenance: "stand-in"` is simply the absence of a manifest entry).

## Provenance caveats (what could and could not be verified)

- Geometry (`.mdl` + `.vvd` + `.dx90.vtx`) and the `.ani` animation blocks come from `LambdaWarsRework-main`;
  materials (`.vmt` / `.vtf`) from `source-2013-custom`. The latter's `game/hl2/models` has the retail `.mdl`
  files but no `.vvd` / `.vtx`, so geometry could not be cross-checked against it.
- `police.mdl`, `combine_soldier.mdl`, `police_animations.mdl`, `combine_soldier_anims.mdl` and `breen_anims.mdl`
  are byte-identical in both repositories (retail Half-Life 2 `.mdl` files). The citizens, Barney, Breen,
  the G-Man, the female rig, `male_shared` / `female_shared` and the Combine elite are *recompiled* in
  `LambdaWarsRework-main` (MDL v44-49, different checksums; `male_shared.mdl` and `female_shared.mdl` keep the
  retail file size, the others differ by a few KB). Their geometry, bone names and the sequences used here appear to match
  the retail ones in structure, but they are the mod's builds of Valve's content, not verified byte-for-byte
  against a Steam install. Re-running the importer on your own install (`--steam`) replaces them with retail data.
- No texture normal maps, phong masks, env maps or face flexes are used; only albedo (and the Combine's
  self-illumination mask as an emissive map).

## Files read, per repository

Columns: path inside the repository (case as stored), size, SHA-256 (first 16 hex digits), skins that use it.

### `DoArInF/LambdaWarsRework-main` @ `230ab7d39e5a`

| Path | Bytes | SHA-256 | Skins |
| --- | ---: | --- | --- |
| `lambdawars/models/Barney.dx90.vtx` | 218111 | `224ee890d473bdc9` | barney |
| `lambdawars/models/barney.mdl` | 213740 | `1fff4e1d230e9d0d` | barney |
| `lambdawars/models/barney.vvd` | 249664 | `32c8c5f435780bce` | barney |
| `lambdawars/models/Barney_animations.ani` | 235698 | `2c51722f9f13f342` | barney |
| `lambdawars/models/Barney_animations.mdl` | 46824 | `3a7d775a8beabf28` | barney |
| `lambdawars/models/Barney_gestures.mdl` | 197108 | `d616306fd251858e` | barney |
| `lambdawars/models/Barney_postures.mdl` | 51940 | `86105481529fba72` | barney |
| `lambdawars/models/breen.dx90.vtx` | 249864 | `4d27e5767987fcfc` | breen |
| `lambdawars/models/breen.mdl` | 210676 | `58b9e4c0cb2214a6` | breen |
| `lambdawars/models/breen.vvd` | 283392 | `d45a6c3332138c43` | breen |
| `lambdawars/models/breen_anims.ani` | 322144 | `d3e126b81ce46701` | breen |
| `lambdawars/models/breen_anims.mdl` | 49000 | `a8e75d6b372a1c68` | breen, gman |
| `lambdawars/models/breen_gestures.mdl` | 167164 | `f3584c5e4aa956ba` | breen |
| `lambdawars/models/breen_postures.mdl` | 55696 | `222c57d121db8350` | breen |
| `lambdawars/models/Combine_Soldier.dx90.vtx` | 167306 | `b18f2e4a8384c33c` | combine-soldier |
| `lambdawars/models/Combine_Soldier.mdl` | 21592 | `36850af4cb1f7da8` | combine-soldier |
| `lambdawars/models/Combine_Soldier.vvd` | 394304 | `0ed051e8b04451be` | combine-soldier |
| `lambdawars/models/combine_soldier_anims.ani` | 837376 | `02df15a61b20726e` | combine-elite, combine-soldier |
| `lambdawars/models/combine_soldier_anims.mdl` | 176976 | `3901fbc1dfb07032` | combine-elite, combine-soldier |
| `lambdawars/models/Combine_Super_Soldier.dx90.vtx` | 220880 | `046ce901d890f667` | combine-elite |
| `lambdawars/models/Combine_Super_Soldier.mdl` | 15080 | `d1f1251a9014bd2f` | combine-elite |
| `lambdawars/models/Combine_Super_Soldier.vvd` | 284928 | `932dd18a5d00c226` | combine-elite |
| `lambdawars/models/gman.dx90.vtx` | 90773 | `ec7eded4936e6ba1` | gman |
| `lambdawars/models/gman.mdl` | 175644 | `acb825aab23401bd` | gman |
| `lambdawars/models/gman.vvd` | 310016 | `3ba1f4e288a34058` | gman |
| `lambdawars/models/Gman_gestures.mdl` | 51068 | `bdf41cdf0858be11` | gman |
| `lambdawars/models/Humans/female_gestures.mdl` | 151804 | `fff5ff8f97b55513` | rebel |
| `lambdawars/models/Humans/female_postures.mdl` | 64484 | `cc397b7eff066551` | rebel |
| `lambdawars/models/Humans/female_shared.ani` | 1398440 | `7915a2af021489ff` | rebel |
| `lambdawars/models/Humans/female_shared.mdl` | 333112 | `6a9e524248457495` | rebel |
| `lambdawars/models/Humans/female_ss.mdl` | 79540 | `0ecf5af7bf41cf71` | rebel |
| `lambdawars/models/Humans/Group01/Male_01.dx90.vtx` | 155262 | `b6f614a9dee8689e` | citizen |
| `lambdawars/models/Humans/Group01/Male_01.mdl` | 115860 | `47c4648a21b4e358` | citizen |
| `lambdawars/models/Humans/Group01/Male_01.vvd` | 203088 | `fcb5ca3fd8e0496d` | citizen |
| `lambdawars/models/Humans/Group03/Female_01.dx90.vtx` | 193549 | `57a295b0fd0febdd` | rebel |
| `lambdawars/models/Humans/Group03/female_01.mdl` | 119244 | `932282b197b88fd4` | rebel |
| `lambdawars/models/Humans/Group03/female_01.vvd` | 229968 | `3692a8c93b07d110` | rebel |
| `lambdawars/models/Humans/Group03/male_02.dx90.vtx` | 230501 | `177a77ef00d31711` | worker |
| `lambdawars/models/Humans/Group03/male_02.mdl` | 183236 | `1bc88d37f4863610` | worker |
| `lambdawars/models/Humans/Group03/male_02.vvd` | 246048 | `2371fe54659ed724` | worker |
| `lambdawars/models/Humans/male_gestures.mdl` | 632720 | `d52e0c4200a61ae2` | citizen, worker |
| `lambdawars/models/Humans/male_postures.mdl` | 106304 | `f44f090c2f1190ed` | citizen, worker |
| `lambdawars/models/Humans/male_shared.ani` | 1828076 | `b530923663835b99` | barney, breen, citizen, combine-elite, combine-soldier, gman, metrocop, rebel, worker |
| `lambdawars/models/Humans/male_shared.mdl` | 380848 | `4f60e59f189ffc7f` | barney, breen, citizen, combine-elite, combine-soldier, gman, metrocop, rebel, worker |
| `lambdawars/models/Humans/male_ss.mdl` | 150864 | `3ce1348f6e9d4105` | citizen, worker |
| `lambdawars/models/Police.dx90.vtx` | 188465 | `eba66b256ec3b82c` | metrocop |
| `lambdawars/models/Police.mdl` | 19804 | `47e8214f4a274cd5` | metrocop |
| `lambdawars/models/Police.vvd` | 278176 | `aee72cf342e8b408` | metrocop |
| `lambdawars/models/Police_animations.ani` | 742536 | `9aa4671e7cc2529c` | metrocop |
| `lambdawars/models/Police_animations.mdl` | 188672 | `8bd9a05b632220cf` | metrocop |
| `lambdawars/models/Police_ss.mdl` | 62448 | `83e496a9fce3f220` | metrocop |

### `JJL772/source-2013-custom` @ `188deca179eb`

| Path | Bytes | SHA-256 | Skins |
| --- | ---: | --- | --- |
| `game/hl2/materials/models/breen/breen_face.vmt` | 166 | `73276bc0b32df2f7` | breen |
| `game/hl2/materials/models/breen/breen_face.vtf` | 175008 | `7cffedca3c5422fd` | breen |
| `game/hl2/materials/models/breen/breen_sheet.vmt` | 237 | `712158985e2b2971` | breen |
| `game/hl2/materials/models/breen/breen_sheet.vtf` | 699256 | `95afeebb70af47ab` | breen |
| `game/hl2/materials/models/breen/eyeball_l.vmt` | 102 | `0be7a5427a5ede71` | breen |
| `game/hl2/materials/models/breen/eyeball_l.vtf` | 2936 | `6113021af832a856` | breen |
| `game/hl2/materials/models/breen/eyeball_r.vmt` | 102 | `8320c18b5dbf7444` | breen |
| `game/hl2/materials/models/breen/eyeball_r.vtf` | 2936 | `14d2e3ad52ee0c7f` | breen |
| `game/hl2/materials/models/breen/mouth.vmt` | 110 | `dcaa9fb950668610` | breen |
| `game/hl2/materials/models/breen/mouth.vtf` | 21992 | `8f3336358e0ba4a2` | breen |
| `game/hl2/materials/models/breen/pupil_l.vtf` | 5720 | `210e8b88dfb43ada` | breen |
| `game/hl2/materials/models/breen/pupil_r.vtf` | 5720 | `ccbc6cb0221574c6` | breen |
| `game/hl2/materials/models/combine_soldier/combine_elite.vmt` | 694 | `ed043e04071266c8` | combine-elite |
| `game/hl2/materials/models/combine_soldier/combine_elite_noalpha.vtf` | 699296 | `6b3e8889a5b24fd0` | combine-elite |
| `game/hl2/materials/models/combine_soldier/combine_elite_selfillummask.vtf` | 175016 | `e50310f856fd3256` | combine-elite |
| `game/hl2/materials/models/combine_soldier/combinesoldier_noalpha.vtf` | 699296 | `493264076dc4ee86` | combine-soldier |
| `game/hl2/materials/models/combine_soldier/combinesoldierselfillummask.vtf` | 175008 | `224276eacd6bcfed` | combine-soldier |
| `game/hl2/materials/models/combine_soldier/combinesoldiersheet.vmt` | 687 | `f3fbb197ef628007` | combine-soldier |
| `game/hl2/materials/models/gman/eyeball_l.vmt` | 100 | `9232a7981eb90c70` | gman |
| `game/hl2/materials/models/gman/eyeball_l.vtf` | 2936 | `738faf9c11ea599b` | gman |
| `game/hl2/materials/models/gman/eyeball_r.vmt` | 100 | `f4c2fb26f4a3346e` | gman |
| `game/hl2/materials/models/gman/eyeball_r.vtf` | 2936 | `d6c7538e4bf487e7` | gman |
| `game/hl2/materials/models/gman/gman_briefcase.vmt` | 68 | `a62cf1b8245c1af8` | gman |
| `game/hl2/materials/models/gman/gman_briefcase.vtf` | 43896 | `06f28cbf130639f6` | gman |
| `game/hl2/materials/models/gman/gman_face_map3.vmt` | 293 | `b47ed386c8dacc8c` | gman |
| `game/hl2/materials/models/gman/gman_face_map3.vtf` | 1048767 | `3b9a048c2a623d6d` | gman |
| `game/hl2/materials/models/gman/gman_sheet.vmt` | 347 | `fee490462760dafb` | gman |
| `game/hl2/materials/models/gman/gman_sheet.vtf` | 699296 | `4f1c2adf14753d2a` | gman |
| `game/hl2/materials/models/gman/lower_teeth.vmt` | 115 | `cd8a6d8308eb8d53` | gman |
| `game/hl2/materials/models/gman/lower_teeth.vtf` | 11048 | `e0b677dbca9cdd2e` | gman |
| `game/hl2/materials/models/gman/pupil_l.vtf` | 5696 | `8115c33b03f3e97a` | gman |
| `game/hl2/materials/models/gman/pupil_r.vtf` | 5696 | `02f8a7f37631fb99` | gman |
| `game/hl2/materials/models/gman/tongue.vmt` | 110 | `922db6bdddc16df1` | gman |
| `game/hl2/materials/models/gman/tongue.vtf` | 2936 | `54a4b987e52b0753` | gman |
| `game/hl2/materials/models/gman/upper_teeth.vmt` | 115 | `60b5d979dd73d464` | gman |
| `game/hl2/materials/models/gman/upper_teeth.vtf` | 11048 | `dfdcb99cdd1a9b2d` | gman |
| `game/hl2/materials/models/humans/female/eyeball_l.vmt` | 118 | `4eef9c7a424190ea` | rebel |
| `game/hl2/materials/models/humans/female/eyeball_l.vtf` | 2936 | `e4aeba697b3ff69c` | rebel |
| `game/hl2/materials/models/humans/female/eyeball_r.vmt` | 118 | `9f0e8e9533547e24` | rebel |
| `game/hl2/materials/models/humans/female/eyeball_r.vtf` | 2936 | `a0bb0aaef84fb4ca` | rebel |
| `game/hl2/materials/models/humans/female/fmouth.vmt` | 119 | `636421d09dbdde84` | rebel |
| `game/hl2/materials/models/humans/female/fmouth.vtf` | 21992 | `da21747025fc962f` | rebel |
| `game/hl2/materials/models/humans/female/group03/citizen_sheet.vmt` | 102 | `0e6756f03e623f7c` | rebel |
| `game/hl2/materials/models/humans/female/group03/citizen_sheet.vtf` | 2796408 | `600cd8da06dd7762` | rebel |
| `game/hl2/materials/models/humans/female/group03/joey_facemap.vmt` | 139 | `205b7acf1ecad853` | rebel |
| `game/hl2/materials/models/humans/female/group03/joey_facemap.vtf` | 87528 | `d81f82ef086846cf` | rebel |
| `game/hl2/materials/models/humans/female/pupil_l.vtf` | 5720 | `4bdc24102cdd9466` | rebel |
| `game/hl2/materials/models/humans/female/pupil_r.vtf` | 5720 | `255116e7dfcbfe5c` | rebel |
| `game/hl2/materials/models/humans/male/dark_eyeball_l.vmt` | 119 | `dbc9a63801872207` | citizen |
| `game/hl2/materials/models/humans/male/dark_eyeball_l.vtf` | 2936 | `60351cff1d2a4a92` | citizen |
| `game/hl2/materials/models/humans/male/dark_eyeball_r.vmt` | 119 | `f83a66a15991b261` | citizen |
| `game/hl2/materials/models/humans/male/dark_eyeball_r.vtf` | 2936 | `5f82b2c66a07e66c` | citizen |
| `game/hl2/materials/models/humans/male/eyeball_l.vmt` | 114 | `6649f47134eb2d0e` | worker |
| `game/hl2/materials/models/humans/male/eyeball_l.vtf` | 2936 | `078e37fd9a4fb25e` | worker |
| `game/hl2/materials/models/humans/male/eyeball_r.vmt` | 114 | `2e4befc7bb673791` | worker |
| `game/hl2/materials/models/humans/male/eyeball_r.vtf` | 2936 | `10604db9223fea3f` | worker |
| `game/hl2/materials/models/humans/male/group01/citizen_sheet.vmt` | 138 | `d4a13094383eb0dc` | citizen |
| `game/hl2/materials/models/humans/male/group01/citizen_sheet.vtf` | 699256 | `8934233e61847620` | citizen |
| `game/hl2/materials/models/humans/male/group01/van_facemap.vmt` | 170 | `01f2753c38b41d2f` | citizen |
| `game/hl2/materials/models/humans/male/group01/van_facemap.vtf` | 87568 | `a8264c02a051bbc5` | citizen |
| `game/hl2/materials/models/humans/male/group03/citizen_sheet.vmt` | 138 | `7f095f9a03ea1ae2` | worker |
| `game/hl2/materials/models/humans/male/group03/citizen_sheet.vtf` | 2796408 | `3cab779ad45867ee` | worker |
| `game/hl2/materials/models/humans/male/group03/ted_facemap.vmt` | 136 | `80108891317f45ff` | worker |
| `game/hl2/materials/models/humans/male/group03/ted_facemap.vtf` | 87528 | `7206d54a21435120` | worker |
| `game/hl2/materials/models/humans/male/mouth.vmt` | 116 | `de2ee4d63fbe512f` | citizen, worker |
| `game/hl2/materials/models/humans/male/mouth.vtf` | 21992 | `f5ca6ddfb6d30b1f` | citizen, worker |
| `game/hl2/materials/models/humans/male/pupil_l.vtf` | 5720 | `f12a6a09f9101530` | citizen, worker |
| `game/hl2/materials/models/humans/male/pupil_r.vtf` | 5720 | `178d258147e91c55` | citizen, worker |
| `game/hl2/materials/models/police/barneyface.vmt` | 185 | `e25a19ff9db427eb` | barney |
| `game/hl2/materials/models/police/barneyface.vtf` | 524417 | `adf44785deb7f4cb` | barney |
| `game/hl2/materials/models/police/bmouth.vmt` | 112 | `1f6bd1b5d85726e1` | barney |
| `game/hl2/materials/models/police/bmouth.vtf` | 21992 | `d039d8e59880837e` | barney |
| `game/hl2/materials/models/police/eyeball_l.vmt` | 104 | `d15c7ee3dce1fab3` | barney |
| `game/hl2/materials/models/police/eyeball_l.vtf` | 2936 | `6113021af832a856` | barney |
| `game/hl2/materials/models/police/eyeball_r.vmt` | 104 | `79181a08495ad2dc` | barney |
| `game/hl2/materials/models/police/eyeball_r.vtf` | 2936 | `14d2e3ad52ee0c7f` | barney |
| `game/hl2/materials/models/police/metrocop_sheet.vmt` | 206 | `5b5b6af68b3e6f60` | barney, metrocop |
| `game/hl2/materials/models/police/metrocop_sheet.vtf` | 699216 | `f15892ad0ed444ba` | barney, metrocop |
| `game/hl2/materials/models/police/pupil_l.vtf` | 5720 | `bfcc8f82ddb6a92e` | barney |
| `game/hl2/materials/models/police/pupil_r.vtf` | 5720 | `ff696acc06ba45c5` | barney |
