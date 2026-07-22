import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §16.2 — the "global website design scheme" as an EXECUTABLE gate.
 *
 * The owner's recurring complaint through Phases G–L was that tab strips kept
 * drifting apart — each surface hand-rolling its own capsule/underline markup and
 * "converging styling on custom markup" instead of using one component. This test
 * turns the convergence into CI enforcement: a static source scan over
 * `components/` + `app/routes/` that FAILS when new drift appears, so future work
 * can't reintroduce a bespoke tab strip past review.
 *
 * Three rules (each failure prints the offending file:line + this pointer):
 *   1. `role="tablist"` may only live in the shared renderer
 *      (`components/ui/liquid-tabs.tsx`). Everything else must ride `LiquidTabs`.
 *   2. No underline-active-tab pattern: an element with `aria-selected` must not
 *      also carry a `border-b*` / `underline` marker (the §5.45 sheets obsoleted
 *      underline tabs — the active state is the flowing capsule, never a rule).
 *   3. Tab-capsule `layoutId` props may only live in sanctioned files — the
 *      renderer plus the sidebar's flowing nav capsule. Any other inline
 *      `layoutId` capsule is a hand-rolled tab strip that should be `LiquidTabs`.
 *
 * These are SOURCE checks (no build) so they run in the normal suite and fail the
 * moment someone re-forks a tab strip.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['components', join('app', 'routes')];
const POINTER =
  'Use the shared <LiquidTabs> renderer (components/ui/liquid-tabs.tsx). See the ' +
  'liquid-glass v2 plan §16.2 (one tablist renderer + enforcement).';

/** The single sanctioned tablist renderer. */
const RENDERER = join('components', 'ui', 'liquid-tabs.tsx');

/**
 * Rule 1 allowlist — the ONLY `role="tablist"` usages permitted outside the
 * renderer, each an intentional, documented exception (NOT a capsule tab strip):
 *  - AlbumViewer's thumbnail filmstrip: a media carousel that navigates SLIDES
 *    via the WAI-ARIA tabs pattern (thumbnails, not label pills) — LiquidTabs
 *    renders text tabs, so it does not model an image filmstrip.
 *  - RMHLadder's admin review filter: the RMHLadder tooling uses its own
 *    deliberately-separate blueprint/industrial design system (monospace, brass
 *    hairlines — see rmhladder.css), not the liquid-glass site grammar; forcing
 *    it onto glass pills would make it INCONSISTENT with the rest of that app.
 * New tablists get NO entry here — they must use LiquidTabs.
 */
const TABLIST_ALLOW = new Set([
  RENDERER,
  join('components', 'library', 'AlbumViewer.tsx'),
  join('app', 'routes', '_site', 'rmhladder', 'review.tsx'),
]);

/**
 * Rule 3 allowlist — files permitted to host an inline tab/nav-capsule `layoutId`
 * (the flowing glass capsule, §5.47):
 *  - the renderer itself, and
 *  - the left sidebar's active nav capsule (`LeftSidebar.tsx`), a sanctioned
 *    §5.47 flowing capsule that is a vertical NAV rail, not a tab strip.
 */
const LAYOUTID_ALLOW = new Set([RENDERER, join('components', 'feed', 'LeftSidebar.tsx')]);

/** Recursively collect production `.tsx` sources (skip generated + test files). */
function collectTsx(dir: string, out: string[] = []): string[] {
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
      collectTsx(rel, out);
    } else if (
      entry.name.endsWith('.tsx') &&
      !entry.name.endsWith('.test.tsx') &&
      entry.name !== 'routeTree.gen.ts'
    ) {
      out.push(rel);
    }
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap((d) => collectTsx(d));

/** 1-based line number for a source-string index. */
function lineAt(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

/**
 * The opening JSX tag that encloses `idx` — from the nearest preceding `<` to the
 * first `>` at brace-depth 0 (so `=>` and `>` inside `{…}` attribute expressions
 * don't close the tag early). Used to test co-occurrence WITHIN one element.
 */
function enclosingTag(src: string, idx: number): string {
  let start = idx;
  while (start > 0 && src[start] !== '<') start--;
  let depth = 0;
  let end = idx;
  for (let i = idx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth <= 0) {
      end = i;
      break;
    }
    end = i;
  }
  return src.slice(start, end + 1);
}

type Violation = { file: string; line: number; detail: string };

function scanAll(): { tablist: Violation[]; underline: Violation[]; layoutId: Violation[] } {
  const tablist: Violation[] = [];
  const underline: Violation[] = [];
  const layoutId: Violation[] = [];

  // A bottom-border marker (border-b / -2 / -4 / -[..]) but NOT border-b-0.
  const borderBottom = /\bborder-b(?!-0)(?:-(?:2|4|\[[^\]]*\]))?(?![\w-])/;
  // An `underline` utility used as a marker — excludes no-underline / hover: etc.
  const underlineUtil = /(?<![\w:-])underline\b/;
  const ariaSelected = /aria-selected/g;
  const roleTablist = /role=(["'])tablist\1/g;
  const layoutIdProp = /\blayoutId\s*=\s*[{"]/g;

  for (const file of FILES) {
    const src = readFileSync(join(ROOT, file), 'utf8');

    if (!TABLIST_ALLOW.has(file)) {
      let m: RegExpExecArray | null;
      while ((m = roleTablist.exec(src))) {
        tablist.push({ file, line: lineAt(src, m.index), detail: 'role="tablist"' });
      }
    }

    if (!LAYOUTID_ALLOW.has(file)) {
      let m: RegExpExecArray | null;
      while ((m = layoutIdProp.exec(src))) {
        layoutId.push({ file, line: lineAt(src, m.index), detail: 'inline tab-capsule layoutId=' });
      }
    }

    let m: RegExpExecArray | null;
    while ((m = ariaSelected.exec(src))) {
      const tag = enclosingTag(src, m.index);
      const marker = borderBottom.test(tag) ? 'border-b' : underlineUtil.test(tag) ? 'underline' : null;
      if (marker) {
        underline.push({
          file,
          line: lineAt(src, m.index),
          detail: `aria-selected co-occurs with ${marker} (underline-active-tab antipattern)`,
        });
      }
    }
  }
  return { tablist, underline, layoutId };
}

function report(label: string, v: Violation[]): string {
  return (
    `\n${label} (${v.length}):\n` +
    v.map((x) => `  ${x.file}:${x.line} — ${x.detail}`).join('\n') +
    `\n\n${POINTER}\n`
  );
}

describe('design consistency — one tab-strip grammar (§16.2)', () => {
  const { tablist, underline, layoutId } = scanAll();

  it('scans a non-trivial set of production sources', () => {
    // Guards the walker itself — a broken path would make every rule vacuously pass.
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES).toContain(RENDERER);
  });

  it('role="tablist" lives only in LiquidTabs (+ documented allowlist)', () => {
    expect(tablist, report('Stray role="tablist"', tablist)).toEqual([]);
  });

  it('no aria-selected element also carries a border-b / underline marker', () => {
    expect(underline, report('Underline-active-tab pattern', underline)).toEqual([]);
  });

  it('tab-capsule layoutId props live only in sanctioned files', () => {
    expect(layoutId, report('Ad-hoc tab-capsule layoutId', layoutId)).toEqual([]);
  });
});
