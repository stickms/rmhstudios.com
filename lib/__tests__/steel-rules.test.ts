/**
 * Steel dividers gate (docs/superpowers/specs/2026-11-24-steel-dividers-design.md, S7-S11): a site-tier page sets its
 * groups off with 1px rules, not with bordered boxes.
 *
 * A violation is one of three source shapes, on a site-tier `.tsx` file under `components/`, `features/` or
 * `app/routes/`:
 *  - a bordered group box: a class string with an all-sides `border` and a `rounded-site` (or `rounded-md/lg/xl`)
 *    and no control, picture or overlay marker (see `isControlOrPicture`);
 *  - a retired surface role: `surface-card` or `surface-panel` in a class string;
 *  - the retired wrapper: an import of `components/ui/card`.
 *
 * The frozen violators live in `steel-rules-baseline.ts`, each with the wave that removes it. The gate is a ratchet: a
 * file in the baseline may not gain a violation (it is not re-listed), a file not in the baseline may not have one, and
 * an entry whose file is clean must leave the list. Run `STEEL_RULES_UPDATE=1 pnpm exec vitest run
 * lib/__tests__/steel-rules.test.ts` to print the current violating files when regenerating the baseline.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isSiteTier } from '../../eslint-local-rules/design-scope.js';
import { STEEL_RULES_BASELINE } from './steel-rules-baseline';

const ROOT = process.cwd();
const SCAN_DIRS = ['components', 'features', join('app', 'routes')];

/** The pointer every violation prints: the shared primitives and the spec that defines them. */
const POINTER =
  'Use Section / Columns / Cells / Notice / Definitions from ' +
  join('components', 'ui', 'rules.tsx') +
  ', plan S7-S11 (' +
  join('docs', 'superpowers', 'specs', '2026-11-24-steel-dividers-design.md') +
  ').';

export type SteelRuleKind = 'bordered-group-box' | 'retired-surface-role' | 'card-import';

export interface SteelRuleViolation {
  file: string;
  line: number;
  kind: SteelRuleKind;
  detail: string;
}

/** Tags whose border is the control itself (or a picture, or a dialog), not a group box. */
const CONTROL_TAGS = new Set(['Button', 'Input', 'Select', 'Textarea', 'button', 'input', 'select', 'textarea', 'img']);
const OVERLAY_TAG_PREFIXES = ['Dialog', 'Popover', 'Menu'];

/** A class token, optionally behind variant prefixes (`md:`, `hover:`, `[&>*]:`). */
const token = (name: string) => new RegExp(`(?:^|\\s)(?:\\S*:)*${name}(?![\\w-])`);
const BORDER_ALL = token('border');
const ROUNDED = /(?:^|\s)(?:\S*:)*rounded-(?:site|md|lg|xl)(?![\w-])/;
const RETIRED_ROLE = /(?:^|\s)(?:\S*:)*surface-(?:card|panel)(?![\w-])/;
const CONTROL_MARKERS = [
  /(?:^|\s)(?:\S*:)*bg-site-surface(?![\w-])/,
  /(?:^|\s)(?:\S*:)*bg-site-bg-subtle(?![\w-])/,
  token('surface-field'),
  token('surface-overlay'),
  /(?:^|\s)(?:\S*:)*aspect-/,
  /(?:^|\s)(?:\S*:)*size-\d/,
];
const FIXED_H = /(?:^|\s)(?:\S*:)*h-\d/;
const FIXED_W = /(?:^|\s)(?:\S*:)*w-\d/;

/** True when the class string carries a marker that makes its border a control, a picture or an overlay. */
function isControlOrPicture(classes: string): boolean {
  if (CONTROL_MARKERS.some((re) => re.test(classes))) return true;
  return FIXED_H.test(classes) && FIXED_W.test(classes);
}

/** True when the element is a control, a picture or an overlay by its tag name. */
function isControlTag(tag: string): boolean {
  const name = /^<([A-Za-z][\w.]*)/.exec(tag)?.[1] ?? '';
  return CONTROL_TAGS.has(name) || OVERLAY_TAG_PREFIXES.some((p) => name.startsWith(p));
}

/** 1-based line number for a source index. */
function lineAt(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

/**
 * The opening JSX tag that encloses `idx`: from the nearest preceding `<` to the first `>` at brace-depth 0. Same helper
 * as design-consistency.test.ts, so `=>` inside an attribute expression does not end the tag early.
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

/** Blank comments in place (newlines kept, so line numbers hold). `://` in a URL is not a comment. */
function stripComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:\\])\/\/[^\n]*/g, (m, pre: string) => pre + blank(m.slice(pre.length)));
}

const STRING_LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

/**
 * The site-tier scanner, a pure function of one file's source. `file` is only used to label the violations.
 * Exported so the gate's own rules are unit-tested on inline snippets.
 */
export function scanSteelRules(src: string, file: string): SteelRuleViolation[] {
  const code = stripComments(src);
  const out: SteelRuleViolation[] = [];

  for (const m of code.matchAll(STRING_LITERAL)) {
    const value = m[1] ?? m[2] ?? m[3] ?? '';
    const idx = m.index ?? 0;
    if (!ROUNDED.test(value) || !BORDER_ALL.test(value)) {
      // Not a bordered radius box, but it may still be a retired role.
      if (RETIRED_ROLE.test(value)) {
        out.push({
          file,
          line: lineAt(code, idx),
          kind: 'retired-surface-role',
          detail: 'surface-card / surface-panel is retired on the site tier',
        });
      }
      continue;
    }
    if (isControlOrPicture(value) || isControlTag(enclosingTag(code, idx))) {
      if (RETIRED_ROLE.test(value)) {
        out.push({
          file,
          line: lineAt(code, idx),
          kind: 'retired-surface-role',
          detail: 'surface-card / surface-panel is retired on the site tier',
        });
      }
      continue;
    }
    out.push({
      file,
      line: lineAt(code, idx),
      kind: 'bordered-group-box',
      detail: 'bordered group box (border + rounded radius, no control, picture or overlay marker)',
    });
  }

  for (const m of code.matchAll(/import\s[^;]*?from\s+['"][^'"]*\/ui\/card['"]/g)) {
    out.push({
      file,
      line: lineAt(code, m.index ?? 0),
      kind: 'card-import',
      detail: 'imports the retired components/ui/card wrapper',
    });
  }

  return out.sort((a, b) => a.line - b.line);
}

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
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') && entry.name !== 'routeTree.gen.ts') {
      out.push(rel);
    }
  }
  return out;
}

const SITE_FILES = SCAN_DIRS.flatMap((d) => collectTsx(d)).filter(isSiteTier);

/** Violations by file, for the whole site tier. */
function scanAll(): Map<string, SteelRuleViolation[]> {
  const byFile = new Map<string, SteelRuleViolation[]>();
  for (const file of SITE_FILES) {
    const v = scanSteelRules(readFileSync(join(ROOT, file), 'utf8'), file);
    if (v.length) byFile.set(file, v);
  }
  return byFile;
}

describe('scanSteelRules (the scanner itself)', () => {
  it('flags a bordered group box', () => {
    const v = scanSteelRules('<div className="border rounded-site p-4">x</div>', 'x.tsx');
    expect(v.map((r) => r.kind)).toEqual(['bordered-group-box']);
  });

  it('does not flag a bordered Button', () => {
    const v = scanSteelRules('<Button className="border rounded-site">Save</Button>', 'x.tsx');
    expect(v).toEqual([]);
  });

  it('does not flag a bordered picture on the bg-site-bg-subtle placeholder', () => {
    const v = scanSteelRules('<div className="border rounded-site bg-site-bg-subtle aspect-video" />', 'x.tsx');
    expect(v).toEqual([]);
  });
});

describe('steel rules on the site tier', () => {
  it('scans a non-trivial set of site-tier sources', () => {
    expect(SITE_FILES.length).toBeGreaterThan(200);
    expect(SITE_FILES).toContain(join('components', 'feed', 'PageLayout.tsx'));
  });

  it('every violation is in STEEL_RULES_BASELINE (no new bordered group boxes, retired roles or ui/card imports)', () => {
    const offenders: string[] = [];
    for (const [file, violations] of scanAll()) {
      if (STEEL_RULES_BASELINE[file] !== undefined) continue;
      for (const v of violations) {
        offenders.push(`${file}:${v.line} ${v.kind}: ${v.detail}. ${POINTER}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every baseline entry still violates (a clean file leaves the list)', () => {
    const byFile = scanAll();
    const stale = Object.keys(STEEL_RULES_BASELINE).filter((file) => !byFile.has(file));
    expect(stale, `Remove these from steel-rules-baseline.ts (they are clean now): ${stale.join(', ')}`).toEqual([]);
  });

  it('every baseline entry names a wave', () => {
    const bad = Object.entries(STEEL_RULES_BASELINE).filter(([, wave]) => !/^wave \d+$/.test(wave));
    expect(bad).toEqual([]);
  });

  it('prints the violating files when STEEL_RULES_UPDATE=1 (baseline regeneration only)', () => {
    if (process.env.STEEL_RULES_UPDATE !== '1') return;
    const lines = [...scanAll().keys()].sort().map((f) => `STEEL_RULES_FILE ${f}`);
    console.log(lines.join('\n'));
  });
});

describe('steel rules in the stylesheet', () => {
  it('.rule-notice is the only selector in steel-rules.css with a 2px border', () => {
    const css = readFileSync(join(ROOT, 'app', 'styles', 'steel-rules.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = (m[1] ?? '').trim();
      const body = m[2] ?? '';
      const twoPxBorder = /(?:^|;)\s*border[\w-]*\s*:[^;]*\b2px\b/m.test(body);
      if (twoPxBorder && selector !== '.rule-notice') offenders.push(selector);
    }
    expect(offenders).toEqual([]);
    expect(css).toMatch(/\.rule-notice\s*\{[^}]*border-inline-start:\s*2px/);
  });
});
