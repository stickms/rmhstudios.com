# Slice It implementation status

Generated tracker for [`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md).
Regenerate rather than hand-editing.

## Totals

- **shipped**: 49
- **in flight**: 13
- **blocked**: 5
- **open**: 95

## Remaining wave plan

Grouped so each wave's three agents own disjoint files. `prisma/schema.prisma`
goes to exactly one agent per wave — that constraint has driven the grouping
more than any other.

| Wave | Agent A (Opus) | Agent B (Opus) | Agent C (Sonnet) |
| --- | --- | --- | --- |
| 7 | `P1` `P2` `P3` `P4` practice & transport | `N3` `N4` `N5` `N6` modes on the lobby | `V1` `V2` `V6` skins & sounds |
| 8 | `G2` 4K/6K lanes (schema) | `C2` `C7` `C8` `C9` `C10` `C12` chart pipeline | `M2` `M4` `M5` `M7` mods |
| 9 | `L1` `L2` `L3` `L4` `L5` library social (schema) | `O1` `O2` telemetry (schema shared w/ A) | `A1`–`A7` accessibility suite |
| 10 | `S3` `S4` `S5` progression modes (schema) | `I1` `I2` `I5` `I7` `I9` input layer | `V3` `V4` `V7` `V11` presentation |
| 11 | `S6` `S7` `S10` `S11` `S12` remaining modes | `O3` `O4` `O5` analysis & storage ops | `H9` `H10` `X4` `X5` `X13` |
| 12 | `L6` `L8` `L9` `L10` `L12` `L17` creator tools | `N8` `N10` `N12` `R7` lobby + review | `G3` `G6` `G11`–`G14` note vocabulary |
| 13 | `O6` `O7` `O8` + `P7`–`P10` | `I3` `I4` `I6` `I8` input | `M8` `M9` `M10` `V12` `C4`-seam |

## Every entry

| ID | Idea | Size | Status | Note |
| --- | --- | --- | --- | --- |
| `G1` | A health gauge, opt-in, worth a multiplier | M | shipped | w1 |
| `G2` | Four-key and six-key lane modes | L | open |  |
| `G3` | Chords as a first-class chart element | M | open |  |
| `G4` | Directional slices | L | open |  |
| `G5` | Judged hold releases | S | shipped | w4 |
| `G6` | Rolls and repeat notes | M | open |  |
| `G7` | Chart-native mines | S | shipped | w5 |
| `G8` | Quantisation colouring | S | shipped | w1 |
| `G9` | Scroll speed as a player setting | S | shipped | w3 |
| `G10` | Scroll-velocity gimmicks | M | shipped | w4 |
| `G11` | Downscroll, upscroll and playfield layout | M | open |  |
| `G12` | Note-attack sound feedback (key sounds) | M | open |  |
| `G13` | Combo tiers with mechanical weight | M | open |  |
| `G14` | Section-aware note density | M | open |  |
| `C1` | A chart editor | L | shipped | w1,w3,w4 — phases 1-8 all shipped |
| `C2` | Multiple charts per song | L | open |  |
| `C3` | A computed difficulty rating | M | shipped | w4 |
| `C4` | Stem separation for melody-aware charts | L | blocked | needs a source-separation model + GPU-class worker |
| `C5` | Section detection | M | shipped | w4 |
| `C6` | A real timing map instead of one BPM | M | shipped | w4 |
| `C7` | Preview points | S | open |  |
| `C8` | Chart regeneration on demand | M | open |  |
| `C9` | Import external chart formats | L | open |  |
| `C10` | Uploader density override | S | open |  |
| `C11` | Chart linting | S | shipped | w4 |
| `C12` | Deterministic chart hashing | S | open |  |
| `P1` | Practice mode | M | open |  |
| `P2` | Failed-section drilling | M | open |  |
| `P3` | Autoplay | S | open |  |
| `P4` | Assist tick and metronome | S | open |  |
| `P5` | Automatic offset calibration | S | shipped | w1 |
| `P6` | Timing error statistics, shown | S | shipped | w1 |
| `P7` | Adaptive difficulty warm-up | M | open |  |
| `P8` | A weakness profile | L | open |  |
| `P9` | Race your own personal best | M | open |  |
| `P10` | A tutorial | M | open |  |
| `A1` | No-fail and assist modes | S | open |  |
| `A2` | A photosensitivity mode | S | open |  |
| `A3` | Colour-blind-safe lane palettes | S | open |  |
| `A4` | Deaf and hard-of-hearing support | M | open |  |
| `A5` | One-handed play as a supported configuration | S | open |  |
| `A6` | Automatic output-latency detection | S | open |  |
| `A7` | Motion sensitivity controls | S | open |  |
| `A8` | Haptic hit feedback | S | shipped | w5 |
| `A9` | Adjustable judgement windows | S | shipped | w4 |
| `A10` | Chart content warnings | S | open |  |
| `H1` | An early/late hit-error bar | S | shipped | w1 |
| `H2` | Distinct combo-break feedback | S | shipped | w1 |
| `H3` | A real results screen | M | shipped | w1 |
| `H4` | Live grade and accuracy pace | S | shipped | w1 |
| `H5` | A song progress bar with structure | S | shipped | w5 |
| `H6` | Quick restart and skip | S | shipped | w5 |
| `H7` | Full-combo and perfect indicators | S | shipped | w1 |
| `H8` | Clear lamps in the library | S | shipped | w2 |
| `H9` | Judgement popup customisation | S | open |  |
| `H10` | A shareable results card | S | open |  |
| `M1` | Mirror | S | shipped | w3 |
| `M2` | Random and S-Random | S | open |  |
| `M3` | A family of visibility mods | M | shipped | w3 |
| `M4` | Chart-level double time | M | open |  |
| `M5` | Holds as taps | S | open |  |
| `M6` | Perfect-or-die | S | shipped | w4 |
| `M7` | Modifier presets | S | open |  |
| `M8` | A weekly modifier roulette | M | open |  |
| `M9` | Rebalanced modifier economics | M | open |  |
| `M10` | Per-chart modifier legality | S | open |  |
| `S1` | A Slice It! daily challenge | M | shipped | w5 |
| `S2` | Courses | L | shipped | w5 |
| `S3` | A skill-certification ladder | L | open |  |
| `S4` | Endless survival | M | open |  |
| `S5` | A campaign | L | open |  |
| `S6` | Per-chart missions | M | open |  |
| `S7` | A boss-chart mode | M | open |  |
| `S8` | Setlists and playlists | M | shipped | w5 |
| `S9` | Random and roulette selection | S | shipped | w2 |
| `S10` | Score attack with tiered targets | M | open |  |
| `S11` | Marathon mode | M | open |  |
| `S12` | Time attack | M | open |  |
| `N1` | Spectating | M | in flight | w6 |
| `N2` | Teams | M | in flight | w6 |
| `N3` | Co-op | L | open |  |
| `N4` | Attack mode | L | open |  |
| `N5` | Elimination | M | open |  |
| `N6` | Skill-based matchmaking | M | open |  |
| `N7` | Song voting | M | in flight | w6 |
| `N8` | Lobby queues and host rotation | M | open |  |
| `N9` | Invite links and friend lobbies | S | in flight | w6 |
| `N10` | Async ghost races | M | open |  |
| `N11` | Tournaments | L | blocked | depends on a platform tournaments hub that does not exist |
| `N12` | Rejoin a match in progress | M | open |  |
| `R1` | Split the leaderboard by chart and mod pool | M | shipped | w2 |
| `R2` | A global skill rating | L | shipped | w4 — reachable since w5, but no chart is ranked until a moderator promotes one |
| `R3` | Actually record replays | M | shipped | w3 |
| `R4` | Watch replays | M | shipped | w3 |
| `R5` | Leaderboard scopes | S | shipped | w2 |
| `R6` | Score history | M | shipped | w2 |
| `R7` | A review surface for what integrity already flags | M | open |  |
| `R8` | Server-side replay verification | L | shipped | w3 |
| `R9` | First clear and clear rate | S | shipped | w2 |
| `R10` | A ranked chart pool | L | shipped | w4 |
| `L1` | Genres and tags | M | open |  |
| `L2` | Curated shelves | M | open |  |
| `L3` | Chart reviews | M | open |  |
| `L4` | Follow uploaders and charters | S | open |  |
| `L5` | Timestamped comments | S | open |  |
| `L6` | An uploader dashboard | M | open |  |
| `L7` | Waveform scrubbing in the details panel | M | open |  |
| `L8` | Metadata autofill | M | open |  |
| `L9` | Reporting and takedowns | M | open |  |
| `L10` | Chart packs | M | open |  |
| `L11` | An RMHMusic bridge | L | blocked | needs RMHMusic's own schema and storage decisions |
| `L12` | Storage lifecycle | M | open |  |
| `L13` | A song table view | M | shipped | w2 |
| `L14` | A real search ranking | M | in flight | w6 |
| `L15` | Artist pages and per-artist filtering | M | in flight | w6 |
| `L16` | Album and map-pack authoring | L | in flight | w6 |
| `L17` | Recently played, resume and history | S | open |  |
| `L18` | Saved searches and smart lists | M | shipped | w2 |
| `X1` | More than three achievements | S | in flight | w6 |
| `X2` | More arcade challenges | S | in flight | w6 |
| `X3` | Economy participation | S | in flight | w6 |
| `X4` | Battle pass integration | M | open |  |
| `X5` | Post runs to the feed | M | open |  |
| `X6` | A profile showcase module | S | in flight | w6 |
| `X7` | Wrapped and recap | S | in flight | w6 |
| `X8` | A Discord Activity gateway | M | shipped | w1 |
| `X9` | Slice It! as a Discord Activity | L | blocked | cannot be exercised without a live Discord client |
| `X10` | Discord identity, and a guest mode that saves nothing | M | shipped | w1,w2 |
| `X11` | Profiles reachable from the leaderboard | S | shipped | w2 |
| `X12` | A Slice It! player page | M | shipped | w2 |
| `X13` | Developer API endpoints | M | open |  |
| `X14` | Practice streaks | S | in flight | w6 |
| `V1` | Note and playfield skins | M | open |  |
| `V2` | Custom hit sounds | S | open |  |
| `V3` | A reactive background | M | open |  |
| `V4` | Cover-derived palettes | S | open |  |
| `V5` | Combo milestones | S | shipped | w5 |
| `V6` | Cosmetic unlocks | M | open |  |
| `V7` | Stage backdrops | M | open |  |
| `V8` | Chart preview animation on cards | S | shipped | w5 — computed and served; strip renders on hover |
| `V9` | Results replays as clips | L | blocked | depends on a clip encoder that does not exist |
| `V10` | Lane cover customisation | S | shipped | w3 |
| `V11` | Seasonal presentation | S | open |  |
| `V12` | A dedicated game hub page | M | open |  |
| `I1` | A full remapping surface | M | open |  |
| `I2` | Gamepad haptics | S | open |  |
| `I3` | MIDI controllers | M | open |  |
| `I4` | Touch layout customisation | M | open |  |
| `I5` | An input latency test | S | open |  |
| `I6` | Low-latency audio and pitch preservation | M | open |  |
| `I7` | Dance pad and arcade controller mapping | M | open |  |
| `I8` | Local two-player | M | open |  |
| `I9` | Keyboard ghosting guidance | S | open |  |
| `I10` | Session guards | S | shipped | w5 |
| `O1` | Per-chart miss heatmaps | M | open |  |
| `O2` | Automatic bad-chart detection | M | open |  |
| `O3` | Analysis in the worker fleet | M | open |  |
| `O4` | Transcode on ingest | M | open |  |
| `O5` | Preload before the countdown | S | open |  |
| `O6` | Frame-timing telemetry | S | open |  |
| `O7` | Ship one difficulty, not four | M | open |  |
| `O8` | An admin content dashboard | M | open |  |
