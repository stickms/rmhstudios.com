/**
 * Steel dividers gate (docs/superpowers/specs/2026-11-24-steel-dividers-design.md, S7-S11): a site-tier page sets its
 * groups off with 1px rules, not with bordered boxes.
 *
 * A violation is one of four source shapes, on a site-tier `.tsx` file under `components/`, `features/` or
 * `app/routes/`:
 *  - a bordered group box: the class text of one element (a `className` value, or a `cn(` / `clsx(` / `cva(` call's
 *    arguments, with every string literal inside it joined) has an all-sides `border` and a `rounded-site` (or
 *    `rounded-md/lg/xl`) and no control, picture or overlay marker (see `isControlOrPicture`);
 *  - a ghost box: `rounded-site` with horizontal padding and nothing visible (no fill, ring, shadow or all-sides
 *    border), the padding left behind when a card became rows on rules, which indents content away from the page title;
 *  - a retired surface role: `surface-card` or `surface-panel` in that class text;
 *  - the retired wrapper: an import of `components/ui/card`.
 *
 * The gate has no allowlist for any kind: every site-tier file is clean (the baselines of pages that still had boxes or
 * ghost boxes were worked down to nothing, batch by batch, and deleted). A class picked from an upper-case lookup
 * table (`BAND[i]`) may carry a fill the scan cannot read, so it is not a ghost box. Three kinds of element are not group boxes and are never flagged:
 * a control, picture or overlay (by class marker or tag); a keycap (`kbd`), a `figure` (it holds a picture) and an
 * element with an inline `style` colour (a swatch of the user's own colour); and a class string that uses the app-tier
 * (`*-app-*`, `rounded-app*`) or a brand (`*-rebar-*`) palette, which is another tier's look (L8), not the site's.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isSiteTier } from '../../eslint-local-rules/design-scope.js';

const ROOT = process.cwd();
const SCAN_DIRS = ['components', 'features', join('app', 'routes')];

/** The pointer every violation prints: the shared primitives and the spec that defines them. */
const POINTER =
  'Use Section / Columns / Cells / Notice / Definitions from ' +
  join('components', 'ui', 'rules.tsx') +
  ', plan S7-S11 (' +
  join('docs', 'superpowers', 'specs', '2026-11-24-steel-dividers-design.md') +
  ').';

export type SteelRuleKind = 'bordered-group-box' | 'retired-surface-role' | 'card-import' | 'ghost-box';

export interface SteelRuleViolation {
  file: string;
  line: number;
  kind: SteelRuleKind;
  detail: string;
}

/** Tags whose border is the control itself (or a picture, or a dialog), not a group box. */
const CONTROL_TAGS = new Set([
  'Button',
  'Input',
  'Select',
  'Textarea',
  'button',
  'input',
  'select',
  'textarea',
  'img',
  'kbd',
  'figure',
]);
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
/**
 * A ghost box: `rounded-site` with horizontal padding and nothing to see (no fill, ring, shadow or all-sides border).
 * It is what is left of a card once its box is gone, and the padding indents the content away from the page edge that
 * the title sits on. Vertical padding alone is fine (it is spacing); a row that needs a hover fill uses `row-hover`.
 */
const ROUNDED_SITE = /(?:^|\s)(?:\S*:)*rounded-site(?![\w-])/;
const HORIZONTAL_PAD = /(?:^|\s)(?:\S*:)*(?:p|px|ps|pe|pl|pr)-\d/;
const VISIBLE_SURFACE = [
  /(?:^|\s)(?:\S*:)*bg-/,
  /(?:^|\s)(?:\S*:)*ring(?:-|\s|$)/,
  /(?:^|\s)(?:\S*:)*shadow/,
  token('surface-overlay'),
  token('surface-field'),
  token('surface-chrome'),
];
/** A constant-named table indexed in the class expression: its entries can hold the fill the scanner cannot see. */
const LOOKUP_CLASS = /\b[A-Z][A-Z0-9_]*\[/;
const FIXED_H = /(?:^|\s)(?:\S*:)*h-\d/;
const FIXED_W = /(?:^|\s)(?:\S*:)*w-\d/;

/** True when the class text carries a marker that makes its border a control, a picture or an overlay. */
function isControlOrPicture(classes: string): boolean {
  if (CONTROL_MARKERS.some((re) => re.test(classes))) return true;
  return FIXED_H.test(classes) && FIXED_W.test(classes);
}

/** An inline colour on the element: a swatch of a colour the user chose, which has to keep its own edge (S4). */
const INLINE_COLOUR = /\bstyle=\{\{[^}]*\b(?:color|backgroundColor|background)\b/;

/** True when the element is a control, a picture, a swatch or an overlay by its tag. */
function isControlTag(tag: string): boolean {
  const name = /^<([A-Za-z][\w.]*)/.exec(tag)?.[1] ?? '';
  return CONTROL_TAGS.has(name) || OVERLAY_TAG_PREFIXES.some((p) => name.startsWith(p)) || INLINE_COLOUR.test(tag);
}

/** App-tier (`rounded-app`, `text-app-*`) and brand (`border-rebar-*`) palettes belong to other tiers (L8). */
const OTHER_PALETTE = /(?:^|\s)(?:\S*:)*(?:rounded-app|[a-z]+-app-|[a-z]+-rebar-)/;

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

  const check = (text: string, at: number, raw = '') => {
    const line = lineAt(code, at);
    if (OTHER_PALETTE.test(text)) return;
    if (RETIRED_ROLE.test(text)) {
      out.push({
        file,
        line,
        kind: 'retired-surface-role',
        detail: 'surface-card / surface-panel is retired on the site tier',
      });
    }
    if (ROUNDED.test(text) && BORDER_ALL.test(text)) {
      if (isControlOrPicture(text) || isControlTag(enclosingTag(code, at))) return;
      out.push({
        file,
        line,
        kind: 'bordered-group-box',
        detail: 'bordered group box (border + rounded radius, no control, picture or overlay marker)',
      });
      return;
    }
    if (!ROUNDED_SITE.test(text) || !HORIZONTAL_PAD.test(text)) return;
    if (VISIBLE_SURFACE.some((re) => re.test(text))) return;
    // A class picked from a lookup table (`BAND[i]`, `TONE[kind]`) may carry the fill, which a string scan cannot read.
    if (LOOKUP_CLASS.test(raw)) return;
    if (isControlOrPicture(text) || isControlTag(enclosingTag(code, at))) return;
    out.push({
      file,
      line,
      kind: 'ghost-box',
      detail:
        'rounded-site with horizontal padding and no fill, ring, shadow or border: drop the padding (and the radius)',
    });
  };

  for (const span of spans) check(classTextOf(code, span), span.start, code.slice(span.start, span.end));
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
  it('does not flag a keycap, a figure or a swatch with an inline colour', () => {
    expect(scanSteelRules('<kbd className="border rounded-site px-1">K</kbd>', 'x.tsx')).toEqual([]);
    expect(scanSteelRules('<figure className="m-0 border rounded-site"><img src="q" /></figure>', 'x.tsx')).toEqual([]);
    expect(
      scanSteelRules('<div className="border rounded-site p-5" style={{ color: fg, backgroundColor: bg }} />', 'x.tsx'),
    ).toEqual([]);
  });

  it('does not flag a class string on the app-tier or a brand palette', () => {
    expect(scanSteelRules('<div className="surface-card rounded-app p-4" />', 'x.tsx')).toEqual([]);
    expect(scanSteelRules('<div className="surface-panel rounded-app-sm text-app-text" />', 'x.tsx')).toEqual([]);
    expect(
      scanSteelRules('<header className="rounded-site border border-rebar-line bg-rebar-paper" />', 'x.tsx'),
    ).toEqual([]);
  });

  it('still flags a site-palette box and a bare surface-card', () => {
    expect(scanSteelRules('<div className="border rounded-site border-site-border p-4" />', 'x.tsx')).toHaveLength(1);
    expect(scanSteelRules('<div className="surface-card p-4" />', 'x.tsx')).toHaveLength(1);
  });
  it('flags a ghost box: rounded-site with horizontal padding and nothing visible', () => {
    expect(scanSteelRules('<div className="rounded-site p-5" />', 'x.tsx').map((v) => v.kind)).toEqual(['ghost-box']);
    expect(scanSteelRules('<div className="rounded-site px-4 py-3" />', 'x.tsx')).toHaveLength(1);
    expect(scanSteelRules('<div className={cn("space-y-3", "rounded-site ps-4")} />', 'x.tsx')).toHaveLength(1);
  });

  it('does not flag vertical padding, a fill, a ring, an overlay or a control', () => {
    expect(scanSteelRules('<div className="rounded-site py-3" />', 'x.tsx')).toEqual([]);
    expect(scanSteelRules('<div className="rounded-site px-4 bg-site-bg-subtle" />', 'x.tsx')).toEqual([]);
    expect(scanSteelRules('<div className="rounded-site px-4 hover:bg-site-bg-subtle" />', 'x.tsx')).toEqual([]);
    expect(scanSteelRules('<div className="rounded-site p-4 ring-1 ring-site-accent" />', 'x.tsx')).toEqual([]);
    expect(scanSteelRules('<div className="surface-overlay rounded-site p-4" />', 'x.tsx')).toEqual([]);
    expect(scanSteelRules('<Button className="rounded-site px-4" />', 'x.tsx')).toEqual([]);
    expect(scanSteelRules('<div className="rounded-app p-4" />', 'x.tsx')).toEqual([]);
  });
  it('does not flag a class picked from a lookup table, which may carry the fill', () => {
    expect(scanSteelRules("<div className={cn('rounded-site px-4 py-3', BAND[i % 4])} />", 'x.tsx')).toEqual([]);
    expect(scanSteelRules("<div className={cn('rounded-site px-4 py-3', band[i % 4])} />", 'x.tsx')).toHaveLength(1);
  });
});

describe('steel rules on the site tier', () => {
  it('scans a non-trivial set of site-tier sources', () => {
    expect(SITE_FILES.length).toBeGreaterThan(200);
    expect(SITE_FILES).toContain(join('components', 'feed', 'PageLayout.tsx'));
  });

  it(
    'no site-tier file has a bordered group box, a ghost box, a retired surface role or a ui/card import',
    () => {
      const offenders: string[] = [];
      for (const [file, violations] of scanAll()) {
        for (const v of violations) {
          offenders.push(`${file}:${v.line} ${v.kind}: ${v.detail}. ${POINTER}`);
        }
      }
      expect(offenders, offenders.join('\n')).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
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
