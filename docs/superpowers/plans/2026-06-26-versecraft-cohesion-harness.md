# VerseCraft Cohesion Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated VerseCraft stories cohere across chapters by feeding forward a Story Bible (hard constraints), a two-tier Arc Outline (planted setups/payoffs, revised at act boundaries), and a Running Ledger (what actually happened), and by making player choices reshape later chapter prose.

**Architecture:** Three new pure layers — Bible, Outline, Ledger — plus a scriptwriting craft module, assembled into every DeepSeek prompt. Choices are tracked as an ordered path and hashed into the chapter cache key so divergent choices produce divergent prose. The Bible and skeleton Outline are deterministic from the seed (shareable shell); Tier-2 outline detail and the ledger are per-player and ride in client game state, with each chapter's ledger entry persisted alongside its cached prose row.

**Tech Stack:** TypeScript, TanStack Start file routes, Zustand store, Prisma/Postgres, DeepSeek via the OpenAI SDK, Vitest (node environment).

## Global Constraints

- **No DOM test env.** `vitest.config.ts` uses `environment: 'node'`. React components are NOT unit-tested — put testable logic in pure `lib/` helpers; verify components/stores/routes via typecheck + lint only.
- **Run binaries directly** (pnpm wrappers are blocked): `./node_modules/.bin/vitest run <file>`, `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint <files>`, `./node_modules/.bin/vite build`.
- **Adding a file route** (`app/routes/**`) breaks `tsc` until `app/routeTree.gen.ts` regenerates — run `./node_modules/.bin/vite build` to regenerate, then commit the updated `routeTree.gen.ts`. Revert any incidental `pnpm-workspace.yaml` change.
- **Determinism:** the same seed must still reproduce the same world, cast, route, Story Bible, and skeleton Outline. Only chapter prose and the ledger may diverge by choice path.
- **Fallback safety:** every AI call must degrade to a deterministic, non-throwing result when `DEEPSEEK_API_KEY` is unset (`isVersecraftAIConfigured()` is false) or the call fails.
- **Tests live in** `lib/versecraft/gen/__tests__/**/*.test.ts` (glob added in Task 1).
- **Choice tones** are the existing `ChoiceTone` union: `'kind' | 'flirt' | 'guarded' | 'bold' | 'honest' | 'playful' | 'deep'`.

---

## File Structure

New files:
- `lib/versecraft/gen/choice-path.ts` — choice-path entry type + deterministic hash.
- `lib/versecraft/gen/outline.ts` — Arc Outline types' deterministic builders (skeleton + detail) + lookup.
- `lib/versecraft/gen/bible.ts` — Story Bible renderer.
- `lib/versecraft/gen/craft.ts` — scriptwriting craft system prompt + directives.
- `lib/versecraft/gen/ledger.ts` — ledger fallback entry, compaction, render.
- `app/routes/api/versecraft/outline.ts` — background outline generation/revision endpoint.
- `lib/versecraft/gen/__tests__/*.test.ts` — unit tests for the pure layers.

Modified files:
- `lib/versecraft/gen/world-types.ts` — add `ActPlan`, `ChapterBeat`, `ArcOutline`, `LedgerEntry`.
- `lib/versecraft/gen/generate.server.ts` — new prompt assembly; `generateOutline`, `scribeChapter`; new `generateChapter`/`generateChapterOpening` signatures.
- `lib/versecraft/gen/client.ts` — thread choice-path/ledger/beat; add `fetchOutline`.
- `app/routes/api/versecraft/chapter.ts` — choice-path cache key, ledger persistence, scribe.
- `prisma/schema.prisma` + a new migration — extend the chapter cache key, add `ledger` column.
- `lib/versecraft/store.ts` — choice-path/ledger/outline state; assembly; prefetch timing; act-boundary revision.
- `components/versecraft/GeneratedDialogueScreen.tsx` — prefetch on final scene, not on chapter load.
- `vitest.config.ts` — add the versecraft gen test glob.

---

## Task 1: Choice-path tracking + deterministic hash

**Files:**
- Create: `lib/versecraft/gen/choice-path.ts`
- Create: `lib/versecraft/gen/__tests__/choice-path.test.ts`
- Modify: `vitest.config.ts` (add test glob)

**Interfaces:**
- Consumes: `ChoiceTone` from `./world-types`.
- Produces:
  - `interface ChoicePathEntry { chapter: number; tone: ChoiceTone }`
  - `function choicePathHash(entries: ChoicePathEntry[]): string` — `''` for empty input; otherwise a short stable hex string. Order-sensitive.

- [ ] **Step 1: Add the test glob to `vitest.config.ts`**

In the `include` array, add the line (after `'lib/__tests__/**/*.test.ts',`):

```ts
      'lib/versecraft/gen/__tests__/**/*.test.ts',
```

- [ ] **Step 2: Write the failing test**

Create `lib/versecraft/gen/__tests__/choice-path.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { choicePathHash, type ChoicePathEntry } from '../choice-path';

describe('choicePathHash', () => {
  it('returns empty string for an empty path', () => {
    expect(choicePathHash([])).toBe('');
  });

  it('is deterministic for the same path', () => {
    const path: ChoicePathEntry[] = [
      { chapter: 0, tone: 'kind' },
      { chapter: 1, tone: 'bold' },
    ];
    expect(choicePathHash(path)).toBe(choicePathHash([...path]));
  });

  it('is order-sensitive', () => {
    const a: ChoicePathEntry[] = [{ chapter: 0, tone: 'kind' }, { chapter: 1, tone: 'bold' }];
    const b: ChoicePathEntry[] = [{ chapter: 1, tone: 'bold' }, { chapter: 0, tone: 'kind' }];
    expect(choicePathHash(a)).not.toBe(choicePathHash(b));
  });

  it('differs when a tone differs', () => {
    const a: ChoicePathEntry[] = [{ chapter: 0, tone: 'kind' }];
    const b: ChoicePathEntry[] = [{ chapter: 0, tone: 'guarded' }];
    expect(choicePathHash(a)).not.toBe(choicePathHash(b));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/choice-path.test.ts`
Expected: FAIL — cannot find module `../choice-path`.

- [ ] **Step 4: Write the implementation**

Create `lib/versecraft/gen/choice-path.ts`:

```ts
// ─── Choice Path ──────────────────────────────────────────────────────────────
// The ordered list of choices a player has committed, hashed into a short stable
// key. Chapter prose is cached per (seed, index, choicePathHash) so that players
// who make different choices get different — but individually reproducible —
// stories. An empty path hashes to '' so chapter 0 (no choices yet) stays shared
// across everyone on a seed.

import type { ChoiceTone } from './world-types';

export interface ChoicePathEntry {
  /** 0-based chapter the choice was made in. */
  chapter: number;
  /** The tone the player picked. */
  tone: ChoiceTone;
}

/** Deterministic, order-sensitive short hash of a choice path. */
export function choicePathHash(entries: ChoicePathEntry[]): string {
  if (!entries.length) return '';
  const serialized = entries.map((e) => `${e.chapter}:${e.tone}`).join('|');
  // FNV-1a 32-bit, rendered as hex — short and collision-resistant enough for
  // a per-player cache key.
  let h = 0x811c9dc5;
  for (let i = 0; i < serialized.length; i++) {
    h ^= serialized.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/choice-path.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/versecraft/gen/choice-path.ts lib/versecraft/gen/__tests__/choice-path.test.ts vitest.config.ts
git commit -m "feat(versecraft): deterministic choice-path hash for per-player chapter caching"
```

---

## Task 2: Arc Outline types + deterministic builders

**Files:**
- Modify: `lib/versecraft/gen/world-types.ts` (append new types)
- Create: `lib/versecraft/gen/outline.ts`
- Create: `lib/versecraft/gen/__tests__/outline.test.ts`

**Interfaces:**
- Consumes: `GeneratedWorld`, `RoutePlan`, `StoryBeat` from `./world-types`.
- Produces (in `world-types.ts`):
  - `interface ActPlan { act: number; goal: string; endpoint: string; focusArc: string }`
  - `interface ChapterBeat { index: number; act: number; dramaticQuestion: string; plant: string[]; payoff: string[]; intent: string }`
  - `interface ArcOutline { acts: ActPlan[]; chapters: ChapterBeat[]; source: 'ai' | 'fallback' }`
- Produces (in `outline.ts`):
  - `function buildSkeletonOutline(world: GeneratedWorld): ArcOutline` — `acts` filled from the route plan; `chapters` carry only act + a coarse `dramaticQuestion` (no plant/payoff). `source: 'fallback'`.
  - `function buildDetailedOutline(world: GeneratedWorld): ArcOutline` — deterministic Tier-2 detail: per-chapter `plant`/`payoff`/`intent` derived from the beat and cast. `source: 'fallback'`.
  - `function beatForChapter(outline: ArcOutline, index: number): ChapterBeat` — the beat for a 0-based chapter, clamped.

- [ ] **Step 1: Add the types to `world-types.ts`**

Append to the end of `lib/versecraft/gen/world-types.ts`:

```ts
// ─── Arc Outline & Ledger (cohesion harness) ──────────────────────────────────
// The showrunner layer. The skeleton (acts) is deterministic from the route plan
// and shareable; per-chapter detail (plant/payoff/intent) is enriched by AI and
// revised at act boundaries based on the player's path, so it is per-player.

export interface ActPlan {
  /** 1-based act number. */
  act: number;
  /** The dramatic goal the act pursues. */
  goal: string;
  /** The emotional endpoint the act must land on. */
  endpoint: string;
  /** Which character arc this act advances (character id, or a short label). */
  focusArc: string;
}

export interface ChapterBeat {
  /** 0-based chapter index. */
  index: number;
  act: number;
  /** The question this chapter raises or answers. */
  dramaticQuestion: string;
  /** Setups to plant in this chapter (paid off later). */
  plant: string[];
  /** Earlier setups this chapter pays off / calls back to. */
  payoff: string[];
  /** A one-line statement of what this chapter is for. */
  intent: string;
}

export interface ArcOutline {
  acts: ActPlan[];
  chapters: ChapterBeat[];
  source: 'ai' | 'fallback';
}

/** One distilled record of what actually happened in a chapter, fed forward to
 *  keep later chapters continuous. Per-player (depends on the choice path). */
export interface LedgerEntry {
  /** 0-based chapter index this entry summarizes. */
  index: number;
  /** One-paragraph recap of what happened. */
  summary: string;
  /** Facts/secrets revealed. */
  revealed: string[];
  /** Story threads opened. */
  threadsOpened: string[];
  /** Story threads resolved. */
  threadsClosed: string[];
  /** Relationship shifts ("MC grew closer to <name>"). */
  relationshipShifts: string[];
  /** New established facts that must stay true. */
  facts: string[];
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/versecraft/gen/__tests__/outline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fallbackWorld } from '../fallback';
import { buildSkeletonOutline, buildDetailedOutline, beatForChapter } from '../outline';

const world = fallbackWorld('ember-tide-hush-417', '');

describe('buildSkeletonOutline', () => {
  it('produces one ActPlan per act in the route plan', () => {
    const outline = buildSkeletonOutline(world);
    expect(outline.acts).toHaveLength(world.routePlan.actCount);
    expect(outline.acts.map((a) => a.act)).toEqual([1, 2, 3, 4, 5]);
    expect(outline.source).toBe('fallback');
  });

  it('produces one ChapterBeat per chapter, each tagged to a valid act', () => {
    const outline = buildSkeletonOutline(world);
    expect(outline.chapters).toHaveLength(world.routePlan.totalChapters);
    for (const beat of outline.chapters) {
      expect(beat.act).toBeGreaterThanOrEqual(1);
      expect(beat.act).toBeLessThanOrEqual(world.routePlan.actCount);
      expect(beat.dramaticQuestion.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a seed', () => {
    expect(buildSkeletonOutline(world)).toEqual(buildSkeletonOutline(fallbackWorld('ember-tide-hush-417', '')));
  });
});

describe('buildDetailedOutline', () => {
  it('fills plant/payoff/intent for every chapter', () => {
    const outline = buildDetailedOutline(world);
    expect(outline.chapters).toHaveLength(world.routePlan.totalChapters);
    for (const beat of outline.chapters) {
      expect(beat.intent.length).toBeGreaterThan(0);
      expect(Array.isArray(beat.plant)).toBe(true);
      expect(Array.isArray(beat.payoff)).toBe(true);
    }
  });
});

describe('beatForChapter', () => {
  it('returns the matching beat and clamps out-of-range indices', () => {
    const outline = buildDetailedOutline(world);
    expect(beatForChapter(outline, 0).index).toBe(0);
    expect(beatForChapter(outline, 999).index).toBe(world.routePlan.totalChapters - 1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/outline.test.ts`
Expected: FAIL — cannot find module `../outline`.

- [ ] **Step 4: Write the implementation**

Create `lib/versecraft/gen/outline.ts`:

```ts
// ─── Arc Outline builders ─────────────────────────────────────────────────────
// Deterministic Tier-1 (skeleton) and Tier-2 (detailed) outlines derived from the
// world's route plan. The AI generator (generate.server.ts) may replace the
// detailed version, but these fallbacks guarantee a coherent arc with no network.

import { Rng } from './rng';
import type { GeneratedWorld, ArcOutline, ActPlan, ChapterBeat, StoryBeat } from './world-types';

/** The act a 0-based chapter index belongs to, mirroring fallback.beatForIndex. */
function actForIndex(world: GeneratedWorld, index: number): { beat: StoryBeat; act: number } {
  const beats = world.routePlan.beats;
  const ratio = index / Math.max(1, world.routePlan.totalChapters);
  const beat = beats[Math.min(beats.length - 1, Math.floor(ratio * beats.length))];
  return { beat, act: beat.act };
}

/** Tier-1: one ActPlan per act + a coarse per-chapter beat (no plant/payoff). */
export function buildSkeletonOutline(world: GeneratedWorld): ArcOutline {
  const { actCount, beats } = world.routePlan;
  const acts: ActPlan[] = [];
  for (let act = 1; act <= actCount; act++) {
    const actBeats = beats.filter((b) => b.act === act);
    const goal = actBeats.map((b) => b.title).join(' → ') || `act ${act}`;
    const endpoint = actBeats[actBeats.length - 1]?.emotionalGoal ?? 'a turning point';
    const focusArc = actBeats[0]?.focus[0] ?? world.characters[0]?.id ?? 'the cast';
    acts.push({ act, goal, endpoint, focusArc });
  }
  const chapters: ChapterBeat[] = [];
  for (let index = 0; index < world.routePlan.totalChapters; index++) {
    const { beat, act } = actForIndex(world, index);
    chapters.push({
      index,
      act,
      dramaticQuestion: `Will this chapter land "${beat.emotionalGoal}"?`,
      plant: [],
      payoff: [],
      intent: beat.emotionalGoal,
    });
  }
  return { acts, chapters, source: 'fallback' };
}

/** Tier-2: deterministic plant/payoff/intent woven from the beat and cast, so a
 *  no-AI playthrough still has setups that recur and pay off. */
export function buildDetailedOutline(world: GeneratedWorld): ArcOutline {
  const skeleton = buildSkeletonOutline(world);
  const rng = new Rng(`outline|${world.seed}`);
  const motifs = world.motifs.length ? world.motifs : ['what remains'];
  const chapters = skeleton.chapters.map((beat) => {
    const { beat: storyBeat } = actForIndex(world, beat.index);
    const focusId = storyBeat.focus[0] ?? world.characters[0]?.id ?? 'the cast';
    const focus = world.characters.find((c) => c.id === focusId);
    const motif = motifs[beat.index % motifs.length];
    const plant = beat.act <= 3
      ? [`A small detail about ${focus?.name ?? 'the focus character'} tied to ${motif}.`]
      : [];
    const payoff = beat.act >= 3 && focus
      ? [`Pay off ${focus.name}'s ${focus.secret.replace(/^Secretly /, '').replace(/\.$/, '')}.`]
      : [];
    return {
      ...beat,
      dramaticQuestion: `What does ${focus?.name ?? 'the cast'} risk to reach "${storyBeat.emotionalGoal}"?`,
      plant,
      payoff,
      intent: `${storyBeat.emotionalGoal} — centered on ${focus?.name ?? 'the cast'}, returning to ${motif}.`,
    };
  });
  void rng;
  return { acts: skeleton.acts, chapters, source: 'fallback' };
}

/** The beat for a 0-based chapter index, clamped to the outline's range. */
export function beatForChapter(outline: ArcOutline, index: number): ChapterBeat {
  const clamped = Math.max(0, Math.min(outline.chapters.length - 1, index));
  return outline.chapters[clamped];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/outline.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck the new module**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/versecraft/gen/world-types.ts lib/versecraft/gen/outline.ts lib/versecraft/gen/__tests__/outline.test.ts
git commit -m "feat(versecraft): arc outline + ledger types and deterministic outline builders"
```

---

## Task 3: Story Bible renderer

**Files:**
- Create: `lib/versecraft/gen/bible.ts`
- Create: `lib/versecraft/gen/__tests__/bible.test.ts`

**Interfaces:**
- Consumes: `GeneratedWorld` from `./world-types`.
- Produces: `function renderBible(world: GeneratedWorld): string` — an authoritative constraint block listing every character's canonical id, name, pronouns, voice anchor, secret/fear, plus world facts, ending with an explicit name-lock instruction.

- [ ] **Step 1: Write the failing test**

Create `lib/versecraft/gen/__tests__/bible.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fallbackWorld } from '../fallback';
import { renderBible } from '../bible';

const world = fallbackWorld('ember-tide-hush-417', '');

describe('renderBible', () => {
  it('includes every character id and name', () => {
    const bible = renderBible(world);
    for (const c of world.characters) {
      expect(bible).toContain(c.id);
      expect(bible).toContain(c.name);
    }
  });

  it('states the name-lock constraint', () => {
    const bible = renderBible(world).toLowerCase();
    expect(bible).toContain('never rename');
  });

  it('includes the story title and setting', () => {
    const bible = renderBible(world);
    expect(bible).toContain(world.title);
    expect(bible).toContain(world.setting);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/bible.test.ts`
Expected: FAIL — cannot find module `../bible`.

- [ ] **Step 3: Write the implementation**

Create `lib/versecraft/gen/bible.ts`:

```ts
// ─── Story Bible ──────────────────────────────────────────────────────────────
// The authoritative, immutable fact sheet for a world, rendered as hard
// constraints injected at the top of every generation prompt. This is what stops
// the model renaming characters, drifting their voice, or contradicting facts.

import type { GeneratedWorld } from './world-types';

export function renderBible(world: GeneratedWorld): string {
  const cast = world.characters.map((c) =>
    `- id=${c.id} | NAME=${c.name} (${c.fullName}) | ${c.pronouns} | age ${c.age} | ` +
    `${c.archetype}, ${c.role}. Voice: ${c.speechStyle} Personality: ${c.personality} ` +
    `Secret: ${c.secret} Fear: ${c.fear} Dream: ${c.dream}`,
  ).join('\n');
  return (
    `STORY BIBLE (authoritative — these facts are FIXED):\n` +
    `TITLE: "${world.title}". PREMISE: ${world.premise}\n` +
    `SETTING: ${world.setting}\n` +
    `TONE: ${world.toneTags.join(', ')}. MOTIFS: ${world.motifs.join(', ')}.\n` +
    `PLAYER (MC): ${world.mc.name} (${world.mc.pronouns}) — ${world.mc.premise}\n` +
    `CAST (refer to characters ONLY by these exact names and ids):\n${cast}\n` +
    `ALLOWED environments: ${world.environments.join(', ')}.\n` +
    `RULES: Never rename a character. Never change a character's pronouns, age, or ` +
    `established secret/fear. Keep each character flawlessly in their established voice. ` +
    `Never contradict an established fact from the bible or the story-so-far.`
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/bible.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/versecraft/gen/bible.ts lib/versecraft/gen/__tests__/bible.test.ts
git commit -m "feat(versecraft): story bible renderer (hard cast/fact constraints)"
```

---

## Task 4: Scriptwriting craft module

**Files:**
- Create: `lib/versecraft/gen/craft.ts`
- Create: `lib/versecraft/gen/__tests__/craft.test.ts`

**Interfaces:**
- Produces:
  - `const CRAFT_SYSTEM: string` — the craft layer appended to the chapter system prompt.
  - `function craftDirectives(): string` — per-call user-side directives reminding the model of plant/payoff and choice-echo discipline.

- [ ] **Step 1: Write the failing test**

Create `lib/versecraft/gen/__tests__/craft.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CRAFT_SYSTEM, craftDirectives } from '../craft';

describe('craft module', () => {
  it('CRAFT_SYSTEM names the core craft rules', () => {
    const s = CRAFT_SYSTEM.toLowerCase();
    expect(s).toContain('goal');
    expect(s).toContain('subtext');
    expect(s).toContain('payoff');
  });

  it('craftDirectives reminds the model that choices must echo', () => {
    expect(craftDirectives().toLowerCase()).toContain('choice');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/craft.test.ts`
Expected: FAIL — cannot find module `../craft`.

- [ ] **Step 3: Write the implementation**

Create `lib/versecraft/gen/craft.ts`:

```ts
// ─── Scriptwriting Craft Module ───────────────────────────────────────────────
// The "scriptwriting skill" for DeepSeek: a reusable block of screenwriting craft
// injected on chapter generation so prose is dramatically shaped, not just
// continuous. Pairs with the bible (constraints) and outline (structure).

export const CRAFT_SYSTEM =
  'CRAFT RULES — write like a master visual-novel dramatist:\n' +
  '- Every scene has a GOAL, a CONFLICT, and a TURN; nothing is filler.\n' +
  '- Convey feeling through SUBTEXT, action, and specific sensory detail — never on-the-nose exposition.\n' +
  '- Keep each character in their established VOICE from the bible; let their secret/fear quietly drive them.\n' +
  '- PLANT and PAY OFF: honor the setups and payoffs the outline assigns this chapter; call back to earlier moments.\n' +
  '- The player\'s recent CHOICES must visibly echo — characters remember and react to what the player did.\n' +
  '- Earn every emotional beat; avoid melodrama, clichés, and tidy resolutions that the story has not paid for.';

export function craftDirectives(): string {
  return (
    'Honor this chapter\'s outline beat: plant its setups, deliver its payoffs, and answer/raise its dramatic question. ' +
    'Make the player\'s recent choices echo in how characters treat the MC.'
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/craft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/versecraft/gen/craft.ts lib/versecraft/gen/__tests__/craft.test.ts
git commit -m "feat(versecraft): scriptwriting craft module for chapter generation"
```

---

## Task 5: Ledger fallback, compaction, and render

**Files:**
- Create: `lib/versecraft/gen/ledger.ts`
- Create: `lib/versecraft/gen/__tests__/ledger.test.ts`

**Interfaces:**
- Consumes: `GeneratedWorld`, `GenChapter`, `LedgerEntry` from `./world-types`.
- Produces:
  - `function fallbackLedgerEntry(world: GeneratedWorld, chapter: GenChapter): LedgerEntry` — deterministic distillation when AI is unavailable.
  - `function compactLedger(entries: LedgerEntry[], recentKeep?: number): { digest: string; recent: LedgerEntry[] }` — `recentKeep` defaults to 4; older entries fold into a one-line-per-chapter `digest`, recent ones stay verbatim.
  - `function renderLedger(entries: LedgerEntry[]): string` — the "STORY SO FAR" block for the prompt (uses compaction internally).

- [ ] **Step 1: Write the failing test**

Create `lib/versecraft/gen/__tests__/ledger.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fallbackWorld, fallbackChapter } from '../fallback';
import { fallbackLedgerEntry, compactLedger, renderLedger } from '../ledger';
import type { LedgerEntry } from '../world-types';

const world = fallbackWorld('ember-tide-hush-417', '');

describe('fallbackLedgerEntry', () => {
  it('produces a well-formed entry for the chapter index', () => {
    const chapter = fallbackChapter(world, 0);
    const entry = fallbackLedgerEntry(world, chapter);
    expect(entry.index).toBe(0);
    expect(entry.summary.length).toBeGreaterThan(0);
    expect(Array.isArray(entry.facts)).toBe(true);
  });
});

describe('compactLedger', () => {
  it('keeps recent entries verbatim and digests the rest', () => {
    const entries: LedgerEntry[] = Array.from({ length: 7 }, (_, i) => ({
      index: i, summary: `Ch${i}`, revealed: [], threadsOpened: [], threadsClosed: [],
      relationshipShifts: [], facts: [],
    }));
    const { digest, recent } = compactLedger(entries, 4);
    expect(recent).toHaveLength(4);
    expect(recent.map((e) => e.index)).toEqual([3, 4, 5, 6]);
    expect(digest).toContain('Ch0');
    expect(digest).toContain('Ch2');
  });

  it('returns no digest when within the keep window', () => {
    const entries: LedgerEntry[] = [{ index: 0, summary: 'A', revealed: [], threadsOpened: [], threadsClosed: [], relationshipShifts: [], facts: [] }];
    const { digest, recent } = compactLedger(entries, 4);
    expect(digest).toBe('');
    expect(recent).toHaveLength(1);
  });
});

describe('renderLedger', () => {
  it('is empty for no entries', () => {
    expect(renderLedger([])).toBe('');
  });
  it('includes a STORY SO FAR header when entries exist', () => {
    const entry = fallbackLedgerEntry(world, fallbackChapter(world, 0));
    expect(renderLedger([entry])).toContain('STORY SO FAR');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/ledger.test.ts`
Expected: FAIL — cannot find module `../ledger`.

- [ ] **Step 3: Write the implementation**

Create `lib/versecraft/gen/ledger.ts`:

```ts
// ─── Running Ledger ───────────────────────────────────────────────────────────
// A compact, accumulating record of what actually happened, fed forward so later
// chapters stay continuous. Entries are produced by the AI scribe (see
// generate.server.ts) or by the deterministic fallback below.

import type { GeneratedWorld, GenChapter, LedgerEntry } from './world-types';

const RECENT_KEEP = 4;

/** Deterministic ledger entry from a chapter's own structure (no network). */
export function fallbackLedgerEntry(world: GeneratedWorld, chapter: GenChapter): LedgerEntry {
  const present = [...new Set(chapter.scenes.flatMap((s) => s.charactersPresent))];
  const names = present.map((id) => world.characters.find((c) => c.id === id)?.name).filter(Boolean);
  return {
    index: chapter.index,
    summary: `Chapter ${chapter.index + 1} "${chapter.title}": ${chapter.emotionalGoal}. ` +
      `Featured ${names.join(', ') || 'the cast'}.`,
    revealed: [],
    threadsOpened: [],
    threadsClosed: [],
    relationshipShifts: names.map((n) => `Time spent with ${n}.`),
    facts: [`Chapter ${chapter.index + 1} reached "${chapter.emotionalGoal}".`],
  };
}

/** Split a ledger into a digested prefix + recent verbatim entries. */
export function compactLedger(
  entries: LedgerEntry[], recentKeep = RECENT_KEEP,
): { digest: string; recent: LedgerEntry[] } {
  if (entries.length <= recentKeep) return { digest: '', recent: entries };
  const older = entries.slice(0, entries.length - recentKeep);
  const recent = entries.slice(entries.length - recentKeep);
  const digest = older.map((e) => `Ch${e.index + 1}: ${e.summary}`).join(' ');
  return { digest, recent };
}

/** Render the accumulated ledger as a prompt block. Empty string when no history. */
export function renderLedger(entries: LedgerEntry[]): string {
  if (!entries.length) return '';
  const { digest, recent } = compactLedger(entries);
  const recentText = recent.map((e) => {
    const parts = [
      `Ch${e.index + 1}: ${e.summary}`,
      e.revealed.length ? `Revealed: ${e.revealed.join('; ')}.` : '',
      e.threadsOpened.length ? `Open threads: ${e.threadsOpened.join('; ')}.` : '',
      e.threadsClosed.length ? `Closed: ${e.threadsClosed.join('; ')}.` : '',
      e.relationshipShifts.length ? `Relationships: ${e.relationshipShifts.join('; ')}.` : '',
      e.facts.length ? `Facts: ${e.facts.join('; ')}.` : '',
    ].filter(Boolean);
    return parts.join(' ');
  }).join('\n');
  return `STORY SO FAR (honor this continuity — do not contradict it):\n` +
    (digest ? `Earlier: ${digest}\n` : '') + recentText;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/versecraft/gen/ledger.ts lib/versecraft/gen/__tests__/ledger.test.ts
git commit -m "feat(versecraft): running ledger fallback, compaction, and render"
```

---

## Task 6: Server prompt assembly, outline generation, and scribe

**Files:**
- Modify: `lib/versecraft/gen/generate.server.ts`
- Create: `lib/versecraft/gen/__tests__/generate-fallback.test.ts`

**Interfaces:**
- Consumes: `renderBible` (`./bible`), `CRAFT_SYSTEM`/`craftDirectives` (`./craft`), `renderLedger` (`./ledger`), `buildSkeletonOutline`/`buildDetailedOutline`/`beatForChapter` (`./outline`), `fallbackLedgerEntry` (`./ledger`), and the new types from `./world-types`.
- Produces:
  - `function buildChapterContext(world: GeneratedWorld, beat: ChapterBeat | undefined, ledger: LedgerEntry[]): string` — bible + outline-beat + ledger, replacing `worldContext`.
  - `async function generateOutline(world: GeneratedWorld, ledger?: LedgerEntry[], fromAct?: number): Promise<ArcOutline>` — AI Tier-2 detail (or revision from `fromAct`), falling back to `buildDetailedOutline`.
  - `async function scribeChapter(world: GeneratedWorld, chapter: GenChapter): Promise<LedgerEntry>` — AI distillation, falling back to `fallbackLedgerEntry`.
  - New `generateChapter(world, index, opts: { beat?: ChapterBeat; ledger?: LedgerEntry[]; opening?: GenScene | null }): Promise<GenChapter>`.
  - New `generateChapterOpening(world, index, opts: { beat?: ChapterBeat; ledger?: LedgerEntry[] }): Promise<GenChapter | null>`.

- [ ] **Step 1: Update imports in `generate.server.ts`**

Replace the existing import block (lines 11–18) with:

```ts
import OpenAI from 'openai';
import { z } from 'zod';
import { fallbackWorld, fallbackChapter } from './fallback';
import { renderBible } from './bible';
import { CRAFT_SYSTEM, craftDirectives } from './craft';
import { renderLedger, fallbackLedgerEntry } from './ledger';
import { buildDetailedOutline, beatForChapter } from './outline';
import {
  EMOTIONS, ENVIRONMENTS, normalizeEmotion, WORLD_SCHEMA_VERSION,
  type GeneratedWorld, type GenChapter, type GenNode, type GenScene,
  type Pronouns, type Environment, type TimeOfDay, type ChoiceTone,
  type ArcOutline, type ChapterBeat, type LedgerEntry,
} from './world-types';
```

- [ ] **Step 2: Replace `worldContext` with `buildChapterContext`**

Replace the `worldContext` function (lines 181–190) with:

```ts
/** The full context block for a chapter prompt: bible (hard constraints) +
 *  this chapter's outline beat + the running ledger. */
function buildChapterContext(world: GeneratedWorld, beat: ChapterBeat | undefined, ledger: LedgerEntry[]): string {
  const beatBlock = beat
    ? `THIS CHAPTER'S BEAT (act ${beat.act}): ${beat.intent}\n` +
      `Dramatic question: ${beat.dramaticQuestion}\n` +
      (beat.plant.length ? `PLANT (set up, pay off later): ${beat.plant.join('; ')}\n` : '') +
      (beat.payoff.length ? `PAY OFF NOW (callbacks): ${beat.payoff.join('; ')}\n` : '')
    : '';
  const ledgerBlock = renderLedger(ledger);
  return `${renderBible(world)}\n${beatBlock}${ledgerBlock ? ledgerBlock + '\n' : ''}`;
}
```

- [ ] **Step 3: Fold the craft module into the chapter system prompt**

In `chapterSystemPrompt` (lines 165–179), change the final `return (` expression so the craft block is appended before the JSON instruction. Replace the line:

```ts
    'Respond ONLY with a JSON object.'
```

inside `chapterSystemPrompt` with:

```ts
    CRAFT_SYSTEM + '\n' +
    'Respond ONLY with a JSON object.'
```

- [ ] **Step 4: Update `generateChapterOpening` to the new signature**

Replace `generateChapterOpening` (lines 229–261) with:

```ts
export async function generateChapterOpening(
  world: GeneratedWorld, index: number,
  opts: { beat?: ChapterBeat; ledger?: LedgerEntry[] } = {},
): Promise<GenChapter | null> {
  if (!isVersecraftAIConfigured()) return null;
  const routeBeat = beatFor(world, index);
  const ids = new Set(world.characters.map((c) => c.id));
  try {
    const user = buildChapterContext(world, opts.beat, opts.ledger ?? []) +
      `\n${craftDirectives()}\n` +
      `\nWrite ONLY the OPENING SCENE of CHAPTER ${index + 1} (Act ${routeBeat.act}). Emotional goal of the chapter: ` +
      `"${routeBeat.emotionalGoal}". Open on these characters: ${routeBeat.focus.join(', ')}.\n` +
      `- One scene: an environment from the allowed list, charactersPresent (ids), 9–13 nodes.\n` +
      `- Hook the player emotionally and end the scene on a small beat of tension or warmth.\n` +
      `- Include exactly ONE "choices" node (2–3 options) where ${world.mc.name} responds; each option has a "tone" ` +
      `from (${TONES.join(', ')}) and may set "affinity" (character id → small +integer).\n` +
      `Also give the chapter a short "title".\n` +
      `Return JSON: {"title","scenes":[{"environment","timeOfDay","charactersPresent":[ids],"nodes":[{"speaker":id|null,"text","emotion","choices?":[{"text","tone","affinity"}]}]}]}.`;
    const parsed = ChapterSchema.parse(await chatJson(chapterSystemPrompt(), user, 2200));
    const raw = parsed.scenes[0];
    if (!raw) return null;
    let seq = 0;
    const scene = sanitizeScene(raw, world, index, 0, ids, () => `ch${index}_n${seq++}`);
    return {
      index, act: routeBeat.act,
      title: parsed.title || routeBeat.title,
      subtitle: `Act ${routeBeat.act} — ${world.title}`,
      emotionalGoal: routeBeat.emotionalGoal,
      scenes: [scene],
      source: 'ai',
      partial: true,
    };
  } catch (err) {
    console.error('generateChapterOpening failed:', err);
    return null;
  }
}
```

- [ ] **Step 5: Update `generateChapter` to the new signature**

Replace `generateChapter` (lines 263–308) with:

```ts
export async function generateChapter(
  world: GeneratedWorld, index: number,
  opts: { beat?: ChapterBeat; ledger?: LedgerEntry[]; opening?: GenScene | null } = {},
): Promise<GenChapter> {
  if (!isVersecraftAIConfigured()) return fallbackChapter(world, index);

  const routeBeat = beatFor(world, index);
  const ids = new Set(world.characters.map((c) => c.id));
  const opening = opts.opening ?? null;

  try {
    const continuing = !!opening;
    const user = buildChapterContext(world, opts.beat, opts.ledger ?? []) +
      `\n${craftDirectives()}\n` +
      (continuing
        ? `\nThe opening scene of CHAPTER ${index + 1} (Act ${routeBeat.act}) has already been written:\n"${sceneDigest(opening!)}"\n` +
          `CONTINUE this chapter with 2–3 MORE scenes that carry the emotional goal "${routeBeat.emotionalGoal}" to a ` +
          `resolution (complication → turn → landing). Do NOT repeat the opening scene.\n` +
          `- Each scene: an environment from the allowed list, charactersPresent (ids), 12–18 nodes.\n` +
          `- Include exactly ONE "choices" node across these scenes.\n`
        : `\nWrite CHAPTER ${index + 1} (Act ${routeBeat.act}). Emotional goal: "${routeBeat.emotionalGoal}". Center on: ${routeBeat.focus.join(', ')}.\n` +
          `- 3–4 scenes. Each scene: an environment from the allowed list, charactersPresent (ids), 12–18 nodes.\n` +
          `- Clear emotional arc (setup → complication → turn → resolution that lands the goal).\n` +
          `- Include 2 "choices" nodes total.\n`) +
      `- Rich, specific dialogue and evocative narration; vary line length; let characters DO things.\n` +
      `- Choice options carry a "tone" from (${TONES.join(', ')}) and may set "affinity" (character id → small +integer 1–6).\n` +
      `Return JSON: {"title","scenes":[{"environment","timeOfDay","charactersPresent":[ids],"nodes":[{"speaker":id|null,"text","emotion","choices?":[{"text","tone","affinity"}]}]}]}.`;

    const parsed = ChapterSchema.parse(await chatJson(chapterSystemPrompt(), user, continuing ? 5500 : 7000));
    const startScene = continuing ? 1 : 0;
    let seq = continuing ? (opening!.nodes.length) : 0;
    const nid = () => `ch${index}_n${seq++}`;
    const rest = parsed.scenes.map((sc, i) => sanitizeScene(sc, world, index, startScene + i, ids, nid));
    const scenes = continuing ? [opening!, ...rest] : rest;

    if (!scenes.length) return fallbackChapter(world, index);
    return {
      index, act: routeBeat.act,
      title: parsed.title || routeBeat.title,
      subtitle: parsed.subtitle || `Act ${routeBeat.act} — ${world.title}`,
      emotionalGoal: routeBeat.emotionalGoal,
      scenes,
      source: 'ai',
    };
  } catch (err) {
    console.error('generateChapter AI failed, using fallback:', err);
    return fallbackChapter(world, index);
  }
}
```

- [ ] **Step 6: Add `generateOutline` and `scribeChapter` at the end of the file**

Append to `lib/versecraft/gen/generate.server.ts`:

```ts
// ─── Outline (showrunner) ─────────────────────────────────────────────────────

const OutlineSchema = z.object({
  chapters: z.array(z.object({
    index: z.number(),
    dramaticQuestion: z.string().default(''),
    plant: z.array(z.string()).default([]),
    payoff: z.array(z.string()).default([]),
    intent: z.string().default(''),
  })).default([]),
});

/** Generate (or, with fromAct, revise) the detailed Tier-2 outline. Falls back
 *  to the deterministic detailed outline when AI is unavailable or fails. */
export async function generateOutline(
  world: GeneratedWorld, ledger: LedgerEntry[] = [], fromAct = 1,
): Promise<ArcOutline> {
  const base = buildDetailedOutline(world);
  if (!isVersecraftAIConfigured()) return base;
  try {
    const acts = base.acts.map((a) => `Act ${a.act}: goal=${a.goal}; endpoint=${a.endpoint}; focus=${a.focusArc}`).join('\n');
    const toPlan = base.chapters.filter((c) => c.act >= fromAct);
    const system =
      'You are the showrunner for an emotional anime visual novel. You design a tight dramatic arc with setups ' +
      'planted early and paid off later, one beat per chapter. Respond ONLY with a JSON object.';
    const user = `${renderBible(world)}\nACT PLAN:\n${acts}\n` +
      (ledger.length ? `${renderLedger(ledger)}\n` : '') +
      `Plan chapters ${toPlan[0]?.index ?? 0}..${toPlan[toPlan.length - 1]?.index ?? 0} (0-based). ` +
      `Honor the act endpoints and any open threads above. For each chapter give a dramaticQuestion, ` +
      `plant (setups), payoff (callbacks to earlier setups), and a one-line intent.\n` +
      `Return JSON: {"chapters":[{"index","dramaticQuestion","plant":[],"payoff":[],"intent"}]}.`;
    const parsed = OutlineSchema.parse(await chatJson(system, user, 3000));
    const byIndex = new Map(parsed.chapters.map((c) => [c.index, c]));
    const chapters = base.chapters.map((c) => {
      const ai = byIndex.get(c.index);
      if (!ai || c.act < fromAct) return c;
      return {
        ...c,
        dramaticQuestion: ai.dramaticQuestion || c.dramaticQuestion,
        plant: ai.plant.length ? ai.plant : c.plant,
        payoff: ai.payoff.length ? ai.payoff : c.payoff,
        intent: ai.intent || c.intent,
      };
    });
    return { acts: base.acts, chapters, source: 'ai' };
  } catch (err) {
    console.error('generateOutline AI failed, using deterministic detail:', err);
    return base;
  }
}

// ─── Scribe (ledger distillation) ─────────────────────────────────────────────

const ScribeSchema = z.object({
  summary: z.string().default(''),
  revealed: z.array(z.string()).default([]),
  threadsOpened: z.array(z.string()).default([]),
  threadsClosed: z.array(z.string()).default([]),
  relationshipShifts: z.array(z.string()).default([]),
  facts: z.array(z.string()).default([]),
});

/** Distill a finished chapter into a ledger entry. Falls back to the
 *  deterministic entry when AI is unavailable or fails. */
export async function scribeChapter(world: GeneratedWorld, chapter: GenChapter): Promise<LedgerEntry> {
  const base = fallbackLedgerEntry(world, chapter);
  if (!isVersecraftAIConfigured()) return base;
  try {
    const prose = chapter.scenes
      .flatMap((s) => s.nodes.map((n) => (n.speaker ? `${n.speaker}: ` : '') + n.text))
      .join('\n').slice(0, 6000);
    const system =
      'You are a story continuity editor. Read a finished chapter and distill ONLY what actually happened, ' +
      'so later chapters stay consistent. Be concise and factual. Respond ONLY with a JSON object.';
    const user = `${renderBible(world)}\nCHAPTER ${chapter.index + 1} TEXT:\n${prose}\n` +
      `Return JSON: {"summary","revealed":[],"threadsOpened":[],"threadsClosed":[],"relationshipShifts":[],"facts":[]}. ` +
      `summary = one paragraph; the arrays = short bullet phrases (use character names from the bible).`;
    const parsed = ScribeSchema.parse(await chatJson(system, user, 700));
    return {
      index: chapter.index,
      summary: parsed.summary || base.summary,
      revealed: parsed.revealed,
      threadsOpened: parsed.threadsOpened,
      threadsClosed: parsed.threadsClosed,
      relationshipShifts: parsed.relationshipShifts.length ? parsed.relationshipShifts : base.relationshipShifts,
      facts: parsed.facts.length ? parsed.facts : base.facts,
    };
  } catch (err) {
    console.error('scribeChapter AI failed, using fallback entry:', err);
    return base;
  }
}
```

- [ ] **Step 7: Write the fallback-path test**

Create `lib/versecraft/gen/__tests__/generate-fallback.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fallbackWorld, fallbackChapter } from '../fallback';
import { generateOutline, scribeChapter } from '../generate.server';

const world = fallbackWorld('ember-tide-hush-417', '');
const hadKey = process.env.DEEPSEEK_API_KEY;

beforeAll(() => { delete process.env.DEEPSEEK_API_KEY; });
afterAll(() => { if (hadKey !== undefined) process.env.DEEPSEEK_API_KEY = hadKey; });

describe('generateOutline (no AI)', () => {
  it('returns a deterministic detailed outline', async () => {
    const outline = await generateOutline(world);
    expect(outline.source).toBe('fallback');
    expect(outline.chapters).toHaveLength(world.routePlan.totalChapters);
    expect(outline.chapters[0].intent.length).toBeGreaterThan(0);
  });
});

describe('scribeChapter (no AI)', () => {
  it('returns a well-formed fallback ledger entry', async () => {
    const entry = await scribeChapter(world, fallbackChapter(world, 0));
    expect(entry.index).toBe(0);
    expect(entry.summary.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/generate-fallback.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck (signatures changed — callers in Task 8 will be updated next)**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -E "generate.server|chapter.ts|world.ts" || echo "no errors in generate/world/chapter (expected after Task 8)"`
Expected: errors only in `app/routes/api/versecraft/chapter.ts` and `world.ts` (old call sites) — these are fixed in Task 8. No errors inside `generate.server.ts` itself.

- [ ] **Step 10: Commit**

```bash
git add lib/versecraft/gen/generate.server.ts lib/versecraft/gen/__tests__/generate-fallback.test.ts
git commit -m "feat(versecraft): bible+outline+ledger+craft prompt assembly, generateOutline, scribeChapter"
```

---

## Task 7: Prisma — choice-path cache key + ledger column

**Files:**
- Modify: `prisma/schema.prisma` (lines 1029–1040, `VersecraftGenChapter`)
- Create: `prisma/migrations/<timestamp>_versecraft_choicepath_ledger/migration.sql`

**Interfaces:**
- Produces: `VersecraftGenChapter` keyed by `@@unique([seed, index, choicePathHash])` with a new `choicePathHash String @default("")` and `ledger Json?` column.

- [ ] **Step 1: Update the Prisma model**

Replace the `VersecraftGenChapter` model (lines 1027–1040) with:

```prisma
// A generated chapter cached per (seed, index, choicePathHash) so each player's
// choice-divergent prose is reproducible, and the DeepSeek call for a given
// (seed, index, path) happens at most once. `ledger` holds the scribe's
// distillation of this chapter, persisted alongside the prose.
model VersecraftGenChapter {
  id            String  @id @default(cuid())
  seed          String
  index         Int
  choicePathHash String @default("")
  source        String  @default("fallback")
  content       Json
  ledger        Json?

  world VersecraftWorld @relation(fields: [seed], references: [seed], onDelete: Cascade)

  @@unique([seed, index, choicePathHash])
  @@map("versecraft_gen_chapter")
}
```

- [ ] **Step 2: Create the migration SQL**

Create `prisma/migrations/20260626120000_versecraft_choicepath_ledger/migration.sql`:

```sql
-- Add choice-path-aware caching + ledger storage to generated chapters.
ALTER TABLE "versecraft_gen_chapter"
  ADD COLUMN "choicePathHash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "ledger" JSONB;

-- Replace the (seed, index) unique with (seed, index, choicePathHash).
DROP INDEX IF EXISTS "versecraft_gen_chapter_seed_index_key";
CREATE UNIQUE INDEX "versecraft_gen_chapter_seed_index_choicePathHash_key"
  ON "versecraft_gen_chapter" ("seed", "index", "choicePathHash");
```

- [ ] **Step 3: Validate the schema and regenerate the client**

Run: `./node_modules/.bin/prisma validate && ./node_modules/.bin/prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and the client regenerates without error.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260626120000_versecraft_choicepath_ledger
git commit -m "feat(versecraft): cache chapters per choice path; persist ledger per chapter"
```

---

## Task 8: API routes — chapter (choice-path + scribe) and outline endpoint

**Files:**
- Modify: `app/routes/api/versecraft/chapter.ts`
- Modify: `app/routes/api/versecraft/world.ts`
- Create: `app/routes/api/versecraft/outline.ts`

**Interfaces:**
- Consumes: new `generateChapter`/`generateChapterOpening` signatures, `scribeChapter`, `generateOutline` from `generate.server`; `ChapterBeat`, `LedgerEntry`, `ArcOutline` types; `choicePathHash` is supplied pre-computed by the client as a string.
- Produces:
  - `POST /api/versecraft/chapter` body: `{ seed, index, choicePathHash?, beat?, ledger?, part?, opening? }`; response: `{ chapter, ledgerEntry?, partial, cached? }`.
  - `POST /api/versecraft/outline` body: `{ seed, ledger?, fromAct? }`; response: `{ outline }`.

- [ ] **Step 1: Rewrite `app/routes/api/versecraft/chapter.ts`**

Replace the entire file with:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateChapter, generateChapterOpening, scribeChapter } from '@/lib/versecraft/gen/generate.server';
import { normalizeSeed } from '@/lib/versecraft/gen/rng';
import type { GeneratedWorld, GenScene, GenChapter, ChapterBeat, LedgerEntry } from '@/lib/versecraft/gen/world-types';

/**
 * Seed + index + choicePathHash → generated chapter, cached per that triple so a
 * player's choice-divergent prose is reproducible. The chapter's ledger entry
 * (scribe distillation) is generated once and persisted alongside the prose, and
 * returned so the client can feed it forward.
 *
 * With `part: 'opening'` it returns just the opening scene (fast, NOT cached);
 * the client then calls again with the `opening` scene to generate + cache the
 * full chapter.
 */
export const Route = createFileRoute('/api/versecraft/chapter')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 40, windowMs: 60_000, prefix: 'versecraft-chapter' });
        if (!allowed) {
          return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
        }

        let body: {
          seed?: string; index?: number; choicePathHash?: string;
          beat?: ChapterBeat; ledger?: LedgerEntry[]; part?: string; opening?: GenScene;
        };
        try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

        const seed = normalizeSeed(body.seed ?? '');
        const index = Math.max(0, Math.min(200, Math.floor(body.index ?? 0)));
        if (!seed) return Response.json({ error: 'Missing seed' }, { status: 400 });
        const choicePathHash = (body.choicePathHash ?? '').slice(0, 16);
        const beat = body.beat;
        const ledger = Array.isArray(body.ledger) ? body.ledger.slice(0, 30) : [];

        // A cached full chapter for this exact path always wins.
        const cached = await prisma.versecraftGenChapter.findUnique({
          where: { seed_index_choicePathHash: { seed, index, choicePathHash } },
        });
        if (cached) {
          return Response.json({ chapter: cached.content, ledgerEntry: cached.ledger ?? null, partial: false, cached: true });
        }

        const worldRow = await prisma.versecraftWorld.findUnique({ where: { seed } });
        if (!worldRow) return Response.json({ error: 'Unknown seed — create the world first' }, { status: 404 });
        const world = worldRow.world as unknown as GeneratedWorld;

        // Fast first paint: just the opening scene (not persisted).
        if (body.part === 'opening') {
          const opening = await generateChapterOpening(world, index, { beat, ledger });
          if (opening) return Response.json({ chapter: opening, partial: true });
          const full = await generateChapter(world, index, { beat, ledger });
          const ledgerEntry = await scribeChapter(world, full);
          await persistChapter(seed, index, choicePathHash, full, ledgerEntry);
          return Response.json({ chapter: full, ledgerEntry, partial: false });
        }

        // Full chapter (optionally continuing from a streamed opening scene).
        const chapter = await generateChapter(world, index, { beat, ledger, opening: body.opening ?? null });
        const ledgerEntry = await scribeChapter(world, chapter);
        await persistChapter(seed, index, choicePathHash, chapter, ledgerEntry);
        return Response.json({ chapter, ledgerEntry, partial: false });
      },
    },
  },
});

async function persistChapter(
  seed: string, index: number, choicePathHash: string, chapter: GenChapter, ledgerEntry: LedgerEntry,
): Promise<void> {
  await prisma.versecraftGenChapter.upsert({
    where: { seed_index_choicePathHash: { seed, index, choicePathHash } },
    create: { seed, index, choicePathHash, source: chapter.source, content: chapter as unknown as object, ledger: ledgerEntry as unknown as object },
    update: {},
  });
}
```

- [ ] **Step 2: Update `openingFor` in `world.ts` to the new opening signature**

In `app/routes/api/versecraft/world.ts`, replace the `openingFor` helper (lines 11–16) with:

```ts
async function openingFor(world: GeneratedWorld, seed: string) {
  const cached = await prisma.versecraftGenChapter.findUnique({
    where: { seed_index_choicePathHash: { seed, index: 0, choicePathHash: '' } },
  });
  if (cached) return { chapter: cached.content as unknown as GenChapter, partial: false };
  const opening = await generateChapterOpening(world, 0, {});
  return opening ? { chapter: opening, partial: true } : null;
}
```

- [ ] **Step 3: Create the outline endpoint**

Create `app/routes/api/versecraft/outline.ts`:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generateOutline } from '@/lib/versecraft/gen/generate.server';
import { normalizeSeed } from '@/lib/versecraft/gen/rng';
import type { GeneratedWorld, LedgerEntry } from '@/lib/versecraft/gen/world-types';

/**
 * Seed (+ optional ledger, fromAct) → detailed Arc Outline. Used for the
 * background Tier-2 enrich after world creation and for act-boundary revisions.
 * Not persisted server-side: the skeleton is deterministic and the detail is
 * per-player, so the client holds it in game state.
 */
export const Route = createFileRoute('/api/versecraft/outline')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'versecraft-outline' });
        if (!allowed) {
          return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
        }

        let body: { seed?: string; ledger?: LedgerEntry[]; fromAct?: number };
        try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

        const seed = normalizeSeed(body.seed ?? '');
        if (!seed) return Response.json({ error: 'Missing seed' }, { status: 400 });
        const ledger = Array.isArray(body.ledger) ? body.ledger.slice(0, 30) : [];
        const fromAct = Math.max(1, Math.min(5, Math.floor(body.fromAct ?? 1)));

        const worldRow = await prisma.versecraftWorld.findUnique({ where: { seed } });
        if (!worldRow) return Response.json({ error: 'Unknown seed — create the world first' }, { status: 404 });
        const world = worldRow.world as unknown as GeneratedWorld;

        const outline = await generateOutline(world, ledger, fromAct);
        return Response.json({ outline });
      },
    },
  },
});
```

- [ ] **Step 4: Regenerate the route tree and typecheck**

Run: `./node_modules/.bin/vite build`
Then: `./node_modules/.bin/tsc --noEmit`
Expected: `app/routeTree.gen.ts` updates to include `/api/versecraft/outline`; tsc reports no errors. (If `pnpm-workspace.yaml` changed, revert it: `git checkout pnpm-workspace.yaml`.)

- [ ] **Step 5: Lint the changed routes**

Run: `./node_modules/.bin/eslint app/routes/api/versecraft/chapter.ts app/routes/api/versecraft/world.ts app/routes/api/versecraft/outline.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/routes/api/versecraft/chapter.ts app/routes/api/versecraft/world.ts app/routes/api/versecraft/outline.ts app/routeTree.gen.ts
git commit -m "feat(versecraft): choice-path chapter cache + scribe persistence + outline endpoint"
```

---

## Task 9: Generation client — thread choice-path/ledger/beat + fetchOutline

**Files:**
- Modify: `lib/versecraft/gen/client.ts`

**Interfaces:**
- Consumes: the new chapter/outline endpoint contracts.
- Produces:
  - `fetchChapter(seed, index, opts: { choicePathHash: string; beat?: ChapterBeat; ledger?: LedgerEntry[]; opening?: GenScene }): Promise<{ chapter: GenChapter; ledgerEntry: LedgerEntry | null } | null>`
  - `fetchOutline(seed, ledger?: LedgerEntry[], fromAct?: number): Promise<ArcOutline | null>`
  - `createWorldWithOpening` unchanged in signature.

- [ ] **Step 1: Update imports in `client.ts`**

Replace the import line (line 7) with:

```ts
import type { GeneratedWorld, GenChapter, GenScene, Pronouns, ChapterBeat, LedgerEntry, ArcOutline } from './world-types';
```

- [ ] **Step 2: Replace `fetchChapter` and remove the unused `fetchOpeningChapter`**

Replace `fetchChapter` (lines 44–60) and `fetchOpeningChapter` (lines 62–80) with:

```ts
/** Fetch the full chapter for a specific choice path (optionally continuing from
 *  a streamed opening scene). Returns the chapter plus its ledger entry. */
export async function fetchChapter(
  seed: string, index: number,
  opts: { choicePathHash: string; beat?: ChapterBeat; ledger?: LedgerEntry[]; opening?: GenScene },
): Promise<{ chapter: GenChapter; ledgerEntry: LedgerEntry | null } | null> {
  try {
    const res = await fetch('/api/versecraft/chapter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed, index,
        choicePathHash: opts.choicePathHash,
        beat: opts.beat,
        ledger: opts.ledger ?? [],
        opening: opts.opening,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { chapter: GenChapter | null; ledgerEntry?: LedgerEntry | null };
    return validChapter(data.chapter) ? { chapter: data.chapter, ledgerEntry: data.ledgerEntry ?? null } : null;
  } catch {
    return null;
  }
}

/** Fetch the detailed Arc Outline (Tier-2 enrich, or act-boundary revision). */
export async function fetchOutline(
  seed: string, ledger: LedgerEntry[] = [], fromAct = 1,
): Promise<ArcOutline | null> {
  try {
    const res = await fetch('/api/versecraft/outline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, ledger, fromAct }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { outline: ArcOutline | null };
    return data.outline && Array.isArray(data.outline.chapters) ? data.outline : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Typecheck (store call sites updated next in Task 10)**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -E "client.ts|store.ts" || echo "errors only in store.ts (expected, fixed in Task 10)"`
Expected: no errors inside `client.ts`; remaining errors only in `store.ts` (old `fetchChapter` call sites).

- [ ] **Step 4: Commit**

```bash
git add lib/versecraft/gen/client.ts
git commit -m "feat(versecraft): client threads choice-path/ledger/beat; add fetchOutline"
```

---

## Task 10: Store — choice-path/ledger/outline state, assembly, prefetch timing, act revisions

**Files:**
- Modify: `lib/versecraft/store.ts`
- Modify: `lib/versecraft/types.ts` (extend `GameState` with the new generated fields)

**Interfaces:**
- Consumes: `choicePathHash`/`ChoicePathEntry` (`./gen/choice-path`), `buildSkeletonOutline`/`beatForChapter` (`./gen/outline`), `fetchChapter`/`fetchOutline` (`./gen/client`), `ArcOutline`/`LedgerEntry` types.
- Produces: store state `choicePath: ChoicePathEntry[]`, `ledger: LedgerEntry[]`, `outline: ArcOutline | null`; `genApplyChoice` appends to `choicePath`; chapter fetches pass `{ choicePathHash, beat, ledger }` and absorb returned `ledgerEntry`; `prefetchChapter` uses the current path; act-boundary revision via `fetchOutline`.

- [ ] **Step 1: Extend `GameState` in `lib/versecraft/types.ts`**

Find the `GameState` interface in `lib/versecraft/types.ts` (it already contains `seed`, `world`, `generatedChapters`, `currentChapterIndex`, `genChoiceLog`). Add these three fields next to `genChoiceLog`:

```ts
  /** Ordered committed choices, hashed into the chapter cache key. */
  choicePath: ChoicePathEntry[];
  /** Accumulated per-chapter ledger entries (continuity memory). */
  ledger: LedgerEntry[];
  /** Detailed arc outline (skeleton synchronously, Tier-2 enriched in background). */
  outline: ArcOutline | null;
```

At the top of `lib/versecraft/types.ts`, add the imports (place near the other type imports):

```ts
import type { ChoicePathEntry } from './gen/choice-path';
import type { LedgerEntry, ArcOutline } from './gen/world-types';
```

- [ ] **Step 2: Update imports and `createInitialState` in `store.ts`**

Replace the store import block (lines 12–17) with:

```ts
import { fallbackWorld, fallbackChapter } from './gen/fallback';
import { createWorldWithOpening, fetchChapter, fetchOutline } from './gen/client';
import { makeSeedCode, normalizeSeed } from './gen/rng';
import { choicePathHash, type ChoicePathEntry } from './gen/choice-path';
import { buildSkeletonOutline, beatForChapter } from './gen/outline';
import type { GeneratedWorld, GenChapter, GenChoice, ArcOutline, LedgerEntry } from './gen/world-types';
import type { Word } from './types';
```

In `createInitialState` (lines 75–102), add the three new fields to the returned object, next to `genChoiceLog: [],`:

```ts
    genChoiceLog: [],
    choicePath: [],
    ledger: [],
    outline: null,
```

- [ ] **Step 3: Replace `buildContextSummary` with ledger/beat helpers**

Replace `buildContextSummary` (lines 108–132) with:

```ts
/** The outline beat for the current chapter, from the player's outline (skeleton
 *  if Tier-2 hasn't enriched yet). */
function beatFor(state: GameState & GameActions, index: number) {
  const outline = state.outline ?? (state.world ? buildSkeletonOutline(state.world) : null);
  return outline ? beatForChapter(outline, index) : undefined;
}
```

- [ ] **Step 4: Seed choice-path/ledger/outline on game start**

In `startGeneratedGame`, after the world is built and before the big `set({...})` (around line 306), compute the skeleton outline. Replace the `set({ ...createInitialState(), mode: 'generated', ... })` block (lines 306–321) with:

```ts
    const skeleton = buildSkeletonOutline(world);
    set({
      ...createInitialState(),
      mode: 'generated',
      seed: cleanSeed,
      mcPrompt: prompt ?? '',
      world,
      outline: skeleton,
      generatedChapters: { 0: ch0 },
      currentChapterIndex: 0,
      currentSceneIndex: 0,
      currentDialogueIndex: 0,
      affinity: affinityForWorld(world),
      gameStarted: true,
      genLoading: false,
      screen: 'dialogue',
      isLoggedIn: get().isLoggedIn,
    });
```

Then, at the very end of `startGeneratedGame` (after `get().prefetchChapter(1);`, line 328), add the background Tier-2 outline enrich:

```ts
    // Enrich the outline (Tier-2) in the background; ready before chapter 1.
    (async () => {
      const detailed = await fetchOutline(cleanSeed, [], 1);
      if (detailed) set({ outline: detailed });
    })();
```

- [ ] **Step 5: Update `streamChapterRest` to the new fetch contract + ledger**

Replace the body of `streamChapterRest`'s async IIFE `try` block (lines 341–347) with:

```ts
        const res = await fetchChapter(s.seed, index, {
          choicePathHash: choicePathHash(get().choicePath),
          beat: beatFor(get(), index),
          ledger: get().ledger,
          opening,
        });
        const full = res?.chapter;
        const merged = (full && full.scenes?.length) ? full : { ...ch, partial: false };
        set({ generatedChapters: { ...get().generatedChapters, [index]: { ...merged, partial: false } } });
        if (res?.ledgerEntry) absorbLedger(get, set, res.ledgerEntry);
        const st = get();
        autoSave(st);
        debouncedDbSave(get);
```

- [ ] **Step 6: Add the `absorbLedger` helper**

Add this helper just above the `useGameStore` definition (before line 223):

```ts
/** Merge a chapter's ledger entry into state (replacing any prior entry for that
 *  index so re-streams don't duplicate). */
function absorbLedger(
  get: () => GameState & GameActions,
  set: (partial: Partial<GameState & GameActions>) => void,
  entry: LedgerEntry,
): void {
  const ledger = get().ledger.filter((e) => e.index !== entry.index);
  ledger.push(entry);
  ledger.sort((a, b) => a.index - b.index);
  set({ ledger });
}
```

- [ ] **Step 7: Update `ensureGeneratedChapter`**

Replace the `try`/`catch` chapter fetch in `ensureGeneratedChapter` (lines 364–370) with:

```ts
    let ch: GenChapter;
    try {
      const res = await fetchChapter(state.seed, index, {
        choicePathHash: choicePathHash(state.choicePath),
        beat: beatFor(state, index),
        ledger: state.ledger,
      });
      ch = res?.chapter ?? fallbackChapter(world, index);
      if (res?.ledgerEntry) absorbLedger(get, set, res.ledgerEntry);
    } catch {
      ch = fallbackChapter(world, index);
    }
    if (!ch.scenes?.length) ch = fallbackChapter(world, index);
```

- [ ] **Step 8: Update `prefetchChapter`**

Replace the async IIFE in `prefetchChapter` (lines 384–397) with:

```ts
    (async () => {
      try {
        const res = await fetchChapter(s.seed, index, {
          choicePathHash: choicePathHash(get().choicePath),
          beat: beatFor(get(), index),
          ledger: get().ledger,
        });
        const ch = (res?.chapter && res.chapter.scenes?.length) ? res.chapter : fallbackChapter(world, index);
        if (res?.ledgerEntry) absorbLedger(get, set, res.ledgerEntry);
        if (!get().generatedChapters[index]) {
          set({ generatedChapters: { ...get().generatedChapters, [index]: ch } });
        }
      } catch {
        /* leave it; it'll generate on demand when reached */
      } finally {
        chapterInFlight.delete(key);
      }
    })();
```

- [ ] **Step 9: Record the choice path in `genApplyChoice`**

In `genApplyChoice` (lines 400–424), add `choicePath` to the returned object inside `set(s => ({ ... }))`. Replace the returned object (lines 416–421) with:

```ts
      return {
        affinity: newAffinity,
        storyFlags: newFlags,
        genChoiceLog: [...s.genChoiceLog, { chapter: s.currentChapterIndex, tone: choice.tone, text: choice.text }],
        choicePath: [...s.choicePath, { chapter: s.currentChapterIndex, tone: choice.tone }],
        currentDialogueIndex: s.currentDialogueIndex + 1,
      };
```

- [ ] **Step 10: Update `advanceGeneratedChapter` (fetch contract + act-boundary revision)**

Replace the `try`/`catch` fetch block (lines 442–449) with:

```ts
    const cached = state.generatedChapters[nextIndex];
    let ch: GenChapter;
    try {
      if (cached) {
        ch = cached;
      } else {
        const res = await fetchChapter(state.seed, nextIndex, {
          choicePathHash: choicePathHash(state.choicePath),
          beat: beatFor(state, nextIndex),
          ledger: state.ledger,
        });
        ch = res?.chapter ?? fallbackChapter(world, nextIndex);
        if (res?.ledgerEntry) absorbLedger(get, set, res.ledgerEntry);
      }
    } catch {
      ch = fallbackChapter(world, nextIndex);
    }
    if (!ch.scenes?.length) ch = fallbackChapter(world, nextIndex);
```

Then, after the `get().prefetchChapter(nextIndex + 1);` line (line 463), add the act-boundary revision:

```ts
    // Crossed into a new act → revise the remaining outline from the path so far.
    const prevAct = state.outline ? beatForChapter(state.outline, state.currentChapterIndex).act : 1;
    const nextAct = get().outline ? beatForChapter(get().outline!, nextIndex).act : 1;
    if (nextAct > prevAct) {
      (async () => {
        const revised = await fetchOutline(get().seed, get().ledger, nextAct);
        if (revised) set({ outline: revised });
      })();
    }
```

- [ ] **Step 11: Typecheck and lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.
Run: `./node_modules/.bin/eslint lib/versecraft/store.ts lib/versecraft/types.ts`
Expected: no errors.

- [ ] **Step 12: Run the full versecraft gen test suite (regression)**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__`
Expected: PASS (all suites).

- [ ] **Step 13: Commit**

```bash
git add lib/versecraft/store.ts lib/versecraft/types.ts
git commit -m "feat(versecraft): store tracks choice path, ledger, outline; act-boundary revision"
```

---

## Task 11: Dialogue screen — prefetch on final scene, not on chapter load

**Files:**
- Modify: `components/versecraft/GeneratedDialogueScreen.tsx` (lines 106–110)

**Interfaces:**
- Consumes: `prefetchChapter` (unchanged signature). No new exports.

**Rationale:** Today the next chapter is prefetched as soon as the current chapter loads (line 109), before the player's choices for this chapter are committed. Since the chapter cache key now includes the choice path, prefetching that early would cache the wrong variant. Gating the prefetch on reaching the chapter's final scene means (almost) all of this chapter's choices are already in the path.

- [ ] **Step 1: Update the prefetch effect**

Replace the prefetch effect (lines 106–110) with:

```tsx
  // Warm the next chapter once the player reaches this chapter's final scene, so
  // its choice path is (almost) complete before we cache the next variant.
  useEffect(() => {
    if (chapter && sceneIndex >= chapter.scenes.length - 1) prefetchChapter(chapterIndex + 1);
  }, [chapter, chapterIndex, sceneIndex, prefetchChapter]);
```

- [ ] **Step 2: Typecheck and lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.
Run: `./node_modules/.bin/eslint components/versecraft/GeneratedDialogueScreen.tsx`
Expected: no errors (the effect now reads `sceneIndex`, already in scope at line 72-ish via `useGameStore`).

- [ ] **Step 3: Commit**

```bash
git add components/versecraft/GeneratedDialogueScreen.tsx
git commit -m "fix(versecraft): prefetch next chapter on final scene so choice path is complete"
```

---

## Final verification

- [ ] **Step 1: Full test suite for the new modules**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__`
Expected: all suites PASS.

- [ ] **Step 2: Full typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint the full changed surface**

Run: `./node_modules/.bin/eslint lib/versecraft components/versecraft/GeneratedDialogueScreen.tsx app/routes/api/versecraft`
Expected: no errors.

- [ ] **Step 4: Build (regenerates route tree, confirms the new route compiles)**

Run: `./node_modules/.bin/vite build`
Expected: build succeeds. Revert `pnpm-workspace.yaml` if the build touched it.

- [ ] **Step 5: Senior review before pushing**

Per repo convention for game work, run the `senior-swe-reviewer` agent on the branch diff and address findings before opening a PR.

---

## Spec Coverage Check

- Story Bible (hard constraints, name-lock) → Task 3 (`bible.ts`), injected in Task 6 (`buildChapterContext`).
- Arc Outline two-tier (skeleton sync + Tier-2 background) → Task 2 (builders), Task 6 (`generateOutline`), Task 8 (endpoint), Task 10 (sync skeleton on start + background enrich).
- Act-boundary revision → Task 10 Step 10.
- Running Ledger (scribe + compaction + feed-forward) → Task 5, Task 6 (`scribeChapter`), Task 8 (persist + return), Task 10 (`absorbLedger`, fed via `fetchChapter`).
- Scriptwriting craft module → Task 4, injected in Task 6.
- Choices reshape prose (choice-path cache key) → Task 1, Task 7 (schema), Task 8 (cache key), Task 10 (`genApplyChoice` records path).
- Prefetch-after-choice fix → Task 11.
- Deterministic shareable shell preserved → world unchanged; skeleton outline deterministic (Task 2 test); chapter 0 path-empty stays shared (Task 1 empty-hash behavior).
- Fallback parity → Tasks 2/5/6 fallbacks; Task 6 no-AI test.
- Ledger token growth mitigation → Task 5 `compactLedger`.
- Tier-2-not-ready-before-chapter-1 → Task 10 `beatFor` falls back to skeleton.
