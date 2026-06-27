# VerseCraft Writing Guide & Anti-Repetition — Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

## Problem

VerseCraft's DeepSeek generation has role-specific system prompts (chapter writer,
world enrichment, showrunner outline, scribe) plus a shared `CRAFT_SYSTEM` block.
They cover emotional craft, voice, personalization, and continuity well, but are
comparatively thin on:

- **VN format & pacing** — how the prose reads *as a visual novel* (scene length,
  narration/inner-thought/spoken-line balance, chapter hooks, emotion cadence).
- **Setting & worldbuilding** — coherent, lived-in places with internal logic.
- **Line-level prose** — concrete imagery, distinct voices, anti-cliché.

Separately, generated stories still show **repeated dialogue** in four forms:
1. within a chapter (a line/beat restated close together),
2. across chapters (lines/beats resurfacing later),
3. characters sounding alike (interchangeable phrasing),
4. choice options reading as reworded versions of each other.

## Goals

1. Give DeepSeek thorough, well-targeted guidance on writing a VN: format/pacing,
   worldbuilding, and prose quality.
2. Reduce all four kinds of dialogue repetition.
3. Keep per-call token cost modest (balanced, composable — inject only the blocks
   each generation step needs).

## Non-Goals

- No new genre system or settings-bank changes — stays within the existing
  emotional-anime romance/drama frame, flexing to the player's prompt.
- No change to the deterministic fallback writer (it already de-dups and is
  network-free).
- No data model / schema / API changes — prompt content + composition, plus one
  pure post-generation dedup pass.

## Decisions (from brainstorming)

- **Thoroughness:** balanced + composable (named blocks, injected per step).
- **Repetition coverage:** all four kinds.
- **Anti-repetition mechanism:** prompts **plus** a small deterministic code guard
  (near-duplicate node filter on AI chapter output).

## Architecture

### Composable writing-guide blocks (`lib/versecraft/gen/craft.ts`)

Expand `craft.ts` into a set of named, exported prompt blocks (each ~4–8 tight
lines). Keep `CRAFT_SYSTEM` and `craftDirectives()`; add the rest.

- **`CRAFT_SYSTEM`** *(exists; light polish)* — dramatic craft: scene goal/conflict/
  turn, subtext, plant & pay off, choices echo, earn beats.
- **`VN_FORMAT`** *(new)* — VN format & pacing: keep scenes tight and moving (no
  wandering); balance narration / inner thought / spoken `mc` lines; end each scene
  and chapter on a hook, turn, or unresolved beat; let emotion shift line-to-line
  and land on beats; vary which characters are present; avoid talking-heads stretches
  and info-dumps.
- **`PROSE_CRAFT`** *(new)* — line-level prose: concrete sensory verbs/nouns over
  adjectives; no stock-anime/clichéd phrasing (e.g. "a single tear", "little did
  they know", "time seemed to stop"); each character's diction, rhythm, and
  vocabulary distinct per their bible `speechStyle` — two characters never phrase
  things the same way; restraint over melodrama; no purple prose; **vary imagery —
  do not keep reaching for the same phrases or images.**
- **`SETTING_CRAFT`** *(new; for world enrichment)* — worldbuilding: a coherent,
  lived-in sense of place; internal logic the story honors; grounded sensory
  specificity; motifs that belong to this world; tone/genre consistency that flexes
  to the player's prompt without breaking the emotional romance/drama frame.
- **`CHOICE_CRAFT`** *(new)* — choices: the 2–3 options must be genuinely different
  *moves* (distinct content AND consequence), never reworded versions; each option's
  `direction` must be materially distinct; include occasional bad/costly options.
- **`ANTI_REPETITION`** *(new)* — explicit no-repeat rules spanning the four cases:
  never restate a line, image, or sentiment already used in this chapter; never
  reuse a line, exchange, or beat from the story-so-far (the ledger); keep every
  node advancing rather than echoing.

### Composition into prompts (`lib/versecraft/gen/generate.server.ts`)

- `chapterSystemPrompt()` → identity + player/MC_SPEAKER/emotion/JSON rules
  *(existing)* + `VN_FORMAT` + `CRAFT_SYSTEM` + `PROSE_CRAFT` + `CHOICE_CRAFT` +
  `ANTI_REPETITION`.
- `generateWorld` system → identity + `SETTING_CRAFT` + `PROSE_CRAFT` + existing
  cast rules.
- `generateOutline` system → existing + one line on act/pacing shape (rising tension
  across acts, distinct beat per chapter).
- `scribeChapter` → unchanged (pure distiller; no craft needed).

Net token impact per call is modest: each step gains only its relevant blocks.

### Deterministic dedup guard (`lib/versecraft/gen/dedupe.ts`, new)

A pure helper that strips near-duplicate nodes from AI chapter output (the fallback
writer already de-dups via `pickUnique`; AI output has no such guard).

- `dropDuplicateNodes(scenes: GenScene[]): GenScene[]`
- Walks all nodes across all scenes in order, tracking a `Set` of normalized texts.
- **Normalization:** lowercase, strip non-alphanumerics, collapse whitespace.
- Drops a node only when (a) it has **no `choices`** (choice nodes always kept — they
  drive progression) and (b) its normalized text exactly matches one already seen.
- Guarantees each scene keeps **≥1 node** (if all of a scene's nodes would be
  dropped, keep its first).
- Exact-normalized match (mirrors the fallback's exact de-dup) — deterministic and
  safe; no fuzzy similarity (YAGNI).

Called in `generateChapter` after assembling `scenes` (covering the continuation
case: the streamed opening scene's nodes seed the seen-set first), before the
chapter is returned/cached. Applies to the AI path only.

## File Surface

- `lib/versecraft/gen/craft.ts` — add `VN_FORMAT`, `PROSE_CRAFT`, `SETTING_CRAFT`,
  `CHOICE_CRAFT`, `ANTI_REPETITION`; keep `CRAFT_SYSTEM`/`craftDirectives`.
- `lib/versecraft/gen/dedupe.ts` — **new** `dropDuplicateNodes`.
- `lib/versecraft/gen/generate.server.ts` — compose blocks into the chapter and
  world prompts; add one outline line; call `dropDuplicateNodes` in `generateChapter`.
- `lib/versecraft/gen/__tests__/craft.test.ts` — extend with assertions per block.
- `lib/versecraft/gen/__tests__/dedupe.test.ts` — **new** unit tests.

## Testing

- **craft blocks:** each exported block names its key rules (string assertions,
  mirroring the existing `craft.test.ts`).
- **dedupe:** exact-duplicate non-choice nodes dropped; choice nodes never dropped;
  distinct nodes preserved; a scene whose nodes all duplicate retains its first node;
  normalization treats punctuation/case/whitespace differences as duplicates.
- AI output can't be unit-tested → otherwise verify via typecheck + lint, and confirm
  the existing fallback/gen tests still pass.
- Verify commands per repo conventions (`./node_modules/.bin/*`; `tsc` needs
  `node --stack-size=4000`).

## Risks

- **Prompt rules are advisory** — the model may still occasionally repeat; the code
  guard backstops literal within-chapter dupes but not paraphrases. Acceptable; this
  is a meaningful reduction, not a guarantee.
- **Over-aggressive dedup** — exact-normalized matching won't drop legitimately
  similar-but-distinct lines, and choice nodes are never dropped, so the risk of
  removing wanted content is low. The ≥1-node-per-scene guard prevents empty scenes.
