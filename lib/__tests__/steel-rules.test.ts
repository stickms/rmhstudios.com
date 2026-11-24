/**
 * Steel dividers gate (docs/superpowers/specs/2026-11-24-steel-dividers-design.md, S7-S11): a site-tier page sets its
 * groups off with 1px rules, not with bordered boxes.
 *
 * A violation is one of three source shapes, on a site-tier `.tsx` file under `components/`, `features/` or
 * `app/routes/`:
 *  - a bordered group box: the class text of one element (a `className` value, or a `cn(` / `clsx(` / `cva(` call's
 *    arguments, with every string literal inside it joined) has an all-sides `border` and a `rounded-site` (or
 *    `rounded-md/lg/xl`) and no control, picture or overlay marker (see `isControlOrPicture`);
 *  - a retired surface role: `surface-card` or `surface-panel` in that class text;
 *  - the retired wrapper: an import of `components/ui/card`.
 *
 * The frozen violators live in `steel-rules-baseline.ts`: per file, the wave that removes it and how many violations it
 * has now. A file may not exceed its recorded count (a new violation in an old file fails), a file not in the baseline
 * may not have one, a file whose count fell must lower its recorded number, and an entry with no violations left must be
 * deleted. To regenerate after a change, run `STEEL_RULES_UPDATE=1 pnpm exec vitest run lib/__tests__/steel-rules.test.ts`
 * and read the `STEEL_RULES_AT` lines it prints.
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

/** True when the class text carries a marker that makes its border a control, a picture or an overlay. */
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
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, pre: string) => pre + blank(m.slice(pre.length)));
}

const STRING_LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

/** The text of one string literal match. */
function literalText(m: RegExpMatchArray): string {
  return m[1] ?? m[2] ?? m[3] ?? '';
}

/** Index of the quote that closes the string literal opened at `i` (or the line end for '/" strings). */
function skipQuoted(src: string, i: number): number {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') {
      j++;
      continue;
    }
    if (src[j] === q) return j;
    if (q !== '`' && src[j] === '\n') return j;
  }
  return src.length;
}

/** Index just past the bracket that closes the `(` or `{` at `open`, skipping quoted text. */
function closeIndex(src: string, open: number): number {
  const opener = src[open];
  const closer = opener === '(' ? ')' : '}';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipQuoted(src, i);
    } else if (c === opener) {
      depth++;
    } else if (c === closer) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

interface Span {
  start: number;
  end: number;
}

/**
 * The class contexts of one file: each `className` attribute value (a quoted value or a `{…}` expression) and each
 * `cn(` / `clsx(` / `cva(` call, as a balanced span. A context nested in an earlier one is part of it.
 */
const CONTEXT_OPEN = /\bclassName\s*=\s*(?=["{])|\b(?:cn|clsx|cva)\s*\(/g;

function classContexts(code: string): Span[] {
  const spans: Span[] = [];
  let covered = 0;
  for (const m of code.matchAll(CONTEXT_OPEN)) {
    const start = m.index ?? 0;
    if (start < covered) continue;
    const head = m[0];
    let end: number;
    if (head.endsWith('(')) {
      end = closeIndex(code, start + head.length - 1);
    } else {
      const at = start + head.length;
      if (code[at] === '{') {
        end = closeIndex(code, at);
      } else {
        const close = code.indexOf('"', at + 1);
        end = close < 0 ? code.length : close + 1;
      }
    }
    spans.push({ start, end });
    covered = end;
  }
  return spans;
}

/** Every string literal inside a span, joined: the class text the span composes. */
function classTextOf(code: string, span: Span): string {
  const parts: string[] = [];
  for (const m of code.slice(span.start, span.end).matchAll(STRING_LITERAL)) parts.push(literalText(m));
  return parts.join(' ');
}

/**
 * The site-tier scanner, a pure function of one file's source. `file` is only used to label the violations. Exported so
 * the gate's own rules are unit-tested on inline snippets.
 */
export function scanSteelRules(src: string, file: string): SteelRuleViolation[] {
  const code = stripComments(src);
  const spans = classContexts(code);
  const out: SteelRuleViolation[] = [];

  const check = (text: string, at: number) => {
    const line = lineAt(code, at);
    if (RETIRED_ROLE.test(text)) {
      out.push({
        file,
        line,
        kind: 'retired-surface-role',
        detail: 'surface-card / surface-panel is retired on the site tier',
      });
    }
    if (!ROUNDED.test(text) || !BORDER_ALL.test(text)) return;
    if (isControlOrPicture(text) || isControlTag(enclosingTag(code, at))) return;
    out.push({
      file,
      line,
      kind: 'bordered-group-box',
      detail: 'bordered group box (border + rounded radius, no control, picture or overlay marker)',
    });
  };

  for (const span of spans) check(classTextOf(code, span), span.start);
  // String literals outside any class context (a `const` holding classes, say) are checked on their own.
  for (const m of code.matchAll(STRING_LITERAL)) {
    const idx = m.index ?? 0;
    if (spans.some((s) => idx >= s.start && idx < s.end)) continue;
    check(literalText(m), idx);
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

/** A whole-tier scan reads and scans every site file, so it runs once per test file, not once per test. */
let scanCache: Map<string, SteelRuleViolation[]> | undefined;

/** Violations by file, for the whole site tier. */
function scanAll(): Map<string, SteelRuleViolation[]> {
  if (scanCache) return scanCache;
  const byFile = new Map<string, SteelRuleViolation[]>();
  for (const file of SITE_FILES) {
    const v = scanSteelRules(readFileSync(join(ROOT, file), 'utf8'), file);
    if (v.length) byFile.set(file, v);
  }
  scanCache = byFile;
  return byFile;
}

/** The first whole-tier scan is slow on a shared CI runner (the default 5 s timed out there). */
const SCAN_TIMEOUT_MS = 60_000;

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

  it('flags a bordered box whose border and radius are split across the literals of a cn() call', () => {
    const v = scanSteelRules('const x = cn("border p-4", "rounded-site");', 'x.tsx');
    expect(v.map((r) => r.kind)).toEqual(['bordered-group-box']);
  });

  it('flags a bordered box whose radius comes from a conditional inside cn()', () => {
    const v = scanSteelRules('const x = cn("border", cond && "rounded-site");', 'x.tsx');
    expect(v.map((r) => r.kind)).toEqual(['bordered-group-box']);
  });

  it('does not flag a bordered Button whose classes are composed with cn()', () => {
    const v = scanSteelRules('<Button className={cn("border rounded-site", x)}>Save</Button>', 'x.tsx');
    expect(v).toEqual([]);
  });

  it('does not flag a bordered picture whose bg-site-bg-subtle is composed in cn()', () => {
    const v = scanSteelRules("<div className={cn('border rounded-site', 'bg-site-bg-subtle')} />", 'x.tsx');
    expect(v).toEqual([]);
  });
});

describe('steel rules on the site tier', () => {
  it('scans a non-trivial set of site-tier sources', () => {
    expect(SITE_FILES.length).toBeGreaterThan(200);
    expect(SITE_FILES).toContain(join('components', 'feed', 'PageLayout.tsx'));
  });

  it('no file outside the baseline has a violation (no new bordered group boxes, retired roles or ui/card imports)', () => {
    const offenders: string[] = [];
    for (const [file, violations] of scanAll()) {
      if (STEEL_RULES_BASELINE[file] !== undefined) continue;
      for (const v of violations) offenders.push(`${file}:${v.line} ${v.kind}: ${v.detail}. ${POINTER}`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it('no baselined file has more violations than its recorded count (the ratchet only goes down)', () => {
    const byFile = scanAll();
    const grew: string[] = [];
    for (const [file, violations] of byFile) {
      const entry = STEEL_RULES_BASELINE[file];
      if (entry && violations.length > entry.count) {
        grew.push(`${file}: ${violations.length} violations, recorded ${entry.count}. ${POINTER}`);
      }
    }
    expect(grew, grew.join('\n')).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it('every baseline entry still matches its recorded count (a clean file leaves the list; a smaller count is lowered)', () => {
    const byFile = scanAll();
    const problems: string[] = [];
    for (const [file, entry] of Object.entries(STEEL_RULES_BASELINE)) {
      const now = byFile.get(file)?.length ?? 0;
      if (now === 0) problems.push(`${file}: clean now, delete the entry`);
      else if (now < entry.count)
        problems.push(`${file}: ${now} violations now, lower its recorded count from ${entry.count}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it('every baseline entry names a wave and a positive count', () => {
    const bad = Object.entries(STEEL_RULES_BASELINE).filter(
      ([, e]) => !/^wave \d+$/.test(e.wave) || !Number.isInteger(e.count) || e.count < 1,
    );
    expect(bad.map(([f]) => f)).toEqual([]);
  });

  it('prints each violation when STEEL_RULES_UPDATE=1 (baseline regeneration only)', () => {
    if (process.env.STEEL_RULES_UPDATE !== '1') return;
    const lines: string[] = [];
    for (const [file, violations] of scanAll()) {
      for (const v of violations) lines.push(`STEEL_RULES_AT ${file}:${v.line}:${v.kind}`);
    }
    process.stdout.write(lines.join('\n') + '\n');
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
