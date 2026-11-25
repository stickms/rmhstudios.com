# Sprint 11 — summary

Twenty features shipped on `claude/autonomous-sprint-11`. Each was built from its brief in its own worktree, reviewed by a fresh reviewer who fixed what they found, and merged wave by wave (plan: [plan.md](plan.md)).

## What shipped
- **01 Bots at the Gabriel's Horn table.** Computer players fill empty seats under the same rules and see only what a player sees. Log entries name players by public seat number, not socket id.
- **02 Roll from the character sheet.** Tap a skill, save or attack on a D&D 5e or PF2e sheet to roll with modifiers and advantage. There is a free box, and the log stays on the device. A PF2e critical Strike doubles the total.
- **03 A party for your table.** A game master's party in RMHCharacters: members bring their sheets, and the GM sees AC, HP, conditions and passive Perception at a glance. The turn order is protected by a compare-and-set.
- **04 Chords in every key.** A new unit for piano and guitar: four qualities by ear, triads read on the staff, all major and minor triads played, diminished and augmented triads played, and inversions.
- **05 Make and share a Lights Out board.** `/lights-out/new`, `/lights-out/b/$id` and `/lights-out/boards`. An exact GF(2) solver sets the best possible, there is a fewest-moves list, and boards can be reported.
- **06 Today's puzzles among your friends.** A friends board on every daily result and a summary line on `/daily`, limited to mutual follows.
- **07 Share a Studio project.** "Share a copy" makes a link to a sanitised snapshot. `/studio?share=` opens a copy, and links can be revoked.
- **08 Record into the Studio.** Arm MIDI tracks and record from the typing keyboard or a MIDI keyboard, with count-in, quantize and latency. A take is one undoable step.
- **09 Read a book together.** A moderator schedules a library book a part a week. Each part opens a spoiler-warned community thread, and readers are notified. Posting uses a compare-and-set claim with a stale-claim release.
- **10 Edit a deck together.** Owners invite mutuals as co-editors, who add, edit and study the deck. A block or ban ends the editing.
- **11 Your keyboard layout in RMHType.** The touch-typing course and keyboard come in Dvorak, Colemak and AZERTY, and the worst-keys drill follows the chosen layout.
- **12 Challenge someone to race your best run.** Send a ghost run to a mutual. The race is claimed once and settled from the server's clock and checks, and both members get the result.
- **13 Price changes on home listings.** Price history, a "Reduced" badge and filter, and alerts to favouriters when a price drops.
- **14 Describe listing photos.** Alt text for each photo, kept with its photo through edits.
- **15 Quiz your study room.** The host runs a multiple-choice quiz on a deck during a break, marked on the server, with standings at the end.
- **16 Subtitles in RMHTube.** Upload SRT or VTT for a queue item; viewers choose a track and size on their own device.
- **17 Listen to your flashcards.** Cards are read aloud in each side's language, front, then a pause, then back, and graded with one key.
- **18 Listing photos from the site only.** Listings accept only photos uploaded to the site, an erased member's listing photos are erased, and a gate checks picture columns against the media sweep.
- **19 Close the Sprint 09 and 10 gaps.**
  - The suggestion duplicate check is scoped to the suggester.
  - A private event no longer writes a public mod-log row.
  - `<bdi>` around names.
  - Reserved suspension reasons are refused.
  - An AI persona's words are erased with the account.
- **20 Every form field has a name.** 169 unnamed fields named, with a syntax-tree gate at 0.

## Fixes made at integration
- **Merge of main.** All generated files were regenerated. The FOUC audit visits the read-along and board pages.
- **Second and third merges of main** (415 commits, then 2). The generated files are untracked, following main's new convention, and regenerated. Error codes, erasure, namespaces, casino lobbies and the deck study column were merged keeping both sides.
- **Bundle.** The RMHType lesson route's 404 check pulled every layout's course into the entry, and `/studio` pulled in the share module. Both now load lazily, and the entry is 695.9 / 701.0 KB, below main's own.
- **Field names (rule change).** A field primitive that spreads its props now counts as a definition, so main's Med Schools controls are checked at their call sites. The baseline stays 0.
- **Gabriel's Horn (01).** A local `who` hid the log helper, so a player reconnecting with the same socket id crashed the seat handler.
- **Studio record (08).**
  - A take is refused while the loop is on (disabled with its reason), and switching the loop on mid-take ends the take before the clock wraps.
  - Play or Space during the count-in cancels the take.
  - A failure after the transport starts pauses it.
  - Covered by pure-function tests.
- **RMHType (12).** Ordinary solo runs clamp position and errors as the challenge path does, and a solo score posts only at or under `MAX_WPM`.
- **Field names (20).** The main composer was named as a quote comment; it now has its own name. 103 snapshot lines were updated, each differing only by an added label.
- **Lights Out maker (05).** The site sheet skipped the board maker's files, so its pages would have rendered without their utilities.
- **Type errors.** The first whole-branch `tsc -b` found 28 errors: d3 links, `isolate`, deck language tags, the following contract enum, the RMHTube restore row, the room-quiz phase check, and test doubles.
- **Gates.**
  - The cache ratchet's TTL heuristic matched "settle". This is a rule change; the baseline goes from 63 to 41.
  - The card-listen device key is visible to the registry scan.
  - `challenges.server.ts` joined the board-privacy exemptions.
  - The prepaint bundle was rebuilt.
  - The field-names scan has a 60 s timeout.
- **i18n.** Two chord-lesson keys were added. The rest of the extract was churn.

## Verification
- **Typecheck:** a cold `tsc -b` is now killed by the out-of-memory killer on this 15 GB box even single-threaded, on main alone too. The site project was checked in seven slices with 0 errors, and core, engine and `typecheck:strict` are clean.
- **Lint:** 482 changed files, 0 errors, no new warnings. `lint:ratchet` OK.
- **Tests:** `pnpm test` passed 20,335 tests in 1,728 files, with 14 skipped. `pnpm test:product` passed 2,676.
- **Build:** entry 695.9 / 701.0 KB raw; critical path 912.9 / 918.0 KB raw and 239.6 / 242.6 KB brotli; site CSS 31.3 / 32.0 KB; every island within budget. The generated-docs, SDK and route-table checks pass.
- **Postgres 16:** 503 migrations apply from empty, with 0 invalid indexes.
  - Challenge claims and settlement happen once.
  - Read-along parts post once across two concurrent sweeps.
  - Quiz and co-editor access rules hold, including after a block.
  - Account deletion erases and hands over as the registry says, including main's med pre-step. A re-run is a no-op and `TODO_CEILING` stays at 4.
- **Browser:** 182 loads of the production build across both editions, both widths and `ar`: no horizontal scroll and no console or hydration errors.

## Owner follow-ups
- **S11-01:** PlayerView, claims and chat carry socket ids. This predates the sprint.
- **S11-07:** shared Studio snapshots keep audio track names.
- **S11-09:** a rare double post is possible if the post succeeds and recording its id fails before the process dies.
- **S11-10:** a banned co-editor still appears in queue and stats readers until their rows go.
- **S11-11:** `layout-label` is unused. Unit 6 punctuation keeps characters.
- **S11-12:**
  - Accuracy comes from the client's error count.
  - If a hub settlement fails, the race stays "racing" until the 15-minute job.
  - Hub notices check only the in-app system preference.
- **S11-19:** a reserved suspension reason gets a generic 400.
- **S11-20:** the rideshare form duplicates its labels, and the tf2 `Field` labels a div.
- **Integration:** the commit gate's default-checker `tsc` is killed by the out-of-memory killer on a 4-core / 15 GB box even when warm.
- **Integration:** a cold `tsc -b` no longer fits in a 15 GB box even single-threaded, on main too. The gate's tsc step needs more memory or a split.
- **Integration:** the shared `node_modules` on the build box carries hand-linked fonts and router-generator until a real `pnpm install`.
