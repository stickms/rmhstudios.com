# VerseCraft Writing Guide & Anti-Repetition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give DeepSeek thorough, composable VN-writing guidance (format/pacing, worldbuilding, prose, choices) and reduce the four kinds of repeated dialogue, via expanded craft blocks plus a deterministic near-duplicate node guard on AI chapter output.

**Architecture:** Add named prompt blocks to `craft.ts` and inject only the relevant ones into each generation step's system prompt; add a pure `dropDuplicateNodes` pass called on assembled AI chapters. No data/schema/API/fallback changes.

**Tech Stack:** TypeScript, DeepSeek via OpenAI SDK, Vitest (node env).

## Global Constraints

- **No DOM test env** (`vitest.config.ts` is `environment: 'node'`). Test pure helpers only; verify the rest via typecheck + lint.
- **Run binaries directly:** `./node_modules/.bin/vitest run <file>`, `./node_modules/.bin/eslint <files>`, and for typecheck `node --stack-size=4000 --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit` (bare `tsc` stack-overflows).
- **Determinism / fallback untouched:** do NOT modify `fallback.ts`; the dedup guard applies to the AI path only.
- **Scope:** prompt content + composition + one pure dedup pass. No genre system, no settings-bank, no schema/API changes.
- **Tests live in** `lib/versecraft/gen/__tests__/**/*.test.ts` (glob already registered).
- Pre-existing baseline noise to ignore: 7 kowloon-knockout TS errors; lint errors in `components/versecraft/DialogueScreen.tsx` and `PoemPresentation.tsx`.

---

## File Structure

- `lib/versecraft/gen/craft.ts` *(modify)* — add `VN_FORMAT`, `PROSE_CRAFT`, `SETTING_CRAFT`, `CHOICE_CRAFT`, `ANTI_REPETITION`; keep `CRAFT_SYSTEM`/`craftDirectives`.
- `lib/versecraft/gen/dedupe.ts` *(create)* — pure `dropDuplicateNodes`.
- `lib/versecraft/gen/generate.server.ts` *(modify)* — compose blocks into chapter + world + outline prompts; call `dropDuplicateNodes` in `generateChapter`.
- `lib/versecraft/gen/__tests__/craft.test.ts` *(modify)* — assert each new block's key rules.
- `lib/versecraft/gen/__tests__/dedupe.test.ts` *(create)* — unit tests for the guard.

---

## Task 1: Writing-guide blocks in craft.ts

**Files:**
- Modify: `lib/versecraft/gen/craft.ts`
- Test: `lib/versecraft/gen/__tests__/craft.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all `const … : string` exports): `VN_FORMAT`, `PROSE_CRAFT`, `SETTING_CRAFT`, `CHOICE_CRAFT`, `ANTI_REPETITION` (alongside existing `CRAFT_SYSTEM`, `craftDirectives`).

- [ ] **Step 1: Add the failing tests**

Append inside `lib/versecraft/gen/__tests__/craft.test.ts`. First update its import line to:

```ts
import {
  CRAFT_SYSTEM, craftDirectives,
  VN_FORMAT, PROSE_CRAFT, SETTING_CRAFT, CHOICE_CRAFT, ANTI_REPETITION,
} from '../craft';
```

Then add these tests (inside the existing `describe('craft module', …)` block, or a new describe):

```ts
describe('writing-guide blocks', () => {
  it('VN_FORMAT covers pacing, hooks, and registers', () => {
    const s = VN_FORMAT.toLowerCase();
    expect(s).toContain('scene');
    expect(s).toContain('hook');
    expect(s).toContain('narration');
  });

  it('PROSE_CRAFT bans clichés and demands distinct voices', () => {
    const s = PROSE_CRAFT.toLowerCase();
    expect(s).toContain('clich');
    expect(s).toContain('distinct');
  });

  it('SETTING_CRAFT covers worldbuilding', () => {
    const s = SETTING_CRAFT.toLowerCase();
    expect(s).toContain('world');
    expect(s).toContain('place');
  });

  it('CHOICE_CRAFT requires materially distinct options', () => {
    const s = CHOICE_CRAFT.toLowerCase();
    expect(s).toContain('direction');
    expect(s).toContain('different');
  });

  it('ANTI_REPETITION forbids repeats within and across chapters', () => {
    const s = ANTI_REPETITION.toLowerCase();
    expect(s).toContain('repetition');
    expect(s).toContain('story so far');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/craft.test.ts`
Expected: FAIL — `VN_FORMAT`/etc. are not exported.

- [ ] **Step 3: Add the blocks to craft.ts**

In `lib/versecraft/gen/craft.ts`, after the existing `CRAFT_SYSTEM` declaration (before `craftDirectives`), add:

```ts
export const VN_FORMAT =
  'VISUAL-NOVEL FORMAT & PACING:\n' +
  '- Keep scenes tight and moving — every scene earns its place; cut anything that wanders.\n' +
  '- Balance the registers: narration (speaker=null), the player\'s inner thoughts (speaker=null), and spoken lines (cast ids, or "mc" for the player aloud). Never stack many narration nodes in a row.\n' +
  '- End every scene — and the chapter — on a hook, a turn, or an unresolved beat that pulls the reader onward.\n' +
  '- Let emotion shift line to line and LAND on beats; do not hold one flat emotion across a scene.\n' +
  '- Vary which characters are present and who speaks; avoid long two-character talking-heads stretches.\n' +
  '- Reveal through scene, not summary — no info-dumps; trust the reader.';

export const PROSE_CRAFT =
  'PROSE:\n' +
  '- Prefer concrete, sensory verbs and nouns over adjectives and abstraction.\n' +
  '- Ban stock/clichéd phrasing (e.g. "a single tear", "little did they know", "time seemed to stop", "a breath they didn\'t know they were holding").\n' +
  '- Give each character a DISTINCT diction, rhythm, and vocabulary per their bible voice — two characters must never phrase things the same way.\n' +
  '- Restraint over melodrama; understate the biggest moments. No purple prose.\n' +
  '- Vary imagery and sentence shapes — do not keep reaching for the same words, images, or constructions.';

export const SETTING_CRAFT =
  'SETTING & WORLDBUILDING:\n' +
  '- Build a coherent, lived-in sense of place: specific textures, routines, sounds, and small details that imply a world beyond the frame.\n' +
  '- Give the world an internal logic and honor it consistently.\n' +
  '- Ground emotion in sensory specificity tied to THIS place, not a generic backdrop.\n' +
  '- Choose motifs that belong to this world and let them recur meaningfully.\n' +
  '- Keep tone and genre consistent, flexing to the player\'s prompt without breaking the emotional, character-driven romance/drama frame.';

export const CHOICE_CRAFT =
  'CHOICES:\n' +
  '- The 2–3 options must be genuinely different MOVES — distinct content AND consequence, never reworded versions of one another.\n' +
  '- Each option\'s "direction" must be materially distinct (a different thing the player actually does).\n' +
  '- Include occasional bad or costly options that damage a bond — not every choice is safe.';

export const ANTI_REPETITION =
  'NO REPETITION:\n' +
  '- Never restate a line, image, or sentiment already used earlier in THIS chapter; every node must advance, not echo.\n' +
  '- Never reuse a line, exchange, image, or beat from the STORY SO FAR (the ledger and earlier chapters).\n' +
  '- Once you have made a point, move on — do not have characters circle back to re-say it.';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/craft.test.ts`
Expected: PASS (all craft tests, new and old).

- [ ] **Step 5: Commit**

```bash
git add lib/versecraft/gen/craft.ts lib/versecraft/gen/__tests__/craft.test.ts
git commit -m "feat(versecraft): composable VN writing-guide blocks (format, prose, setting, choice, anti-repetition)"
```

---

## Task 2: Deterministic near-duplicate node guard

**Files:**
- Create: `lib/versecraft/gen/dedupe.ts`
- Create: `lib/versecraft/gen/__tests__/dedupe.test.ts`

**Interfaces:**
- Consumes: `GenScene` from `./world-types`.
- Produces: `function dropDuplicateNodes(scenes: GenScene[]): GenScene[]` — returns new scenes with non-choice nodes whose normalized text exactly repeats an earlier node (anywhere in the chapter) removed; choice nodes always kept; every scene keeps ≥1 node.

- [ ] **Step 1: Write the failing tests**

Create `lib/versecraft/gen/__tests__/dedupe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dropDuplicateNodes } from '../dedupe';
import type { GenScene } from '../world-types';

function scene(id: string, nodes: { text: string; choices?: unknown[] }[]): GenScene {
  return {
    id, environment: 'cafe', timeOfDay: 'morning', charactersPresent: ['c1'],
    nodes: nodes.map((n, i) => ({
      id: `${id}_n${i}`, speaker: null, text: n.text,
      ...(n.choices ? { choices: n.choices } : {}),
    })),
  } as GenScene;
}

describe('dropDuplicateNodes', () => {
  it('drops a later node that exactly repeats an earlier one', () => {
    const out = dropDuplicateNodes([scene('s0', [
      { text: 'The rain falls.' }, { text: 'She smiles.' }, { text: 'the rain falls' },
    ])]);
    expect(out[0].nodes.map(n => n.text)).toEqual(['The rain falls.', 'She smiles.']);
  });

  it('treats punctuation/case/whitespace differences as duplicates', () => {
    const out = dropDuplicateNodes([scene('s0', [
      { text: 'You came back.' }, { text: 'you  came   back!!!' },
    ])]);
    expect(out[0].nodes).toHaveLength(1);
  });

  it('dedupes across scenes', () => {
    const out = dropDuplicateNodes([
      scene('s0', [{ text: 'A line.' }]),
      scene('s1', [{ text: 'a line' }, { text: 'New.' }]),
    ]);
    expect(out[1].nodes.map(n => n.text)).toEqual(['New.']);
  });

  it('never drops a choice node even if its text repeats', () => {
    const out = dropDuplicateNodes([scene('s0', [
      { text: 'Pick one.' }, { text: 'pick one', choices: [{ text: 'a' }] },
    ])]);
    expect(out[0].nodes).toHaveLength(2);
  });

  it('keeps the first node when a scene would otherwise go empty', () => {
    const out = dropDuplicateNodes([
      scene('s0', [{ text: 'Hi.' }]),
      scene('s1', [{ text: 'hi' }]),
    ]);
    expect(out[1].nodes).toHaveLength(1);
    expect(out[1].nodes[0].text).toBe('hi');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/dedupe.test.ts`
Expected: FAIL — cannot find module `../dedupe`.

- [ ] **Step 3: Write the implementation**

Create `lib/versecraft/gen/dedupe.ts`:

```ts
// ─── Near-duplicate node guard ────────────────────────────────────────────────
// Strips repeated nodes from AI chapter output. The deterministic fallback writer
// already de-dups via pickUnique; AI output has no such guard, so the same line
// can recur within or across a chapter's scenes. Pure + deterministic.

import type { GenScene } from './world-types';

/** Normalize text for duplicate detection: lowercase, drop non-alphanumerics,
 *  collapse whitespace. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/** Remove non-choice nodes whose normalized text exactly repeats one already seen
 *  earlier in the chapter. Choice nodes are always kept (they drive progression),
 *  and every scene retains at least its first node so none goes empty. */
export function dropDuplicateNodes(scenes: GenScene[]): GenScene[] {
  const seen = new Set<string>();
  return scenes.map((scene) => {
    const kept = scene.nodes.filter((node) => {
      if (node.choices?.length) return true;   // never drop a choice node
      const key = normalize(node.text);
      if (!key) return true;                   // keep empties / punctuation-only ("...")
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { ...scene, nodes: kept.length ? kept : [scene.nodes[0]] };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__/dedupe.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/versecraft/gen/dedupe.ts lib/versecraft/gen/__tests__/dedupe.test.ts
git commit -m "feat(versecraft): deterministic near-duplicate node guard for AI chapters"
```

---

## Task 3: Compose blocks into prompts + apply the dedup guard

**Files:**
- Modify: `lib/versecraft/gen/generate.server.ts`

**Interfaces:**
- Consumes: `VN_FORMAT`, `PROSE_CRAFT`, `SETTING_CRAFT`, `CHOICE_CRAFT`, `ANTI_REPETITION` (`./craft`); `dropDuplicateNodes` (`./dedupe`).
- Produces: no new exports; behavior change to `chapterSystemPrompt()`, `generateWorld`, `generateOutline`, `generateChapter`.

- [ ] **Step 1: Extend the craft import and add the dedupe import**

In `lib/versecraft/gen/generate.server.ts`, replace:

```ts
import { CRAFT_SYSTEM, craftDirectives } from './craft';
```

with:

```ts
import {
  CRAFT_SYSTEM, craftDirectives,
  VN_FORMAT, PROSE_CRAFT, SETTING_CRAFT, CHOICE_CRAFT, ANTI_REPETITION,
} from './craft';
import { dropDuplicateNodes } from './dedupe';
```

- [ ] **Step 2: Compose the new blocks into `chapterSystemPrompt()`**

In `chapterSystemPrompt()`, replace this line:

```ts
    CRAFT_SYSTEM + '\n' +
    'Respond ONLY with a JSON object.'
```

with:

```ts
    VN_FORMAT + '\n' +
    CRAFT_SYSTEM + '\n' +
    PROSE_CRAFT + '\n' +
    CHOICE_CRAFT + '\n' +
    ANTI_REPETITION + '\n' +
    'Respond ONLY with a JSON object.'
```

- [ ] **Step 3: Add setting + prose guidance to the `generateWorld` system prompt**

In `generateWorld`, replace this line (end of the `const system =` string):

```ts
      'and care, never gratuitously or as shock value. Respond ONLY with a JSON object.';
```

with:

```ts
      'and care, never gratuitously or as shock value. ' +
      SETTING_CRAFT + '\n' + PROSE_CRAFT + '\n' +
      'Respond ONLY with a JSON object.';
```

- [ ] **Step 4: Add one pacing line to the `generateOutline` system prompt**

In `generateOutline`, replace:

```ts
      'You are the showrunner for an emotional anime visual novel. You design a tight dramatic arc with setups ' +
      'planted early and paid off later, one beat per chapter. Respond ONLY with a JSON object.';
```

with:

```ts
      'You are the showrunner for an emotional anime visual novel. You design a tight dramatic arc with setups ' +
      'planted early and paid off later, one beat per chapter. Build rising tension across the five acts, and make ' +
      'each chapter a DISTINCT beat that does not echo another. Respond ONLY with a JSON object.';
```

- [ ] **Step 5: Apply the dedup guard in `generateChapter`**

In `generateChapter`, replace:

```ts
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
```

with:

```ts
    const scenes = continuing ? [opening!, ...rest] : rest;
    const deduped = dropDuplicateNodes(scenes);

    if (!deduped.length) return fallbackChapter(world, index);
    return {
      index, act: routeBeat.act,
      title: parsed.title || routeBeat.title,
      subtitle: parsed.subtitle || `Act ${routeBeat.act} — ${world.title}`,
      emotionalGoal: routeBeat.emotionalGoal,
      scenes: deduped,
      source: 'ai',
    };
```

- [ ] **Step 6: Typecheck**

Run: `node --stack-size=4000 --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -i versecraft || echo "0 versecraft type errors"`
Expected: `0 versecraft type errors`.

- [ ] **Step 7: Lint**

Run: `./node_modules/.bin/eslint lib/versecraft/gen/generate.server.ts lib/versecraft/gen/craft.ts lib/versecraft/gen/dedupe.ts`
Expected: no errors.

- [ ] **Step 8: Run the full gen suite (regression)**

Run: `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__`
Expected: all suites PASS (craft, dedupe, choice-path, ledger, outline, bible, generate-fallback).

- [ ] **Step 9: Commit**

```bash
git add lib/versecraft/gen/generate.server.ts
git commit -m "feat(versecraft): inject writing-guide blocks into prompts; dedup AI chapter nodes"
```

---

## Final verification

- [ ] **Step 1: Full gen suite** — `./node_modules/.bin/vitest run lib/versecraft/gen/__tests__` → all pass.
- [ ] **Step 2: Typecheck** — `node --stack-size=4000 --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit` → no NEW errors (only the 7 kowloon baseline).
- [ ] **Step 3: Lint** — `./node_modules/.bin/eslint lib/versecraft` → no NEW errors (DialogueScreen/PoemPresentation baseline excepted).
- [ ] **Step 4: Senior review** — run the `senior-swe-reviewer` agent on the branch diff before opening the PR (repo convention for game work).

---

## Self-Review

- **Spec coverage:** VN_FORMAT/PROSE_CRAFT/SETTING_CRAFT/CHOICE_CRAFT/ANTI_REPETITION blocks → Task 1; composition into chapter/world/outline prompts → Task 3 (steps 2–4); dedup guard module → Task 2; dedup applied in generateChapter (incl. continuation seeding via opening scene being first in `scenes`) → Task 3 step 5; scribe unchanged (correct — not in any task). All spec sections covered.
- **Placeholders:** none — every code step shows complete code.
- **Type consistency:** `dropDuplicateNodes(scenes: GenScene[]): GenScene[]` defined in Task 2 and imported/called identically in Task 3; the five craft block names match between Task 1 (definition), Task 1 test, and Task 3 import.
