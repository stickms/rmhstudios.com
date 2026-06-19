# Bilingual Chinese Epic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate an original ~100-page bilingual Chinese epic (vertical 竖排 Chinese verso / English recto), styled as a classical 古籍 woodblock edition with procedural SVG ornaments, and add it to the site Library.

**Architecture:** A deterministic build pipeline under `scripts/epic/` turns a structured *manuscript* (JSON) into a styled HTML document (vertical Chinese + horizontal English facing pages), paginates it into synchronized leaf-pairs using headless Chromium measurement, and renders a PDF + cover via Playwright + sharp. The manuscript itself is produced by a separate multi-agent generation workflow. The only artifacts that touch the app are the PDF, the cover JPG, and one `library-metadata.json` entry.

**Tech Stack:** TypeScript (run via `pnpm exec tsx`), vitest, Playwright (Chromium, already installed), sharp. SVG validation in tests uses a small self-contained XML well-formedness checker (no new dependency — the repo's pnpm workspace lockfile must stay untouched). macOS system fonts: Songti SC, Kaiti SC (Chinese), Baskerville (English).

## Global Constraints

- All build code lives under `scripts/epic/`. No changes to app/site code; Library integration is **data-only** (one entry in `data/library-metadata.json`, plus files in `public/library/` and `public/library/covers/`).
- Ornaments/artwork are **procedural SVG only** — no raster/AI image generation.
- Chinese is set **vertical 竖排** (`writing-mode: vertical-rl`, columns right→left) on the verso; English horizontal on the recto. Facing pages are synced per passage.
- PDF page order is `…, zh, en, zh, en, …` so two-up spreads show zh on the left leaf, its synced en on the right.
- Ink color `#1a1410` (warm sumi black); accent `#b03a2e` (cinnabar vermilion). Paper `#efe7d4` ivory.
- **Run binaries directly, never through pnpm's runner.** Use `node_modules/.bin/vitest run --config vitest.epic.config.ts [path]` for tests and `node_modules/.bin/tsx <path>` for scripts. Do **not** use `pnpm run …` or `pnpm exec …` for epic commands — pnpm v11's pre-run deps check rewrites `pnpm-lock.yaml` to match this repo's member-less workspace config (pruning real workspace members), and that churn must never be committed.
- **Do not modify or stage `pnpm-lock.yaml` or `pnpm-workspace.yaml`.** Commit with explicit file paths (never `git add -A`/`git commit -am`). If pnpm dirties the lockfile anyway, leave it unstaged (or `git checkout HEAD -- pnpm-lock.yaml pnpm-workspace.yaml`). Add no new npm dependencies.
- Commit after every task. Branch: `chinese-epic`.

---

### Task 1: Scaffold, dependencies, and a vitest smoke test

**Files:**
- Modify: `package.json` (add two scripts only — no new deps)
- Create: `scripts/epic/README.md`
- Create: `scripts/epic/smoke.test.ts`
- Create: `vitest.epic.config.ts`

**Interfaces:**
- Produces: the `scripts/epic/` workspace, `pnpm run epic:test`, `pnpm run epic:build` script names.

- [ ] **Step 1: Install dependencies**

Run:
```bash
pnpm install
```
Expected: install completes; `node_modules/` now exists. **If `pnpm install` modifies `pnpm-lock.yaml` or `pnpm-workspace.yaml`, restore them with `git checkout HEAD -- pnpm-lock.yaml pnpm-workspace.yaml`** — node_modules on disk is what we need; the committed lockfile must not change. Do **not** add any npm dependency (SVG validation in Task 3 is self-contained).

- [ ] **Step 2: Add a dedicated vitest config (node env, scoped to scripts/epic)**

Create `vitest.epic.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/epic/**/*.test.ts'],
    testTimeout: 60_000, // pagination/build tests spin up Chromium
  },
});
```

- [ ] **Step 3: Add scripts to package.json**

In `package.json` `"scripts"`, add (these document intent; **invoke the binaries directly** rather than via `pnpm run`, which triggers the lockfile-mutating deps check):
```json
"epic:test": "node_modules/.bin/vitest run --config vitest.epic.config.ts",
"epic:build": "node_modules/.bin/tsx scripts/epic/build-epic.ts"
```

- [ ] **Step 4: Write the smoke test**

Create `scripts/epic/smoke.test.ts`:
```ts
import { test, expect } from 'vitest';

test('vitest runs in the epic workspace', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Create a short README**

Create `scripts/epic/README.md`:
```md
# Epic build pipeline

Generates the bilingual Chinese epic PDF for the Library.

- `manuscript/` — generated content (story bible + per-chapter passage JSON)
- `ornaments/` — pure SVG-string generators (woodblock 版式 elements)
- `render/` — manuscript + ornaments → styled HTML
- `paginate.ts` — Chromium-measured synchronized facing leaf-pairs
- `build-epic.ts` — orchestrator → public/library/<slug>.pdf + cover

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts` and `pnpm run epic:build`.
```

- [ ] **Step 6: Run the smoke test**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts`
Expected: PASS, 1 test.

- [ ] **Step 7: Commit**

```bash
git add package.json vitest.epic.config.ts scripts/epic/
git commit -m "chore(epic): scaffold build workspace, vitest config"
```
(Do not stage `pnpm-lock.yaml` or `pnpm-workspace.yaml`.)

---

### Task 2: Manuscript data model and validator

**Files:**
- Create: `scripts/epic/manuscript/types.ts`
- Create: `scripts/epic/manuscript/validate.ts`
- Create: `scripts/epic/manuscript/validate.test.ts`
- Create: `scripts/epic/manuscript/sample.ts` (a 1-chapter fixture used by render/paginate tests)

**Interfaces:**
- Produces:
  - `type RedNote = { anchor: string; zh: string; en: string }`
  - `type Passage` (discriminated union on `type`): `'heading' | 'couplet' | 'prose' | 'verse'`
  - `type Chapter = { n: number; title: { zh: string; en: string }; couplet: CoupletPassage; passages: Passage[] }`
  - `type Bible = { titleOptions: { zh: string; en: string }[]; chosenTitle?: { zh: string; en: string }; synopsis: string; characters: {...}[]; outline: {...}[] }`
  - `function validateChapter(c: unknown): Chapter` (throws on invalid)
  - `const SAMPLE_CHAPTER: Chapter`

- [ ] **Step 1: Write the failing test**

Create `scripts/epic/manuscript/validate.test.ts`:
```ts
import { test, expect } from 'vitest';
import { validateChapter } from './validate';
import { SAMPLE_CHAPTER } from './sample';

test('accepts a well-formed chapter', () => {
  expect(() => validateChapter(SAMPLE_CHAPTER)).not.toThrow();
  expect(validateChapter(SAMPLE_CHAPTER).n).toBe(1);
});

test('rejects a chapter missing its couplet', () => {
  const bad = { ...SAMPLE_CHAPTER, couplet: undefined };
  expect(() => validateChapter(bad)).toThrow(/couplet/);
});

test('rejects a verse passage whose zh/en line counts differ', () => {
  const bad = {
    ...SAMPLE_CHAPTER,
    passages: [{ type: 'verse', zh: ['一', '二'], en: ['one'] }],
  };
  expect(() => validateChapter(bad)).toThrow(/line count/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/manuscript/validate.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the types**

Create `scripts/epic/manuscript/types.ts`:
```ts
export type RedNote = { anchor: string; zh: string; en: string };

export type HeadingPassage = { type: 'heading'; zh: string; en: string };
export type CoupletPassage = { type: 'couplet'; zh: [string, string]; en: [string, string] };
export type ProsePassage = { type: 'prose'; zh: string; en: string; redComment?: RedNote[] };
export type VersePassage = { type: 'verse'; zh: string[]; en: string[]; redComment?: RedNote[] };

export type Passage = HeadingPassage | CoupletPassage | ProsePassage | VersePassage;

export type Chapter = {
  n: number;
  title: { zh: string; en: string };
  couplet: CoupletPassage;
  passages: Passage[];
};

export type Character = { zh: string; en: string; role: string; source: string };
export type OutlineEntry = { n: number; zh: string; en: string; beats: string };

export type Bible = {
  titleOptions: { zh: string; en: string }[];
  chosenTitle?: { zh: string; en: string };
  synopsis: string;
  characters: Character[];
  outline: OutlineEntry[];
};
```

- [ ] **Step 4: Write the validator**

Create `scripts/epic/manuscript/validate.ts`:
```ts
import type { Chapter, Passage, CoupletPassage } from './types';

function isStr(x: unknown): x is string { return typeof x === 'string'; }
function strArr(x: unknown): x is string[] { return Array.isArray(x) && x.every(isStr); }

function validatePassage(p: any, i: number): Passage {
  if (!p || typeof p !== 'object') throw new Error(`passage[${i}] not an object`);
  switch (p.type) {
    case 'heading':
      if (!isStr(p.zh) || !isStr(p.en)) throw new Error(`passage[${i}] heading needs zh/en strings`);
      return p;
    case 'couplet':
      if (!strArr(p.zh) || p.zh.length !== 2 || !strArr(p.en) || p.en.length !== 2)
        throw new Error(`passage[${i}] couplet needs 2 zh + 2 en lines`);
      return p;
    case 'prose':
      if (!isStr(p.zh) || !isStr(p.en)) throw new Error(`passage[${i}] prose needs zh/en strings`);
      return p;
    case 'verse':
      if (!strArr(p.zh) || !strArr(p.en)) throw new Error(`passage[${i}] verse needs zh/en line arrays`);
      if (p.zh.length !== p.en.length) throw new Error(`passage[${i}] verse line count mismatch`);
      return p;
    default:
      throw new Error(`passage[${i}] unknown type ${JSON.stringify(p.type)}`);
  }
}

export function validateChapter(c: unknown): Chapter {
  const ch = c as any;
  if (!ch || typeof ch !== 'object') throw new Error('chapter not an object');
  if (typeof ch.n !== 'number') throw new Error('chapter.n must be a number');
  if (!ch.title || !isStr(ch.title.zh) || !isStr(ch.title.en)) throw new Error('chapter.title needs zh/en');
  if (!ch.couplet || ch.couplet.type !== 'couplet') throw new Error('chapter.couplet missing');
  validatePassage(ch.couplet as CoupletPassage, -1);
  if (!Array.isArray(ch.passages)) throw new Error('chapter.passages must be an array');
  ch.passages.forEach((p: unknown, i: number) => validatePassage(p, i));
  return ch as Chapter;
}
```

- [ ] **Step 5: Write the sample fixture**

Create `scripts/epic/manuscript/sample.ts`:
```ts
import type { Chapter } from './types';

export const SAMPLE_CHAPTER: Chapter = {
  n: 1,
  title: { zh: '第一回 玄圭失轨 諸侯起兵', en: 'Chapter 1: The Omen Stolen, the Lords Rise' },
  couplet: {
    type: 'couplet',
    zh: ['玄圭一失天下亂', '赤心三盟兄弟分'],
    en: ['One omen lost, all under heaven falls to war', 'Three oaths sworn in red, sworn brothers torn apart'],
  },
  passages: [
    { type: 'prose',
      zh: '話說洪荒之世，天賜玄圭于桑國，鎮其社稷。一夕，圭失，諸侯皆動，刀兵四起。',
      en: 'In the age of the great waste, Heaven granted the dark omen-tablet to the land of Sang to anchor its altars. One night the tablet vanished; the lords stirred, and weapons rose on every side.',
      redComment: [{ anchor: '圭失', zh: '此句已伏百回之淚。', en: 'This line already buries the tears of a hundred chapters.' }] },
    { type: 'verse',
      zh: ['君不見桑都旧苑草連天，', '玉砌雕欄一夜寒。'],
      en: ['Behold the old gardens of Sang, their grasses meeting the sky,', 'jade steps and carved rails gone cold in a single night.'] },
  ],
};
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/manuscript/validate.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add scripts/epic/manuscript/
git commit -m "feat(epic): manuscript data model, validator, sample fixture"
```

---

### Task 3: SVG test helper + block frame and column rules (版框 / 界行)

**Files:**
- Create: `scripts/epic/ornaments/svg-test-utils.ts`
- Create: `scripts/epic/ornaments/frame.ts`
- Create: `scripts/epic/ornaments/frame.test.ts`

**Interfaces:**
- Consumes: nothing external (self-contained).
- Produces:
  - `function assertValidSvg(svg: string): void` (throws if not well-formed XML / not an `<svg>` root)
  - `function blockFrame(w: number, h: number): string` — returns `<g>…</g>` woodblock 文武边栏 (double rule), drawn inset within a `w×h` box.
  - `function columnRules(x: number, y: number, w: number, h: number, cols: number): string` — `cols-1` 界行 vertical rules evenly dividing the box.

- [ ] **Step 1: Write the failing test**

Create `scripts/epic/ornaments/frame.test.ts`:
```ts
import { test, expect } from 'vitest';
import { assertValidSvg } from './svg-test-utils';
import { blockFrame, columnRules } from './frame';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100">${inner}</svg>`;

test('blockFrame returns well-formed svg fragment with two rule rects', () => {
  const svg = wrap(blockFrame(800, 1100));
  assertValidSvg(svg);
  // outer + inner rule = at least two rect/path elements
  expect((svg.match(/<rect/g) || []).length).toBeGreaterThanOrEqual(2);
});

test('columnRules emits cols-1 separators', () => {
  const svg = wrap(columnRules(40, 40, 720, 1020, 10));
  assertValidSvg(svg);
  expect((svg.match(/<line/g) || []).length).toBe(9);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/ornaments/frame.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the SVG test helper**

Create `scripts/epic/ornaments/svg-test-utils.ts` (dependency-free XML well-formedness check — tokenizes tags respecting quoted attribute values, balances the tag stack, and verifies the root is `<svg>`):
```ts
type Tag = { name: string; selfClosing: boolean; closing: boolean };

/** Yield element tags in document order, skipping comments and declarations. */
function* tags(svg: string): Generator<Tag> {
  const n = svg.length;
  let i = 0;
  while (i < n) {
    const lt = svg.indexOf('<', i);
    if (lt === -1) break;
    if (svg.startsWith('<!--', lt)) {
      const end = svg.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('unterminated comment');
      i = end + 3;
      continue;
    }
    if (svg[lt + 1] === '?' || svg[lt + 1] === '!') {
      const end = svg.indexOf('>', lt);
      if (end === -1) throw new Error('unterminated declaration');
      i = end + 1;
      continue;
    }
    // scan to the matching '>', ignoring '>' inside quoted attribute values
    let j = lt + 1;
    let quote = '';
    for (; j < n; j++) {
      const c = svg[j];
      if (quote) { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (j >= n) throw new Error('unterminated tag');
    const inner = svg.slice(lt + 1, j).trim();
    i = j + 1;
    const closing = inner.startsWith('/');
    const selfClosing = inner.endsWith('/');
    const name = inner.replace(/^\//, '').replace(/\/$/, '').trim().split(/[\s/]/)[0];
    if (!name) throw new Error('empty tag name');
    yield { name, selfClosing: selfClosing && !closing, closing };
  }
}

export function assertValidSvg(svg: string): void {
  const stack: string[] = [];
  let root = '';
  let sawElement = false;
  for (const t of tags(svg)) {
    if (t.closing) {
      const top = stack.pop();
      if (top !== t.name) throw new Error(`mismatched </${t.name}> (expected </${top ?? 'nothing'}>)`);
    } else {
      sawElement = true;
      if (stack.length === 0 && !root) root = t.name;
      if (!t.selfClosing) stack.push(t.name);
    }
  }
  if (!sawElement) throw new Error('no elements found');
  if (stack.length) throw new Error(`unclosed tags: ${stack.join(', ')}`);
  if (root !== 'svg') throw new Error(`expected <svg> root, got <${root}>`);
}
```

- [ ] **Step 4: Write the frame ornaments**

Create `scripts/epic/ornaments/frame.ts`:
```ts
const INK = '#1a1410';

/** 文武边栏: a thick outer rule and a thin inner rule, inset in a w×h box. */
export function blockFrame(w: number, h: number): string {
  const m = Math.round(Math.min(w, h) * 0.035); // outer margin
  const gap = 6; // space between the two rules
  const ow = w - 2 * m;
  const oh = h - 2 * m;
  return `<g fill="none" stroke="${INK}">
    <rect x="${m}" y="${m}" width="${ow}" height="${oh}" stroke-width="3.2"/>
    <rect x="${m + gap}" y="${m + gap}" width="${ow - 2 * gap}" height="${oh - 2 * gap}" stroke-width="1"/>
  </g>`;
}

/** 界行: cols-1 evenly spaced vertical rules across the text box. */
export function columnRules(x: number, y: number, w: number, h: number, cols: number): string {
  const lines: string[] = [];
  for (let i = 1; i < cols; i++) {
    const cx = x + (w * i) / cols;
    lines.push(`<line x1="${cx.toFixed(1)}" y1="${y}" x2="${cx.toFixed(1)}" y2="${y + h}" stroke="${INK}" stroke-width="0.6" opacity="0.55"/>`);
  }
  return `<g>${lines.join('')}</g>`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/ornaments/frame.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/epic/ornaments/
git commit -m "feat(epic): SVG test helper + 版框 frame and 界行 column rules"
```

---

### Task 4: Center strip with fishtail (版心 / 黑鱼尾 / page cartouche)

**Files:**
- Create: `scripts/epic/ornaments/center-strip.ts`
- Create: `scripts/epic/ornaments/center-strip.test.ts`

**Interfaces:**
- Consumes: `assertValidSvg`.
- Produces: `function centerStrip(opts: { x: number; y: number; w: number; h: number; title: string; juan: string; page: string }): string` — the gutter 版心: a black 黑鱼尾 fishtail, vertical book title above it, juan/chapter label, and page-number cartouche below, all set vertically.

- [ ] **Step 1: Write the failing test**

Create `scripts/epic/ornaments/center-strip.test.ts`:
```ts
import { test, expect } from 'vitest';
import { assertValidSvg } from './svg-test-utils';
import { centerStrip } from './center-strip';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100">${inner}</svg>`;

test('centerStrip is valid svg containing the title, juan and page', () => {
  const svg = wrap(centerStrip({ x: 380, y: 40, w: 40, h: 1020, title: '天命輓歌', juan: '卷一', page: '三' }));
  assertValidSvg(svg);
  // vlabel renders each character as its own <text> element (vertical run) — assert per char
  for (const ch of '天命輓歌') expect(svg).toContain(`>${ch}</text>`);
  for (const ch of '卷一') expect(svg).toContain(`>${ch}</text>`);
  expect(svg).toContain('>三</text>');
  // the fishtail is a filled path
  expect(svg).toMatch(/<path[^>]+fill="#1a1410"/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/ornaments/center-strip.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `scripts/epic/ornaments/center-strip.ts`:
```ts
const INK = '#1a1410';

function vlabel(cx: number, top: number, text: string, size: number): string {
  // vertical run of characters, top→down
  return [...text]
    .map((ch, i) =>
      `<text x="${cx}" y="${top + (i + 0.85) * size}" font-family="Songti SC, STSong, serif" font-size="${size}" fill="${INK}" text-anchor="middle">${ch}</text>`)
    .join('');
}

/** A black fishtail (黑鱼尾): a downward-pointing notched triangle. */
function fishtail(cx: number, top: number, w: number): string {
  const h = w * 0.7;
  const half = w / 2;
  const notch = w * 0.22;
  return `<path d="M ${cx - half} ${top} L ${cx + half} ${top} L ${cx + notch} ${top + h} L ${cx} ${top + h * 0.6} L ${cx - notch} ${top + h} Z" fill="${INK}"/>`;
}

export function centerStrip(opts: { x: number; y: number; w: number; h: number; title: string; juan: string; page: string }): string {
  const { x, y, w, h, title, juan, page } = opts;
  const cx = x + w / 2;
  const ftW = w * 0.7;
  const titleSize = w * 0.5;
  const juanSize = w * 0.42;
  return `<g>
    <line x1="${x}" y1="${y}" x2="${x}" y2="${y + h}" stroke="${INK}" stroke-width="0.8"/>
    <line x1="${x + w}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${INK}" stroke-width="0.8"/>
    ${vlabel(cx, y + 8, title, titleSize)}
    ${fishtail(cx, y + 8 + title.length * titleSize + 10, ftW)}
    ${vlabel(cx, y + 8 + title.length * titleSize + 10 + ftW, juan, juanSize)}
    ${vlabel(cx, y + h - (page.length + 1) * juanSize, page, juanSize)}
  </g>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/ornaments/center-strip.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/epic/ornaments/center-strip.ts scripts/epic/ornaments/center-strip.test.ts
git commit -m "feat(epic): 版心 center strip with 黑鱼尾 fishtail and page cartouche"
```

---

### Task 5: Vermilion seals (印章 — 朱文 / 白文)

**Files:**
- Create: `scripts/epic/ornaments/seal.ts`
- Create: `scripts/epic/ornaments/seal.test.ts`

**Interfaces:**
- Consumes: `assertValidSvg`.
- Produces: `function seal(opts: { x: number; y: number; size: number; text: string; style?: 'relief' | 'intaglio' }): string` — a square cinnabar seal. `relief` (朱文) = red glyphs on a thin red border; `intaglio` (白文) = paper-colored glyphs reversed out of a solid red block. 2–4 chars laid out in a grid.

- [ ] **Step 1: Write the failing test**

Create `scripts/epic/ornaments/seal.test.ts`:
```ts
import { test, expect } from 'vitest';
import { assertValidSvg } from './svg-test-utils';
import { seal } from './seal';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${inner}</svg>`;

test('intaglio seal is a solid red block with reversed glyphs', () => {
  const svg = wrap(seal({ x: 20, y: 20, size: 160, text: '天命', style: 'intaglio' }));
  assertValidSvg(svg);
  expect(svg).toContain('#b03a2e');
  expect(svg).toContain('天');
  expect(svg).toContain('命');
});

test('relief seal renders red glyphs', () => {
  const svg = wrap(seal({ x: 20, y: 20, size: 160, text: '頒行', style: 'relief' }));
  assertValidSvg(svg);
  expect(svg).toContain('頒');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/ornaments/seal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `scripts/epic/ornaments/seal.ts`:
```ts
const RED = '#b03a2e';
const PAPER = '#efe7d4';

/** Lay text into an n×n grid filling a size×size square (read top→down, right→left like a seal). */
function grid(text: string, x: number, y: number, size: number, color: string): string {
  const n = Math.ceil(Math.sqrt(text.length));
  const cell = size / n;
  const chars = [...text];
  const out: string[] = [];
  // seal reading order: columns right→left, top→bottom
  let idx = 0;
  for (let col = n - 1; col >= 0; col--) {
    for (let row = 0; row < n && idx < chars.length; row++) {
      const cx = x + col * cell + cell / 2;
      const cy = y + row * cell + cell * 0.78;
      out.push(`<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-family="Kaiti SC, STKaiti, serif" font-weight="700" font-size="${(cell * 0.82).toFixed(1)}" fill="${color}" text-anchor="middle">${chars[idx++]}</text>`);
    }
  }
  return out.join('');
}

export function seal(opts: { x: number; y: number; size: number; text: string; style?: 'relief' | 'intaglio' }): string {
  const { x, y, size, text, style = 'intaglio' } = opts;
  const r = size * 0.06; // rounded carved corners
  if (style === 'intaglio') {
    return `<g>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="${RED}"/>
      ${grid(text, x + size * 0.08, y + size * 0.08, size * 0.84, PAPER)}
    </g>`;
  }
  return `<g>
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="none" stroke="${RED}" stroke-width="${size * 0.04}"/>
    ${grid(text, x + size * 0.08, y + size * 0.08, size * 0.84, RED)}
  </g>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/ornaments/seal.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/epic/ornaments/seal.ts scripts/epic/ornaments/seal.test.ts
git commit -m "feat(epic): vermilion 印章 seals (朱文/白文)"
```

---

### Task 6: Fret and cloud borders (回纹 / 卷云纹)

**Files:**
- Create: `scripts/epic/ornaments/borders.ts`
- Create: `scripts/epic/ornaments/borders.test.ts`

**Interfaces:**
- Consumes: `assertValidSvg`.
- Produces:
  - `function fretBorder(x: number, y: number, w: number, h: number, unit?: number): string` — a 回纹 (Greek-key/meander) band framing the rectangle perimeter.
  - `function cloudMotif(cx: number, cy: number, scale: number): string` — a single 卷云纹 (scrolling-cloud) corner flourish.

- [ ] **Step 1: Write the failing test**

Create `scripts/epic/ornaments/borders.test.ts`:
```ts
import { test, expect } from 'vitest';
import { assertValidSvg } from './svg-test-utils';
import { fretBorder, cloudMotif } from './borders';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100">${inner}</svg>`;

test('fretBorder is valid and made of stroked paths', () => {
  const svg = wrap(fretBorder(40, 40, 720, 1020));
  assertValidSvg(svg);
  expect((svg.match(/<path/g) || []).length).toBeGreaterThan(0);
});

test('cloudMotif is valid svg', () => {
  const svg = wrap(cloudMotif(100, 100, 1));
  assertValidSvg(svg);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/ornaments/borders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `scripts/epic/ornaments/borders.ts`:
```ts
const INK = '#1a1410';

/** One Greek-key/meander cell as a relative path starting at (0,0), advancing +unit*4 in x. */
function fretCell(unit: number): string {
  const u = unit;
  return `m0 0 h${3 * u} v${-3 * u} h${-2 * u} v${u} h${u} v${u} h${-2 * u} v${-3 * u} ... `; // replaced below
}

/** A meander band around the rectangle perimeter (top, right, bottom, left). */
export function fretBorder(x: number, y: number, w: number, h: number, unit = 10): string {
  // Build a horizontal meander run of `count` cells, each `4*unit` wide and `3*unit` tall.
  const cellW = 4 * unit;
  const run = (len: number): string => {
    const count = Math.max(1, Math.floor(len / cellW));
    let d = '';
    for (let i = 0; i < count; i++) {
      const ox = i * cellW;
      d += `M${ox} 0 h${unit} v${-2 * unit} h${2 * unit} v${2 * unit} h${unit} `;
    }
    return d;
  };
  const band = unit * 2;
  return `<g fill="none" stroke="${INK}" stroke-width="${unit * 0.18}">
    <path transform="translate(${x} ${y + band})" d="${run(w)}"/>
    <path transform="translate(${x} ${y + h}) " d="${run(w)}"/>
    <path transform="translate(${x + band} ${y}) rotate(90)" d="${run(h)}"/>
    <path transform="translate(${x + w} ${y}) rotate(90)" d="${run(h)}"/>
  </g>`;
}

/** A scrolling-cloud flourish: two nested spirals. */
export function cloudMotif(cx: number, cy: number, scale: number): string {
  const s = 18 * scale;
  return `<g fill="none" stroke="${INK}" stroke-width="${1.4 * scale}" transform="translate(${cx} ${cy})">
    <path d="M0 0 q ${s} ${-s} ${2 * s} 0 q ${s} ${s} 0 ${1.4 * s} q ${-s} ${s} ${-2 * s} 0"/>
    <circle cx="${s}" cy="${0.2 * s}" r="${0.35 * s}"/>
  </g>`;
}
```

Note: delete the unused `fretCell` stub before committing (it is illustrative only); the working meander is `run()`.

- [ ] **Step 4: Remove the stub and run the tests**

Edit `borders.ts` to delete the `fretCell` function. Run:
`node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/ornaments/borders.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/epic/ornaments/borders.ts scripts/epic/ornaments/borders.test.ts
git commit -m "feat(epic): 回纹 fret border and 卷云纹 cloud motif"
```

---

### Task 7: Full-page plates (扉页 frontispiece, 绣像 figure, 牌记 colophon)

**Files:**
- Create: `scripts/epic/ornaments/plates.ts`
- Create: `scripts/epic/ornaments/plates.test.ts`

**Interfaces:**
- Consumes: `blockFrame`, `fretBorder`, `cloudMotif`, `seal`, `assertValidSvg`.
- Produces (each returns a complete `<svg …>…</svg>` sized to a page `W×H`, default 800×1100):
  - `function frontispiece(opts: { titleZh: string; titleEn: string; W?: number; H?: number }): string`
  - `function xiuxiangPlate(opts: { nameZh: string; nameEn: string; W?: number; H?: number }): string` — a stylized standing-figure portrait inside a fret frame with a name cartouche.
  - `function colophon(opts: { lines: string[]; W?: number; H?: number }): string` — a 牌记 cartouche with publication lines + a 頒行 seal.

- [ ] **Step 1: Write the failing test**

Create `scripts/epic/ornaments/plates.test.ts`:
```ts
import { test, expect } from 'vitest';
import { assertValidSvg } from './svg-test-utils';
import { frontispiece, xiuxiangPlate, colophon } from './plates';

// vtitle renders each character as its own <text>; assert per character, not contiguous.
test('frontispiece is a complete svg page containing the title', () => {
  const svg = frontispiece({ titleZh: '天命輓歌', titleEn: 'Elegy of the Mandate' });
  assertValidSvg(svg);
  expect(svg).toMatch(/^<svg/);
  for (const ch of '天命輓歌') expect(svg).toContain(`>${ch}</text>`);
  expect(svg).toContain('Elegy of the Mandate'); // English is a single <text>
});

test('xiuxiang plate names the figure', () => {
  const svg = xiuxiangPlate({ nameZh: '桑無咎', nameEn: 'Sang Wu-jiu' });
  assertValidSvg(svg);
  for (const ch of '桑無咎') expect(svg).toContain(`>${ch}</text>`);
});

test('colophon lists publication lines', () => {
  const svg = colophon({ lines: ['歲在丙午', '夢餘堂刊'] });
  assertValidSvg(svg);
  for (const ch of '夢餘堂刊') expect(svg).toContain(`>${ch}</text>`);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/ornaments/plates.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `scripts/epic/ornaments/plates.ts`:
```ts
import { blockFrame } from './frame';
import { fretBorder, cloudMotif } from './borders';
import { seal } from './seal';

const INK = '#1a1410';
const PAPER = '#efe7d4';

function page(W: number, H: number, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${PAPER}"/>
    ${inner}
  </svg>`;
}

function vtitle(cx: number, top: number, text: string, size: number): string {
  return [...text]
    .map((ch, i) => `<text x="${cx}" y="${top + (i + 0.85) * size}" font-family="Kaiti SC, STKaiti, serif" font-weight="700" font-size="${size}" fill="${INK}" text-anchor="middle">${ch}</text>`)
    .join('');
}

export function frontispiece(opts: { titleZh: string; titleEn: string; W?: number; H?: number }): string {
  const W = opts.W ?? 800, H = opts.H ?? 1100;
  const tSize = 96;
  return page(W, H, `
    ${blockFrame(W, H)}
    ${fretBorder(W * 0.1, H * 0.08, W * 0.8, H * 0.84, 12)}
    ${cloudMotif(W * 0.2, H * 0.16, 1.6)}
    ${cloudMotif(W * 0.8, H * 0.16, -1.6)}
    ${vtitle(W / 2, H * 0.2, opts.titleZh, tSize)}
    <text x="${W / 2}" y="${H * 0.82}" font-family="Baskerville, Georgia, serif" font-style="italic" font-size="34" fill="${INK}" text-anchor="middle">${opts.titleEn}</text>
    ${seal({ x: W / 2 - 55, y: H * 0.86, size: 110, text: opts.titleZh.slice(0, 4), style: 'intaglio' })}
  `);
}

export function xiuxiangPlate(opts: { nameZh: string; nameEn: string; W?: number; H?: number }): string {
  const W = opts.W ?? 800, H = opts.H ?? 1100;
  const cx = W / 2;
  // a minimal robed standing figure built from vector strokes
  const figure = `<g fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round" transform="translate(${cx} ${H * 0.3})">
    <circle cx="0" cy="0" r="48" fill="${PAPER}"/>
    <path d="M-70 60 Q0 20 70 60 L95 380 Q0 410 -95 380 Z" fill="${PAPER}"/>
    <path d="M-70 90 L-150 230 M70 90 L150 230"/>
    <path d="M-40 380 L-40 470 M40 380 L40 470"/>
  </g>`;
  return page(W, H, `
    ${blockFrame(W, H)}
    ${fretBorder(W * 0.08, H * 0.06, W * 0.84, H * 0.88, 11)}
    ${figure}
    <rect x="${cx - 70}" y="${H * 0.86}" width="140" height="64" fill="none" stroke="${INK}" stroke-width="2"/>
    ${vtitle(cx, H * 0.865, opts.nameZh, 36)}
    <text x="${cx}" y="${H * 0.955}" font-family="Baskerville, Georgia, serif" font-style="italic" font-size="22" fill="${INK}" text-anchor="middle">${opts.nameEn}</text>
  `);
}

export function colophon(opts: { lines: string[]; W?: number; H?: number }): string {
  const W = opts.W ?? 800, H = opts.H ?? 1100;
  const cx = W / 2;
  const colGap = 56;
  const startX = cx + ((opts.lines.length - 1) * colGap) / 2; // right→left columns
  const cols = opts.lines
    .map((line, i) => vtitle(startX - i * colGap, H * 0.3, line, 40))
    .join('');
  return page(W, H, `
    ${blockFrame(W, H)}
    <rect x="${W * 0.3}" y="${H * 0.22}" width="${W * 0.4}" height="${H * 0.5}" fill="none" stroke="${INK}" stroke-width="2.5"/>
    ${cols}
    ${seal({ x: cx - 50, y: H * 0.74, size: 100, text: '頒行', style: 'intaglio' })}
  `);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/ornaments/plates.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Visual check (optional but recommended)**

Run a quick throwaway to eyeball a plate:
```bash
node_modules/.bin/tsx -e "import('./scripts/epic/ornaments/plates.ts').then(m=>require('fs').writeFileSync('/tmp/front.svg', m.frontispiece({titleZh:'天命輓歌',titleEn:'Elegy of the Mandate'})))"
open /tmp/front.svg
```

- [ ] **Step 6: Commit**

```bash
git add scripts/epic/ornaments/plates.ts scripts/epic/ornaments/plates.test.ts
git commit -m "feat(epic): full-page plates (frontispiece, 绣像, 牌记 colophon)"
```

---

### Task 8: Typesetter + print CSS (竖排 verso, horizontal recto, 天头 commentary, 圈点)

**Files:**
- Create: `scripts/epic/render/epic.css`
- Create: `scripts/epic/render/typeset.ts`
- Create: `scripts/epic/render/typeset.test.ts`

**Interfaces:**
- Consumes: `Chapter`, `Passage`, ornament functions.
- Produces:
  - `function renderPassageZh(p: Passage): string` and `renderPassageEn(p: Passage): string` — HTML for one passage in each language (verse → stanza lines, prose → paragraph, with red-comment markers/圈点).
  - `function buildHtml(opts: { title: { zh: string; en: string }; leaves: LeafPair[] }): string` — a full standalone HTML document embedding `epic.css`.
  - `type LeafPair = { versoHtml: string; rectoHtml: string; juan: string; pageZh: string; pageEn: string }` (exported from `render/types.ts`).

- [ ] **Step 1: Create `render/types.ts`**

Create `scripts/epic/render/types.ts`:
```ts
export type LeafPair = {
  versoHtml: string; // Chinese page inner HTML
  rectoHtml: string; // English page inner HTML
  juan: string;      // e.g. 卷一
  pageZh: string;    // Chinese numeral page label, e.g. 三
  pageEn: string;    // arabic page label, e.g. 3
};
```

- [ ] **Step 2: Write the failing test**

Create `scripts/epic/render/typeset.test.ts`:
```ts
import { test, expect } from 'vitest';
import { renderPassageZh, renderPassageEn, buildHtml } from './typeset';
import { SAMPLE_CHAPTER } from '../manuscript/sample';

test('verse zh renders one element per line', () => {
  const verse = SAMPLE_CHAPTER.passages.find(p => p.type === 'verse')!;
  const html = renderPassageZh(verse);
  expect((html.match(/class="verse-line"/g) || []).length).toBe(2);
});

test('prose en renders its english text and a red comment marker', () => {
  const prose = SAMPLE_CHAPTER.passages.find(p => p.type === 'prose')!;
  const html = renderPassageEn(prose);
  expect(html).toContain('age of the great waste');
  expect(html).toContain('red-note');
});

test('buildHtml embeds css and both writing modes', () => {
  const html = buildHtml({
    title: { zh: '天命輓歌', en: 'Elegy of the Mandate' },
    leaves: [{ versoHtml: '<p>甲</p>', rectoHtml: '<p>A</p>', juan: '卷一', pageZh: '一', pageEn: '1' }],
  });
  expect(html).toContain('vertical-rl');
  expect(html).toContain('<style>');
  expect(html).toContain('甲');
  expect(html).toContain('class="leaf verso"');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/render/typeset.test.ts`
Expected: FAIL.

- [ ] **Step 4: Write the CSS**

Create `scripts/epic/render/epic.css` (the print stylesheet; each `.leaf` is one PDF page at 800×1100 px ≈ portrait):
```css
@page { size: 800px 1100px; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: #efe7d4; color: #1a1410; }

.leaf {
  position: relative;
  width: 800px;
  height: 1100px;
  background: #efe7d4;
  overflow: hidden;
  page-break-after: always;
  break-after: page;
}
.leaf .ornaments { position: absolute; inset: 0; pointer-events: none; }
.leaf .textbox { position: absolute; left: 64px; top: 96px; right: 64px; bottom: 80px; }

/* Chinese verso: vertical, right→left */
.leaf.verso .textbox {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-family: "Songti SC", STSong, serif;
  font-size: 26px;
  line-height: 1.9;          /* column gap */
  letter-spacing: 2px;
  text-align: justify;
}
.leaf.verso .heading { font-family: "Kaiti SC", STKaiti, serif; font-weight: 700; font-size: 30px; }
.leaf.verso .couplet { font-family: "Kaiti SC", STKaiti, serif; font-size: 28px; }

/* English recto: horizontal */
.leaf.recto .textbox {
  writing-mode: horizontal-tb;
  font-family: Baskerville, Georgia, serif;
  font-size: 17px;
  line-height: 1.6;
  text-align: justify;
  hyphens: auto;
}
.leaf.recto .heading { font-weight: 700; font-variant: small-caps; letter-spacing: 1px; }
.leaf.recto .couplet { font-style: italic; }

.verse-line { display: block; margin: 0.1em 0; }
.leaf.recto .verse-line { padding-left: 1.4em; text-indent: -1.4em; }

/* 圈点 red emphasis: a small vermilion dot beside an anchored char (verso uses right side) */
.emph { position: relative; }
.emph::after {
  content: "○"; color: #b03a2e; font-size: 0.5em;
  position: absolute; right: -0.55em; top: 0;
}
.leaf.recto .emph { text-decoration: underline; text-decoration-color: #b03a2e; }

/* 天头 (head-margin) red commentary */
.red-note { color: #b03a2e; font-family: "Kaiti SC", STKaiti, serif; font-size: 14px; }
.leaf.verso .red-note { writing-mode: vertical-rl; }
.head-margin { position: absolute; left: 64px; right: 64px; top: 28px; height: 60px; overflow: hidden; }
.leaf.verso .head-margin { writing-mode: vertical-rl; }
```

- [ ] **Step 5: Write the typesetter**

Create `scripts/epic/render/typeset.ts`:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Passage } from '../manuscript/types';
import type { LeafPair } from './types';

const __dir = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(__dir, 'epic.css'), 'utf8');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function noteMarkers(p: Extract<Passage, { redComment?: any }>): string {
  if (!('redComment' in p) || !p.redComment?.length) return '';
  return p.redComment.map(n => `<span class="red-note">${esc(n.zh)}</span>`).join(' ');
}
function noteMarkersEn(p: Extract<Passage, { redComment?: any }>): string {
  if (!('redComment' in p) || !p.redComment?.length) return '';
  return p.redComment.map(n => `<span class="red-note">${esc(n.en)}</span>`).join(' ');
}

export function renderPassageZh(p: Passage): string {
  switch (p.type) {
    case 'heading': return `<div class="heading">${esc(p.zh)}</div>`;
    case 'couplet': return `<div class="couplet">${p.zh.map(l => `<div class="verse-line">${esc(l)}</div>`).join('')}</div>`;
    case 'prose': return `<p class="prose">${esc(p.zh)}${noteMarkers(p)}</p>`;
    case 'verse': return `<div class="verse">${p.zh.map(l => `<div class="verse-line">${esc(l)}</div>`).join('')}${noteMarkers(p)}</div>`;
  }
}

export function renderPassageEn(p: Passage): string {
  switch (p.type) {
    case 'heading': return `<div class="heading">${esc(p.en)}</div>`;
    case 'couplet': return `<div class="couplet">${p.en.map(l => `<div class="verse-line">${esc(l)}</div>`).join('')}</div>`;
    case 'prose': return `<p class="prose">${esc(p.en)}${noteMarkersEn(p)}</p>`;
    case 'verse': return `<div class="verse">${p.en.map(l => `<div class="verse-line">${esc(l)}</div>`).join('')}${noteMarkersEn(p)}</div>`;
  }
}

export function buildHtml(opts: { title: { zh: string; en: string }; leaves: LeafPair[] }): string {
  const body = opts.leaves
    .map(
      (lf) => `
    <section class="leaf verso"><div class="textbox">${lf.versoHtml}</div></section>
    <section class="leaf recto"><div class="textbox">${lf.rectoHtml}</div></section>`,
    )
    .join('');
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>${esc(opts.title.zh)}</title><style>${CSS}</style></head>
<body>${body}</body></html>`;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/render/typeset.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add scripts/epic/render/
git commit -m "feat(epic): typesetter + print CSS (竖排 verso / horizontal recto)"
```

---

### Task 9: Pagination engine — synchronized facing leaf-pairs

**Files:**
- Create: `scripts/epic/paginate.ts`
- Create: `scripts/epic/paginate.test.ts`

**Interfaces:**
- Consumes: `Chapter`, `Passage`, `renderPassageZh`, `renderPassageEn`, `LeafPair`, Playwright `chromium`.
- Produces: `async function paginate(chapters: Chapter[], opts?: { numberByJuan?: boolean }): Promise<LeafPair[]>` — packs passages so each leaf's zh column-set and en block both fit a single 800×1100 textbox; breaks at passage boundaries when **either** side would overflow; carries remainder to the next leaf-pair. Chapter boundaries always start a new leaf-pair.

- [ ] **Step 1: Write the failing test**

Create `scripts/epic/paginate.test.ts`:
```ts
import { test, expect } from 'vitest';
import { paginate } from './paginate';
import { SAMPLE_CHAPTER } from './manuscript/types' // placeholder; corrected below
```
Replace the import line with the real one and the test body:
```ts
import { test, expect } from 'vitest';
import { paginate } from './paginate';
import { SAMPLE_CHAPTER } from './manuscript/sample';
import type { Chapter } from './manuscript/types';

function bigChapter(n: number): Chapter {
  // many prose passages to force multiple leaves
  const passages = Array.from({ length: 40 }, (_, i) => ({
    type: 'prose' as const,
    zh: '話說洪荒之世天賜玄圭于桑國鎮其社稷一夕圭失諸侯皆動刀兵四起'.repeat(3) + `（${i}）`,
    en: 'In the age of the great waste Heaven granted the dark omen-tablet to the land of Sang. '.repeat(3) + `(${i})`,
  }));
  return { ...SAMPLE_CHAPTER, n, passages };
}

test('produces facing leaf-pairs that do not overflow, paginating a long chapter', async () => {
  const leaves = await paginate([bigChapter(1)]);
  expect(leaves.length).toBeGreaterThan(1); // long chapter spans multiple leaves
  // every leaf has both a verso and recto
  for (const lf of leaves) {
    expect(lf.versoHtml.length).toBeGreaterThan(0);
    expect(lf.rectoHtml.length).toBeGreaterThan(0);
  }
}, 120_000);

test('a new chapter starts a new leaf-pair', async () => {
  const leaves = await paginate([SAMPLE_CHAPTER, { ...SAMPLE_CHAPTER, n: 2, title: { zh: '第二回', en: 'Chapter 2' } }]);
  // first leaf of chapter 2 should contain its heading text
  const joined = leaves.map(l => l.versoHtml).join('|');
  expect(joined).toContain('第二回');
}, 120_000);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/paginate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the pagination engine**

Create `scripts/epic/paginate.ts`:
```ts
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Chapter, Passage } from './manuscript/types';
import { renderPassageZh, renderPassageEn } from './render/typeset';
import type { LeafPair } from './render/types';

const __dir = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(__dir, 'render/epic.css'), 'utf8');

// numerals for Chinese page labels
const ZH_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function toZhNum(n: number): string {
  if (n <= 10) return ZH_DIGITS[n];
  if (n < 20) return '十' + (n % 10 === 0 ? '' : ZH_DIGITS[n % 10]);
  const t = Math.floor(n / 10), o = n % 10;
  return ZH_DIGITS[t] + '十' + (o === 0 ? '' : ZH_DIGITS[o]);
}

/** Measure whether a textbox of given side fits its 800×1100 leaf without overflow. */
async function fits(page: Page, side: 'verso' | 'recto', innerHtml: string): Promise<boolean> {
  return page.evaluate(
    ([sideArg, html, css]) => {
      const host = document.getElementById('measure')!;
      host.className = `leaf ${sideArg}`;
      host.innerHTML = `<div class="textbox" id="tb">${html}</div>`;
      const tb = document.getElementById('tb')!;
      // overflow if content exceeds the textbox in the writing direction
      const overX = tb.scrollWidth > tb.clientWidth + 1;
      const overY = tb.scrollHeight > tb.clientHeight + 1;
      return !(overX || overY);
    },
    [side, innerHtml, CSS] as const,
  );
}

export async function paginate(chapters: Chapter[], _opts?: { numberByJuan?: boolean }): Promise<LeafPair[]> {
  const browser: Browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 1100 } });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
     #measure{position:absolute;left:0;top:0}</style></head>
     <body><section id="measure" class="leaf verso"></section></body></html>`,
  );

  const leaves: LeafPair[] = [];
  let pageNo = 0;

  try {
    for (const ch of chapters) {
      const juan = `卷${toZhNum(ch.n)}`;
      // every chapter opens a fresh leaf; first passage is the heading then the couplet
      const queue: Passage[] = [
        { type: 'heading', zh: ch.title.zh, en: ch.title.en },
        ch.couplet,
        ...ch.passages,
      ];

      let i = 0;
      while (i < queue.length) {
        let versoHtml = '';
        let rectoHtml = '';
        let placed = 0;

        // greedily add passages while BOTH sides still fit
        while (i + placed < queue.length) {
          const p = queue[i + placed];
          const nextVerso = versoHtml + renderPassageZh(p);
          const nextRecto = rectoHtml + renderPassageEn(p);
          const okZh = await fits(page, 'verso', nextVerso);
          const okEn = await fits(page, 'recto', nextRecto);
          if (okZh && okEn) {
            versoHtml = nextVerso;
            rectoHtml = nextRecto;
            placed++;
          } else {
            break;
          }
        }

        // guarantee progress: if nothing fit, force-place one passage (oversize passage)
        if (placed === 0) {
          versoHtml = renderPassageZh(queue[i]);
          rectoHtml = renderPassageEn(queue[i]);
          placed = 1;
        }

        pageNo++;
        leaves.push({
          versoHtml,
          rectoHtml,
          juan,
          pageZh: toZhNum(pageNo),
          pageEn: String(pageNo),
        });
        i += placed;
      }
    }
  } finally {
    await browser.close();
  }
  return leaves;
}
```

- [ ] **Step 4: Fix the test import and run**

Ensure `paginate.test.ts` matches Step 1's corrected version (single import of `SAMPLE_CHAPTER` from `./manuscript/sample`). Run:
`node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/paginate.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/epic/paginate.ts scripts/epic/paginate.test.ts
git commit -m "feat(epic): synchronized facing-page pagination engine"
```

---

### Task 10: Build orchestrator — PDF + cover + page-numbered ornaments

**Files:**
- Create: `scripts/epic/build-epic.ts`
- Create: `scripts/epic/build-epic.test.ts`

**Interfaces:**
- Consumes: manuscript loader, `paginate`, `buildHtml`, ornament functions, `chromium`, `sharp`.
- Produces:
  - `async function loadManuscript(dir: string): Promise<{ bible: Bible; chapters: Chapter[] }>`
  - `function composeLeafHtml(leaf: LeafPair, title: { zh: string; en: string }): { verso: string; recto: string }` — wraps each leaf's text with its ornament `<svg>` layer (frame, column rules, center strip with page number) + 绣像/plate insertion handled in the orchestrator.
  - `async function buildEpic(opts: { manuscriptDir: string; outPdf: string; outCover: string }): Promise<{ pages: number }>`
  - CLI entry: running the file builds from `scripts/epic/manuscript/` to `public/library/<slug>.pdf` + cover.

- [ ] **Step 1: Write the failing test (build a tiny 1-chapter PDF to a temp path)**

Create `scripts/epic/build-epic.test.ts`:
```ts
import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEpic } from './build-epic';
import { SAMPLE_CHAPTER } from './manuscript/sample';

test('buildEpic produces a non-empty PDF and a cover image', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'epic-'));
  mkdirSync(join(dir, 'manuscript'), { recursive: true });
  writeFileSync(join(dir, 'manuscript', 'bible.json'), JSON.stringify({
    titleOptions: [{ zh: '天命輓歌', en: 'Elegy of the Mandate' }],
    chosenTitle: { zh: '天命輓歌', en: 'Elegy of the Mandate' },
    synopsis: 's', characters: [], outline: [],
  }));
  writeFileSync(join(dir, 'manuscript', 'ch01.json'), JSON.stringify(SAMPLE_CHAPTER));

  const outPdf = join(dir, 'out.pdf');
  const outCover = join(dir, 'cover.jpg');
  const res = await buildEpic({ manuscriptDir: join(dir, 'manuscript'), outPdf, outCover });

  expect(res.pages).toBeGreaterThanOrEqual(2);
  expect(existsSync(outPdf)).toBe(true);
  expect(statSync(outPdf).size).toBeGreaterThan(1000);
  expect(existsSync(outCover)).toBe(true);
}, 180_000);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/build-epic.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the orchestrator**

Create `scripts/epic/build-epic.ts`:
```ts
import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Bible, Chapter } from './manuscript/types';
import { validateChapter } from './manuscript/validate';
import { paginate } from './paginate';
import { buildHtml } from './render/typeset';
import type { LeafPair } from './render/types';
import { blockFrame, columnRules } from './ornaments/frame';
import { centerStrip } from './ornaments/center-strip';
import { frontispiece, colophon } from './ornaments/plates';

const W = 800, H = 1100;

export async function loadManuscript(dir: string): Promise<{ bible: Bible; chapters: Chapter[] }> {
  const bible = JSON.parse(readFileSync(join(dir, 'bible.json'), 'utf8')) as Bible;
  const files = readdirSync(dir).filter(f => /^ch\d+\.json$/.test(f)).sort();
  const chapters = files.map(f => validateChapter(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
  return { bible, chapters };
}

/** Build the ornament SVG layer for one leaf (frame + rules + center strip). */
function ornamentLayer(side: 'verso' | 'recto', juan: string, title: string, pageLabel: string): string {
  const inner = side === 'verso'
    ? `${blockFrame(W, H)}${columnRules(64, 96, W - 128, H - 176, 12)}${centerStrip({ x: W / 2 - 18, y: 40, w: 36, h: H - 80, title, juan, page: pageLabel })}`
    : `${blockFrame(W, H)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="ornaments" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${inner}</svg>`;
}

export function composeLeafHtml(leaf: LeafPair, title: { zh: string; en: string }) {
  return {
    verso: `${ornamentLayer('verso', leaf.juan, title.zh, leaf.pageZh)}<div class="textbox">${leaf.versoHtml}</div>`,
    recto: `${ornamentLayer('recto', leaf.juan, title.en, leaf.pageEn)}<div class="textbox">${leaf.rectoHtml}</div>`,
  };
}

export async function buildEpic(opts: { manuscriptDir: string; outPdf: string; outCover: string }): Promise<{ pages: number }> {
  const { bible, chapters } = await loadManuscript(opts.manuscriptDir);
  const title = bible.chosenTitle ?? bible.titleOptions[0];

  const leaves = await paginate(chapters);

  // Front matter: frontispiece plate (recto-style single page). Back matter: colophon.
  // Wrap each leaf with ornaments; frontispiece/colophon are standalone full-page svgs.
  const composed = leaves.map(lf => composeLeafHtml(lf, title));
  const leafSections = composed
    .map(c => `<section class="leaf verso">${c.verso}</section><section class="leaf recto">${c.recto}</section>`)
    .join('');

  const frontPlate = `<section class="leaf plate">${frontispiece({ titleZh: title.zh, titleEn: title.en, W, H })}</section>`;
  const backPlate = `<section class="leaf plate">${colophon({ lines: ['歲在丙午', '夢餘堂刊', '頒行於世'], W, H })}</section>`;

  const css = readFileSync(join(__dirname.replace(/dist.*/, ''), 'render/epic.css'), 'utf8');
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${title.zh}</title>
    <style>${css}.leaf.plate{padding:0}.leaf.plate svg{display:block}</style></head>
    <body>${frontPlate}${leafSections}${backPlate}</body></html>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({ path: opts.outPdf, width: `${W}px`, height: `${H}px`, printBackground: true });

    // cover = render the frontispiece alone and screenshot → jpg
    const cover = await browser.newPage({ viewport: { width: W, height: H } });
    await cover.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>${frontispiece({ titleZh: title.zh, titleEn: title.en, W, H })}</body></html>`);
    const png = await cover.screenshot({ type: 'png' });
    await sharp(png).jpeg({ quality: 88 }).toFile(opts.outCover);
  } finally {
    await browser.close();
  }

  // pages = 2 plates + 2 per leaf
  return { pages: leaves.length * 2 + 2 };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const slug = 'elegy-of-the-mandate';
  const root = join(__dirname, '..', '..');
  buildEpic({
    manuscriptDir: join(__dirname, 'manuscript'),
    outPdf: join(root, 'public', 'library', `${slug}.pdf`),
    outCover: join(root, 'public', 'library', 'covers', `${slug}.jpg`),
  }).then(r => console.log(`Built ${r.pages}-page epic → public/library/${slug}.pdf`));
}
```

Note on `__dirname`: with `tsx`, `__dirname` is available in ESM via its shim; if not, replace the CSS-load and root paths using `fileURLToPath(import.meta.url)` as in `typeset.ts`. Verify which works in Step 4 and standardize.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/build-epic.test.ts`
Expected: PASS. If a path error occurs, switch `__dirname` usages to the `fileURLToPath(import.meta.url)` + `dirname()` pattern and re-run.

- [ ] **Step 5: Commit**

```bash
git add scripts/epic/build-epic.ts scripts/epic/build-epic.test.ts
git commit -m "feat(epic): build orchestrator → PDF + cover with ornament layer"
```

---

### Task 11: Content generation — story bible + title selection gate

**Files:**
- Create: `scripts/epic/generate/schemas.ts`
- Create: `scripts/epic/generate/bible.workflow.md` (the Workflow script — see note)
- Create: `scripts/epic/manuscript/bible.json` (output, committed once chosen)

**Interfaces:**
- Produces: `BIBLE_SCHEMA`, `CHAPTER_SCHEMA` (JSON Schema objects matching `types.ts`) for use by the generation workflow.

**Note on execution:** The actual multi-agent generation is run via the **Workflow tool**, not vitest. This task delivers the schemas + a committed bible, and a documented workflow the operator runs. The operator must present the `titleOptions` to the user and write the chosen title into `bible.json` before Task 12.

- [ ] **Step 1: Write the JSON schemas**

Create `scripts/epic/generate/schemas.ts`:
```ts
export const BIBLE_SCHEMA = {
  type: 'object',
  required: ['titleOptions', 'synopsis', 'characters', 'outline'],
  properties: {
    titleOptions: {
      type: 'array', minItems: 3, maxItems: 5,
      items: { type: 'object', required: ['zh', 'en'], properties: { zh: { type: 'string' }, en: { type: 'string' } } },
    },
    synopsis: { type: 'string', minLength: 200 },
    characters: {
      type: 'array', minItems: 4,
      items: { type: 'object', required: ['zh', 'en', 'role', 'source'],
        properties: { zh: { type: 'string' }, en: { type: 'string' }, role: { type: 'string' }, source: { type: 'string' } } },
    },
    outline: {
      type: 'array', minItems: 9, maxItems: 12,
      items: { type: 'object', required: ['n', 'zh', 'en', 'beats'],
        properties: { n: { type: 'number' }, zh: { type: 'string' }, en: { type: 'string' }, beats: { type: 'string' } } },
    },
  },
} as const;

export const CHAPTER_SCHEMA = {
  type: 'object',
  required: ['n', 'title', 'couplet', 'passages'],
  properties: {
    n: { type: 'number' },
    title: { type: 'object', required: ['zh', 'en'], properties: { zh: { type: 'string' }, en: { type: 'string' } } },
    couplet: {
      type: 'object', required: ['type', 'zh', 'en'],
      properties: { type: { const: 'couplet' },
        zh: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' } },
        en: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' } } },
    },
    passages: {
      type: 'array', minItems: 6,
      items: {
        type: 'object', required: ['type'],
        properties: {
          type: { enum: ['heading', 'couplet', 'prose', 'verse'] },
          zh: {}, en: {},
          redComment: { type: 'array', items: { type: 'object', required: ['anchor', 'zh', 'en'],
            properties: { anchor: { type: 'string' }, zh: { type: 'string' }, en: { type: 'string' } } } },
        },
      },
    },
  },
} as const;
```

- [ ] **Step 2: Document the generation workflow**

Create `scripts/epic/generate/bible.workflow.md` describing the Workflow-tool script the operator runs:
```md
# Generation workflow (run via the Workflow tool)

meta: { name: 'epic-bible', phases: [{title:'Bible'}] }

Phase 1 — Bible:
  agent("You are a master of classical Chinese literature. Design an original
  章回体 epic (9–12 回) braiding the Iliad (war over a stolen sacred omen, a
  wrathful champion, a companion's death), Three Kingdoms (sworn-brother oaths,
  warlord stratagems, the Mandate of Heaven), Dream of the Red Chamber (a noble
  house in decline, a garden/dream world of impermanence), and Gilgamesh (after
  the companion's death, a journey to wrest immortality from Heaven and learn its
  price). Return a story bible.", { schema: BIBLE_SCHEMA })

Write the result to scripts/epic/manuscript/bible.json.
Present titleOptions to the user; on their choice, set bible.chosenTitle.
```

- [ ] **Step 3: Run the bible workflow and commit the result**

Operator action (Workflow tool): run the `epic-bible` workflow, write `scripts/epic/manuscript/bible.json`, present the 3–5 `titleOptions` to the user, set `chosenTitle`. Then:
```bash
git add scripts/epic/generate/ scripts/epic/manuscript/bible.json
git commit -m "feat(epic): generation schemas + story bible (title chosen)"
```

---

### Task 12: Content generation — chapters (per-回 pipeline) and assembly

**Files:**
- Create: `scripts/epic/generate/chapters.workflow.md`
- Create: `scripts/epic/manuscript/ch01.json … chNN.json` (outputs)
- Create: `scripts/epic/generate/assemble.test.ts` (continuity guard)

**Interfaces:**
- Consumes: `bible.json`, `CHAPTER_SCHEMA`, `validateChapter`.
- Produces: validated `chNN.json` for every outline entry; an assembly test asserting all chapters validate, numbering is contiguous, and total length is on target.

- [ ] **Step 1: Document the chapter pipeline**

Create `scripts/epic/generate/chapters.workflow.md`:
```md
# Chapter pipeline (run via the Workflow tool)

meta: { name: 'epic-chapters', phases: [{title:'Draft'},{title:'Translate'},{title:'Edit'},{title:'Comment'}] }

Load bible.json. pipeline(outline, …):
  1. Draft  — agent drafts 回 n in classical Chinese: 回目 couplet + alternating
              prose and verse passages (target ~900–1300 Chinese chars/回 so the
              book reaches ~100 pages across 9–12 回 with facing English).
  2. Translate — agent renders faithful, literary English for every passage,
                 preserving verse line counts (zh.length === en.length).
  3. Edit   — continuity/style pass against the bible (names, timeline).
  4. Comment— add 1–3 脂批-style redComment notes + mark 1–2 圈点 anchors per 回.
  Return validated CHAPTER_SCHEMA JSON; write to manuscript/chNN.json.
```

- [ ] **Step 2: Write the assembly/continuity guard test**

Create `scripts/epic/generate/assemble.test.ts`:
```ts
import { test, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateChapter } from '../manuscript/validate';

const MS = join(__dirname, '..', 'manuscript');

test.runIf(existsSync(join(MS, 'ch01.json')))('all chapters validate and number contiguously', () => {
  const files = readdirSync(MS).filter(f => /^ch\d+\.json$/.test(f)).sort();
  expect(files.length).toBeGreaterThanOrEqual(9);
  const chapters = files.map(f => validateChapter(JSON.parse(readFileSync(join(MS, f), 'utf8'))));
  chapters.forEach((c, i) => expect(c.n).toBe(i + 1));
  const totalZh = chapters.reduce((s, c) => s + c.passages.reduce((t, p: any) =>
    t + (Array.isArray(p.zh) ? p.zh.join('').length : (p.zh?.length ?? 0)), 0), 0);
  expect(totalZh).toBeGreaterThan(8000); // enough text for ~100 pages
});
```

- [ ] **Step 3: Run the chapter workflow, write outputs, run the guard**

Operator action (Workflow tool): run `epic-chapters`, writing `manuscript/chNN.json` for each 回. Then:
`node_modules/.bin/vitest run --config vitest.epic.config.ts scripts/epic/generate/assemble.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/epic/generate/ scripts/epic/manuscript/ch*.json
git commit -m "feat(epic): all chapters generated, translated, edited, commented"
```

---

### Task 13: Build the real book and integrate into the Library

**Files:**
- Modify: `data/library-metadata.json` (add one entry)
- Create: `public/library/<slug>.pdf` (build output)
- Create: `public/library/covers/<slug>.jpg` (build output)

**Interfaces:**
- Consumes: `buildEpic` CLI, `data/library-metadata.json` (consumed by `lib/library/library.ts`).
- Produces: the book on the shelf + reader, no app code changes.

- [ ] **Step 1: Build the full book**

Run: `node_modules/.bin/tsx scripts/epic/build-epic.ts`
Expected: console prints `Built <N>-page epic …`; the PDF and cover exist:
```bash
ls -la public/library/elegy-of-the-mandate.pdf public/library/covers/elegy-of-the-mandate.jpg
```
Expected: both present; PDF size > 200 KB; page count near 100 (`N` ≈ 100). If far below 100, increase per-回 length target in the chapter workflow and regenerate Task 12.

- [ ] **Step 2: Add the metadata entry**

Edit `data/library-metadata.json`, adding (use the chosen slug/title; `pages` = N from Step 1):
```json
"elegy-of-the-mandate.pdf": {
  "title": "天命輓歌 · Elegy of the Mandate",
  "description": "An original bilingual Chinese epic braiding the Iliad, the Three Kingdoms, Dream of the Red Chamber, and Gilgamesh — a fallen house, a war over a stolen omen, sworn-brother oaths, and a journey to wrest immortality from Heaven. Vertical 竖排 Chinese facing an English translation, set as a classical 古籍 woodblock edition.",
  "pages": 100,
  "cover": "elegy-of-the-mandate.jpg"
}
```

- [ ] **Step 3: Verify the library resolves the book**

Run:
```bash
node_modules/.bin/tsx -e "import('./lib/library/library.ts').then(m=>{const b=m.getLibraryBook('elegy-of-the-mandate'); console.log(b?.title, b?.pages, b?.coverUrl);})"
```
Expected: prints the title, page count, and `/library/covers/elegy-of-the-mandate.jpg`.

- [ ] **Step 4: Visual spot-check in the reader**

Start the app dev server (this is a manual/human check — `pnpm run dev` will dirty `pnpm-lock.yaml`; do not commit that), open the Library, confirm the cover appears and the 3D reader shows facing zh│en spreads (desktop two-up; mobile single). Note any layout issues for follow-up.

- [ ] **Step 5: Full test sweep**

Run: `node_modules/.bin/vitest run --config vitest.epic.config.ts`
Expected: all epic tests PASS.

- [ ] **Step 6: Commit**

```bash
git add data/library-metadata.json public/library/elegy-of-the-mandate.pdf public/library/covers/elegy-of-the-mandate.jpg
git commit -m "feat(epic): build the epic and add it to the Library"
```

---

## Self-Review

**Spec coverage:**
- Premise/four-source braid → Tasks 11–12 (bible + chapters). ✓
- 章回体 prose+verse+couplets → manuscript model (Task 2), renderer (Task 8), chapter pipeline (Task 12). ✓
- ~100 pages → length targets in Task 12; verified in Task 13 Step 1. ✓
- 古籍 woodblock aesthetic → ornaments (Tasks 3–7), CSS (Task 8). ✓
- Facing zh-verso / en-recto, synced → pagination (Task 9), page order in build (Task 10). ✓
- Vertical 竖排 + 界行 + 版心/鱼尾 → CSS (Task 8), frame/center-strip (Tasks 3–4). ✓
- 脂批 red commentary + 圈点 → model (Task 2), CSS + render (Task 8), comment pass (Task 12). ✓
- Procedural SVG + full plates → Tasks 3–7. ✓
- Title options chosen first → Task 11 gate. ✓
- scripts/ location, data-only integration → all under scripts/epic/, Task 13. ✓
- Testing (ornament validity, pagination invariant, build smoke, visual) → Tasks 3–10, 13. ✓

**Placeholder scan:** The `fretCell` stub in Task 6 is explicitly flagged for deletion in Step 4 of that task — not a lingering placeholder. The `paginate.test.ts` bad import in Task 9 Step 1 is explicitly corrected in the same step. No "TBD"/"add error handling"/etc.

**Type consistency:** `Chapter`, `Passage`, `RedNote`, `Bible`, `LeafPair` defined in Tasks 2/8 and used consistently in Tasks 9–13. `validateChapter`, `paginate`, `buildHtml`, `buildEpic`, `composeLeafHtml`, ornament signatures match across consumers. Schemas in Task 11 mirror `types.ts`.

## Risks (carried from the spec)

- **CJK font embedding** in Chromium PDF — verify glyphs embed; fallback: bundle Noto Serif CJK and reference it via `@font-face` in `epic.css`.
- **Reaching ~100 pages** depends on generated length — tunable via Task 12 target + verified in Task 13.
- **竖排 overflow edge cases** (a single oversize passage) — handled by the force-place guard in `paginate`.
