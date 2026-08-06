import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The full-screen tier's viewport contract, as an EXECUTABLE gate.
 *
 * Companion to `design-consistency.test.ts`, which polices the SITE tier's tab
 * grammar. This one polices the thirty full-screen games and apps, where the
 * recurring failure is not visual drift but content that ends up somewhere the
 * player cannot reach — off the side of a phone, under a notch, above a scroll
 * origin. Each rule below corresponds to a defect that was actually shipped, and
 * exists so the same shape cannot come back past review.
 *
 * The rules are chosen for a near-zero false-positive rate: each matches a
 * combination that is wrong in every context, not merely suspicious in some.
 * Anything needing judgement is in MANUAL REVIEW at the bottom instead.
 *
 * ── Rule 1 — centre + scroll must be SAFE centring ─────────────────────────
 * `align-items: center` on a container whose content is taller than it does not
 * overflow downward: it overflows past BOTH edges, and the part above the top is
 * unreachable because scroll offsets cannot go negative. Adding `overflow-y:
 * auto` does not rescue it. Twenty-three containers across the games had exactly
 * this, so on a landscape handset the top of a pause menu, an upgrade draft or a
 * results card was simply gone. Tailwind's `items-center-safe` /
 * `justify-center-safe` (and CSS `align-items: safe center`) centre while the
 * content fits and fall back to start alignment when it does not.
 *
 * ── Rule 2 — `aspect-ratio` may not be paired with a clamp on the other axis ─
 * `aspect-ratio` only DERIVES the axis left `auto`. Give a box a definite width
 * and a `max-height` and the clamp shortens it without narrowing it — the ratio
 * silently breaks. `width + height + aspectRatio` is worse: with both axes
 * definite the ratio is ignored outright, which is how House Always Wins' 400x256
 * pixel art came to render at 390x768 on a portrait phone. Use `.app-stage`
 * (app/globals.css), which states the fit in container-query units where there is
 * nothing left to clamp.
 *
 * ── Rule 3 — a game surface sized in `vh` must offer a `dvh`/`svh` reading ───
 * On a phone `100vh` is the LARGEST viewport — the height the page only has once
 * the browser toolbars have scrolled away. A non-scrolling app shell sized that
 * way puts its bottom chrome under the toolbar until the user scrolls, which in a
 * game is never. The convention here is the fallback PAIR: the `vh` line for
 * engines that do not parse the newer units, immediately followed by the `dvh`
 * (live viewport) or `svh` (smallest viewport) line that wins everywhere else.
 */

const ROOT = process.cwd();

/**
 * The full-screen tier: every game and app that owns its whole viewport, plus
 * the shared primitives they are built from. Deliberately explicit rather than
 * "all of components/" — the site tier scrolls the document, where centring
 * cannot strand anything and `vh` costs nothing.
 */
const FULLSCREEN_DIRS = [
  'altair',
  'breakpoint',
  'cookgame',
  'cursed-logic',
  'daily-puzzles',
  'dream-rift',
  'forest-explorer',
  'gabriels-horn',
  'house-always-wins',
  'isleworks',
  'kowloon-knockout',
  'laundry-sort',
  'lights-out',
  'massive-march',
  'neon-driftway',
  'nightrail',
  'rmh-farming-sim',
  'rmhbox',
  'rmhcalculator',
  'rmhmusic',
  'rmhstudy',
  'rmhtube',
  'rmhtype',
  'shared',
  'signal-forge',
  'slice-it',
  'studio',
  'synapse-storm',
  'temple-of-joy',
  'velum2099',
  'versecraft',
  'void-breaker',
].map((d) => join('components', d));

const POINTER =
  'See app/globals.css §"Full-screen app/game layout helpers" (.app-viewport, ' +
  '.app-screen, .app-stage-fit/.app-stage, .app-hud) and ' +
  'docs/design-language.md §"The full-screen viewport contract".';

/** Recursively collect sources of the given extensions under `dir`. */
function collect(dir: string, exts: string[], out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      collect(rel, exts, out);
    } else if (
      exts.some((e) => entry.name.endsWith(e)) &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.test.ts')
    ) {
      out.push(rel);
    }
  }
  return out;
}

const TSX = FULLSCREEN_DIRS.flatMap((d) => collect(d, ['.tsx', '.ts']));
const CSS = [...FULLSCREEN_DIRS.flatMap((d) => collect(d, ['.css'])), join('app', 'globals.css')];

/** 1-based line number for a source-string index. */
function lineAt(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

type Violation = { file: string; line: number; detail: string };

function report(label: string, v: Violation[]): string {
  return (
    `\n${label} (${v.length}):\n` +
    v.map((x) => `  ${x.file}:${x.line} — ${x.detail}`).join('\n') +
    `\n\n${POINTER}\n`
  );
}

// ── Rule 1 ──────────────────────────────────────────────────────────────────

/**
 * Every `className` value in a source, with its offset.
 *
 * Deliberately anchored to `className=` rather than scanning string literals
 * generally: an apostrophe in prose ("the browser's graphics", "you're away")
 * opens a literal to a naive scanner, which then swallows the code between it
 * and the next apostrophe and reports whatever classes it finds in there. That
 * produced eight confident false positives on the first run of this rule.
 *
 * Two forms are read — `className="…"` and `className={…}` (from which every
 * quoted segment is taken, covering `cn(…)`, template literals and ternaries).
 * A class string built somewhere else and passed in as a variable is invisible
 * here, which is the accepted blind spot: the alternative is a JSX parser.
 */
function classNameValues(src: string): { text: string; index: number }[] {
  const out: { text: string; index: number }[] = [];
  const re = /className\s*=\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    if (src[i] === '"' || src[i] === "'") {
      const quote = src[i];
      const end = src.indexOf(quote, i + 1);
      if (end === -1) continue;
      out.push({ text: src.slice(i + 1, end), index: m.index });
      continue;
    }
    if (src[i] !== '{') continue;
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const expr = src.slice(start, i + 1);
    // Every quoted segment inside the expression, concatenated: an element's
    // classes are the union of its branches, and a conditional `overflow-y-auto`
    // paired with an unconditional `items-center` is exactly as broken.
    const parts = expr.match(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g) ?? [];
    out.push({ text: parts.join(' '), index: m.index });
  }
  return out;
}

function centringViolations(): Violation[] {
  const out: Violation[] = [];

  for (const file of TSX) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const { text, index } of classNameValues(src)) {
      const scrolls = /\boverflow-(y-)?auto\b|\boverflow-(y-)?scroll\b/.test(text);
      if (!scrolls) continue;
      // `-safe` variants are the fix; a class string that already has them for
      // the axis it centres on is compliant.
      const unsafeItems = /\bitems-center\b(?!-safe)/.test(text);
      const unsafeJustify = /\bjustify-center\b(?!-safe)/.test(text);
      if (!unsafeItems && !unsafeJustify) continue;
      // `flex`/`grid` only — `items-center` on a non-flex element is inert.
      if (!/\b(flex|grid)\b/.test(text)) continue;
      out.push({
        file,
        line: lineAt(src, index),
        detail: `scrolling container centres with ${
          unsafeItems ? 'items-center' : 'justify-center'
        } — use the -safe variant so overflow stays reachable`,
      });
    }
  }

  for (const file of CSS) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const re = /([.#][^{}]*?)\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const body = m[2];
      if (!/overflow(-y)?:\s*(auto|scroll)/.test(body)) continue;
      if (!/display:\s*(inline-)?(flex|grid)/.test(body)) continue;
      if (/safe\s+center/.test(body)) continue;
      const column = /flex-direction:\s*column/.test(body);
      const centred = column
        ? /justify-content:\s*center/.test(body)
        : /align-items:\s*center/.test(body);
      if (!centred) continue;
      out.push({
        file,
        line: lineAt(src, m.index),
        detail: `${m[1].trim()} scrolls but centres on the block axis — use \`safe center\``,
      });
    }
  }

  return out;
}

// ── Rule 2 ──────────────────────────────────────────────────────────────────

/** The object literal enclosing `idx`, from its `{` to the matching `}`. */
function enclosingObject(src: string, idx: number): string {
  let start = idx;
  let depth = 0;
  for (let i = idx; i >= 0; i--) {
    if (src[i] === '}') depth++;
    else if (src[i] === '{') {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

function aspectViolations(): Violation[] {
  const out: Violation[] = [];
  for (const file of TSX) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const re = /\baspectRatio\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const obj = enclosingObject(src, m.index);
      const clamped = /\bmaxHeight\s*:/.test(obj) || /\bmaxWidth\s*:/.test(obj);
      const bothAxes = /\bwidth\s*:/.test(obj) && /\bheight\s*:/.test(obj);
      if (!clamped && !bothAxes) continue;
      out.push({
        file,
        line: lineAt(src, m.index),
        detail: bothAxes
          ? 'aspectRatio with BOTH width and height definite — the ratio is ignored entirely'
          : 'aspectRatio beside a max-width/max-height clamp — the clamp breaks the ratio',
      });
    }
  }
  return out;
}

// ── Rule 3 ──────────────────────────────────────────────────────────────────

function viewportUnitViolations(): Violation[] {
  const out: Violation[] = [];
  for (const file of CSS) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      const m = /(min-height|max-height|height)\s*:\s*100vh\s*;/.exec(line);
      if (!m) return;
      // The convention is the fallback PAIR: this `vh` line, then the same
      // property in `dvh`/`svh` immediately after. Look a few lines ahead so an
      // explanatory comment between the two is allowed, and match the unit
      // anywhere in the value — the live-viewport line is often an expression
      // (`calc(100dvh - var(--kb-inset, 0px))`), not a bare length.
      const ahead = lines.slice(i + 1, i + 8).join('\n');
      if (new RegExp(`${m[1]}\\s*:[^;]*100(dvh|svh|lvh)`).test(ahead)) return;
      out.push({
        file,
        line: i + 1,
        detail: `${m[1]}: 100vh with no dvh/svh line after it — on a phone this is the LARGEST viewport`,
      });
    });
  }
  return out;
}

describe('full-screen viewport contract — games and apps', () => {
  it('scans a non-trivial set of full-screen sources', () => {
    // Guards the walkers themselves: a bad path would make every rule below
    // pass vacuously, which is the failure mode of this kind of test.
    expect(TSX.length).toBeGreaterThan(200);
    expect(CSS.length).toBeGreaterThan(10);
    expect(CSS).toContain(join('app', 'globals.css'));
  });

  it('a scrolling container never centres unsafely (overflow stays reachable)', () => {
    const v = centringViolations();
    expect(v, report('Unsafe centring in a scrolling container', v)).toEqual([]);
  });

  it('aspect-ratio is never paired with a clamp that would break it', () => {
    const v = aspectViolations();
    expect(v, report('aspect-ratio defeated by a definite/clamped axis', v)).toEqual([]);
  });

  it('every 100vh game surface offers a dvh/svh reading too', () => {
    const v = viewportUnitViolations();
    expect(v, report('Raw 100vh with no live-viewport fallback', v)).toEqual([]);
  });
});

/**
 * MANUAL REVIEW — real rules with no low-false-positive grep behind them.
 *
 *  1. **Edge-pinned chrome carries the device insets.** Anything a game pins to
 *     a viewport edge — a pause button, a thumbstick, a score readout, a
 *     persistent player bar — must add `var(--safe-top|right|bottom|left)` to its
 *     offset, or sit inside an `.app-hud` / `.app-hud-fixed` layer that already
 *     has. Not checkable: `absolute top-3 right-3` is correct inside a card and
 *     wrong on the window, and the class string cannot tell you which it is.
 *     Landscape is the case to picture — that is where the notch takes a long
 *     edge, and it is the orientation most of these games are played in.
 *
 *  2. **A full-screen canvas clamps its device-pixel ratio.** Fill rate scales
 *     with the SQUARE of the ratio, so a 3x phone rendering at native asks for
 *     nine times the pixels of a 1x screen, sixty times a second. 2D surfaces go
 *     through `gameSurfaceDpr()` (lib/display-scale.ts); 3D surfaces through the
 *     tier system (lib/render/tier.ts). Whatever a canvas sizes its BUFFER with
 *     must also be what it renders with — sizing from a clamped ratio while
 *     drawing at the raw one scales the whole scene.
 *
 *  3. **Nothing reallocates a canvas per frame.** Assigning `canvas.width`
 *     reallocates the backing store; inside a rAF loop that is a per-frame cost
 *     paid to reach the size it already had. Resize on change only — and add the
 *     explicit `clearRect` the assignment used to be doing for you.
 *
 *  4. **A shell with text entry subtracts `--kb-inset`.** A surface that is
 *     exactly viewport-height and cannot scroll gives the engine no way to
 *     reveal a focused field, so it pans and scales the page instead — which
 *     players report as the app zooming when they try to type. Any full-screen
 *     surface a keyboard can appear over sizes itself
 *     `calc(100dvh - var(--kb-inset, 0px))` and mounts `useKeyboardInset`
 *     (`AppShell` already does, for the whole app tier). Not checkable: whether
 *     a given shell ever hosts a text field is a question about its subtree, not
 *     about the rule that sizes it.
 */
