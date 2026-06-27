# VerseCraft Cohesion Harness — Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

## Problem

VerseCraft generates an AI anime visual novel from a seed. Stories currently feel
incoherent across chapters. Observed failure modes:

- **Continuity breaks** — characters forget earlier events, contradict established facts.
- **No arc / payoff** — chapters read as disconnected episodes; setups never pay off.
- **Choices feel ignored** — what the player picks doesn't visibly echo later.
- **Voice / tone drift** — character personalities and tone wander between chapters.
- **Name-switching** — a character's name changes for a chapter.

### Root cause

Each chapter is generated almost blind to what actually happened before. The only
memory passed forward is `buildContextSummary` (`lib/versecraft/store.ts:111-132`):
recent choice *tones* and which characters the player is *closest to*. There is no
record of actual plot events, revelations, or established facts. The cast is not
re-asserted as a hard constraint at generation time (hence name-switching). Chapters
are cached per `(seed, index)` and ignore choices entirely
(`app/routes/api/versecraft/chapter.ts:36-37`), and the next chapter is prefetched
*before* the player makes the current chapter's choice (`store.ts:328`).

## Goals

1. Eliminate continuity breaks, name-switching, and voice drift.
2. Deliver real narrative arcs — setups planted early pay off later.
3. Make player choices genuinely reshape later chapter prose.
4. Keep the game responsive (no long blocking wait at start).
5. Keep the deterministic no-AI fallback path coherent and working.

## Non-Goals

- Branching the **structure** (chapter count, act layout, route). Choices reshape
  *prose and emphasis*, not which chapters exist. Structure stays seed-stable.
- A full multi-agent "writers' room" with a separate continuity-editor rewrite pass
  (Approach C). We start lean and can add a continuity-editor later if contradictions
  still slip through.
- Multiple discrete endings / unlock system. Out of scope for this pass.

## Decisions (from brainstorming)

- **Approach:** B (Showrunner: outline-then-write) built on A's foundation
  (story bible + running ledger).
- **Choices vs. seed:** choices matter more. A shared seed reproduces the same
  world/cast/route/Tier-1 outline (the deterministic shell), but chapter prose
  legitimately diverges along the player's choice path.
- **Outline adaptivity:** revised at act boundaries. Fixed within an act; a showrunner
  pass revises the remaining outline at each act break using ledger + choices, keeping
  Tier-1 payoff promises intact.
- **Planning latency:** two-tier outline. A fast cheap Tier-1 skeleton synchronously at
  world creation, then a Tier-2 detailed enrich in the background before chapter 1.
- **Continuity guard:** lightweight (bible-as-hard-constraints + scribe ledger), not a
  separate editor rewrite pass.
- **Ledger feed:** full ledger forward early; rolling compaction once it grows long.

## Architecture

Three new state layers plus a craft module, layered onto the existing generation flow.

### Layer 1 — Story Bible (immutable, per seed)

The authoritative fact sheet, derived once from `GenWorld` at world creation:

- **Cast roster:** for each character — canonical name, pronouns, one-line identity,
  voice anchor (speech register / verbal tics), secret, fear, role.
- **World facts:** setting, premise, established constraints.
- **Route plan:** the existing per-act/per-chapter emotional goals.

The bible is rendered into a compact constraint block and injected at the **top of every
generation call** (chapter, scribe, outline-revise) with an explicit instruction:
*"These names, pronouns, and facts are fixed. Never rename a character or contradict an
established fact."* This is the primary fix for name-switching and voice drift.

### Layer 2 — Arc Outline (two-tier, per seed; revised at act boundaries)

New structure describing the planned dramatic arc.

- **Tier 1 (skeleton, synchronous at world creation):** for each act — dramatic goal,
  emotional endpoint, and which character arc it advances. Cheap enough that chapter 0
  already has arc awareness.
- **Tier 2 (detailed, background enrich):** for each chapter — dramatic question, setups
  to **plant**, payoffs to **deliver**, callbacks to earlier setups, scene intentions.
- **Act-boundary revision:** at each act break, a showrunner pass regenerates the
  remaining Tier-2 outline from the accumulated ledger + choice history, while honoring
  the Tier-1 act endpoints and outstanding payoff promises.

This is the primary fix for "no arc / payoff."

### Layer 3 — Running Ledger (per seed + choice path)

After each chapter is generated, a cheap **continuity scribe** call distills it into a
compact `LedgerEntry`:

- one-paragraph summary of what happened,
- facts revealed,
- threads opened / threads closed,
- relationship shifts,
- new established facts.

The accumulated ledger feeds forward into every later chapter's prompt. Once long, older
entries are compacted into a rolling digest while recent entries stay verbatim. This is
the primary fix for continuity, and combined with choice history it makes choices echo.

### Craft module — `lib/versecraft/gen/craft.ts`

A structured system-prompt block injected on generation calls, encoding VN screenwriting
craft:

- every scene needs a goal, a conflict, and a turn;
- subtext over exposition (show, don't tell);
- character voice anchored to each character's bible voice anchor;
- plant-and-payoff discipline (honor the outline's setups/payoffs);
- player choices must visibly echo in subsequent prose.

This is the concrete form of the "DeepSeek scriptwriting skill" — DeepSeek has no
Claude-style skills, so it is a reusable injected prompt module.

## Generation Flow

1. **World creation** (`POST /api/versecraft/world`): generate world + cast + route +
   **Tier-1 outline** synchronously; build the Story Bible; persist; return with
   chapter-0 opening. Player starts reading immediately.
2. **Background:** enrich **Tier-2 outline**; persist. Must be ready before chapter 1.
3. **Each chapter** (`POST /api/versecraft/chapter`): prompt assembled from
   Bible (hard constraints) + this chapter's outline beat + ledger (compacted) +
   choice history + craft module.
4. **After each chapter:** scribe call → append `LedgerEntry` for this
   `(seed, choicePathHash, index)`.
5. **At each act boundary:** showrunner revise → regenerate remaining Tier-2 outline.

## Data Model & Caching

### Types (`lib/versecraft/gen/world-types.ts`)

- New: `ActPlan`, `ChapterBeat`, `ArcOutline { acts: ActPlan[]; chapters: ChapterBeat[] }`,
  `LedgerEntry`.
- Extend `GenWorld` with `outline: ArcOutline` and a derived `bible` rendering helper.

### Choice path

The ordered list of the player's committed choices (id + tone). Hashed to
`choicePathHash` for cache keys.

### Caching

- **Chapter cache key:** `(seed, index)` → **`(seed, index, choicePathHash)`**.
  Divergent choices produce divergent prose without collisions.
- **Ledger:** stored per `(seed, choicePathHash)`.
- **Act-revised outline:** stored per `(seed, choicePathHash)` at the act boundary;
  Tier-1 skeleton + initial Tier-2 are seed-only (the deterministic shell).
- **Deterministic shareable shell** = world + cast + route + Tier-1 outline (seed-only).
  Prose diverges by choice path, as intended.

### Prefetch timing fix

Today chapter N+1 is prefetched before N's choice is committed, which would now cache the
wrong variant. Change to: prefetch chapter N+1 only **after** N's choice is committed
(prefetch its opening, stream the rest), keyed by the updated choice path.

### Prisma schema + migration

- Extend `versecraftGenChapter` unique key to include `choicePathHash`.
- Persist `outline` (and act-revised variants) and `ledger` entries, keyed appropriately.

## Fallback Parity (no-AI path)

The deterministic fallback writer (`lib/versecraft/gen/fallback.ts`) gets:

- a deterministic Tier-1 outline derived from the seeded route plan,
- templated `LedgerEntry` generation,

so the non-AI path (and tests / no-key dev) stays coherent and the new prompt-assembly
code does not assume AI output. Fallback outline revision is a deterministic no-op
(skeleton is already fixed).

## File Surface

- `lib/versecraft/gen/world-types.ts` — new types; extend `GenWorld`.
- `lib/versecraft/gen/craft.ts` — **new** scriptwriting craft module.
- `lib/versecraft/gen/outline.ts` — **new** Tier-1/Tier-2 outline generation + revision
  (may live in `generate.server.ts` if simpler).
- `lib/versecraft/gen/ledger.ts` — **new** scribe distillation + compaction.
- `lib/versecraft/gen/generate.server.ts` — new prompt assembly; `generateOutline`,
  `reviseOutline`, `scribeChapter`; rewrite `generateChapter`.
- `lib/versecraft/gen/fallback.ts` — deterministic outline + ledger.
- `lib/versecraft/store.ts` — track choice path + ledger + outline; act-boundary
  revision trigger; prefetch-after-commit; replace `buildContextSummary`.
- `lib/versecraft/gen/client.ts` + `app/routes/api/versecraft/{world,chapter}.ts`
  (+ likely new outline/ledger params or endpoints) — thread choice path; new cache key.
- `prisma/schema.prisma` + migration — extended chapter key; outline + ledger storage.

## Testing

- **Seeded determinism:** same seed + same choice path → identical shell (world, cast,
  route, Tier-1 outline) and identical fallback prose.
- **Choice divergence:** same seed + different choice paths → different `choicePathHash`,
  no cache collision, divergent prose.
- **Bible constraints:** cast roster present in every assembled chapter prompt; names
  fixed.
- **Ledger accumulation:** scribe produces a well-formed `LedgerEntry`; ledger grows and
  compacts as expected.
- **Outline revision:** act-boundary revise keeps Tier-1 endpoints and outstanding
  payoffs; runs once per act.
- **Fallback parity:** no-AI path produces coherent outline + ledger; no crash when
  DeepSeek is unconfigured.
- Follow repo verify conventions (`./node_modules/.bin/*`; no DOM test env; route-tree
  regen quirk).

## Risks & Open Questions

- **Ledger token growth** over 26 chapters — mitigated by rolling compaction; tune the
  compaction threshold during implementation.
- **Background Tier-2 not ready before chapter 1** on slow connections — chapter 1 falls
  back to Tier-1 outline beat if Tier-2 is missing.
- **Choice-path cache explosion** — many distinct paths means many cached prose variants;
  acceptable since generation is on-demand and per-user, but monitor storage.
