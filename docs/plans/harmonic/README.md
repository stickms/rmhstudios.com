# Harmonic — implementation plan

Status: approved for implementation, 2026-10-31. Base: `main` at `aa3bf710`.

**Harmonic** is an original, open-source, single-player story shooter that runs on the
site's clean-room browser Source engine (`lib/tf2-game/` + `lib/sp-game/`, see
[`docs/tf2-game.md`](../../tf2-game.md)). Everything in it — story, characters, factions,
levels, models, textures, sounds — is original and lives in this repository as code. It
uses **no** game assets, names or text from any other game or franchise.

| File                                   | What                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------- |
| [`story.md`](story.md)                 | The story bible: premise, cast, factions, chapters, endings, tone, rules. |
| [`architecture.md`](architecture.md)   | Technical design: module map, the level compiler, assets, systems, tests. |
| [`work-packages.md`](work-packages.md) | Every work package (WP): scope, files, interfaces, done criteria, deps.   |
| [`STATUS.md`](STATUS.md)               | **The ledger.** Who is doing what, what is done, what is unblocked.       |

This file **wins wherever the others disagree.** A decision that changes the plan is
recorded in §2 below in the same commit as the code that needs it.

## 1. Working on Harmonic from any Claude session

Harmonic is built by many sessions, on different machines, often in parallel. Nothing
lives in a session's head: the plan, the ledger and the code are the whole state.

### 1.1 Starting a session (the kickoff prompt)

Paste this into a fresh session on this repository:

> Read `docs/plans/harmonic/README.md`, then `STATUS.md`. Pick the lowest-numbered work
> package whose status is `todo` and whose dependencies are all `done` (or the one I name:
> `<WP-ID>`). Claim it, implement it exactly as `work-packages.md` specifies, keep the
> ledger current, and land it following §1.3.

### 1.2 Claiming a package

1. `git fetch origin main` and read `docs/plans/harmonic/STATUS.md` **on `origin/main`**.
2. Check open pull requests whose title starts `harmonic(` for one already carrying that
   WP id — an open PR is a claim even if `main` does not show it yet.
3. Edit the WP's row: status `claimed`, owner = your session link (or name), branch, date.
   Commit that row change **first** (`harmonic(<WP>): claim`), so the claim is the first
   thing a reviewer sees in the PR.

One row per WP, one WP per branch, so two sessions never edit the same line and the
ledger merges cleanly.

### 1.3 Landing a package

- Branch: whatever branch your session was given; otherwise `harmonic/<wp-id>`.
- Commits: `harmonic(<WP>): <what and why>`. Every commit passes `pnpm check:consistency`
  (repo `CLAUDE.md`). Game tests: `pnpm test:tf2 lib/harmonic-game`.
- Before opening the PR: set the row to `review`, fill "Notes" with anything the next
  session must know (a deviation, a new interface, a follow-up WP you added).
- After merge the row is `done`. A merge reviewer may flip it in the merge commit.
- **Changing the plan:** if the spec is wrong, fix `work-packages.md` (and §2 here if it is
  a decision) in the same PR and say so. Never silently diverge — the next session reads
  the plan, not your code.
- **Splitting work:** a WP too big for one session is split into `<WP>a`, `<WP>b` rows in
  the same PR, each with its own done criteria.

### 1.4 Statuses

`todo` · `claimed` (someone is on it) · `review` (PR open) · `done` (merged) ·
`blocked` (Notes says on what). A `claimed` row untouched for 7 days may be taken over:
note it in Notes.

## 2. Resolved decisions

| #   | Question        | Decision                                                                                                                                                                                                                                                                                                                           |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Content         | 100% original and in-repo. No Valve (or any third-party) maps, models, textures, sounds, names or text. Levels, meshes, textures and audio are **generated from TypeScript**. No binary assets are committed except small hand-made ones under `public/harmonic/` if a WP needs them (≤ 200 KB each).                              |
| D2  | Levels          | Authored as convex brushes + entities in TypeScript (`lib/harmonic-game/levels/`), compiled **in the browser at load** into an in-memory `BspFile` by `lib/harmonic-game/compiler/`. `SpWorld`, `MapCollision` and `WorldRenderer` run on it **unchanged**. No asset channel, no `GameId`, no `versions.ts` entry, no asset route. |
| D3  | Engine game id  | `SpWorld` runs with `game: 'hl2'` (HL2's player physics) until a WP needs otherwise. Harmonic does **not** widen `SpGame`, `GameId` or `GameName` in phase 0–1; the `'hl2' \| 'portal'` ternaries across the engine stay untouched. Widening is its own WP (H9.1) if it is ever needed.                                            |
| D4  | Lighting        | Phase 0 is fullbright (every face `lightOfs = -1`, the renderer's white-luxel path) plus per-material colour. A compiler lightmap bake is H5.1.                                                                                                                                                                                    |
| D5  | Combat          | The SP layer has no weapons or hitscan; Harmonic adds them as SpEntity subclasses and a `HarmonicWorld` extension point in `lib/harmonic-game/`, never by editing HL2/Portal behaviour. Engine edits are allowed only as additive seams (a hook, an optional parameter), each named in the WP.                                     |
| D6  | Home            | Simulation and content: `lib/harmonic-game/`. Client: `lib/harmonic-game/client/`. React: `components/harmonic-game/`. Route: `/harmonic` (`app/routes/harmonic.tsx`, full-screen, top-level). Strings: i18n namespace `harmonic` (registered in `lib/i18n/config.ts`). Tests: in the `pnpm test:tf2` suite (glob added in H0.1).  |
| D7  | Licence         | Code is the repo's licence; the game's own content (story, level sources, generated asset code) is additionally offered under **CC BY-SA 4.0** — `lib/harmonic-game/LICENSE-CONTENT.md` (H0.1).                                                                                                                                    |
| D8  | Catalog         | Not listed in `lib/games.ts` until the vertical slice (milestone M2) plays end to end. Until then `/harmonic` is reachable but `noindex`.                                                                                                                                                                                          |
| D9  | Design language | The menus and HUD are a full-screen app surface: `--app-*` tokens and `AppShell`, per repo `CLAUDE.md`; play-fields are `data-jelly-zone="playfield"`. Harmonic's own look (cold whites, one amber accent for "in phase") lives in its own CSS scoped under `.harmonic-root`.                                                      |

## 3. Milestones

| Milestone | Means                                                                                              | WPs           |
| --------- | -------------------------------------------------------------------------------------------------- | ------------- |
| **M0**    | `/harmonic` loads a compiled dev level and you can walk, jump and collide in it.                   | H0.\*         |
| **M1**    | Core loop: health/cold, three weapons, the Tuner, two enemy types, phase layers, subtitles, saves. | H1._ – H3._   |
| **M2**    | Vertical slice: chapters 1–2 playable start to finish with menus; listed in the catalog.           | H4.1–H4.2, H6 |
| **M3**    | Full game: chapters 3–7, all three endings, lightmaps, audio pass, phones.                         | H4.3–H4.7, H5 |
