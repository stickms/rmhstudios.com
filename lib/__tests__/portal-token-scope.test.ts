import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Custom properties are INHERITED, so a component that portals to `<body>` only
 * sees variables declared at document level — never ones scoped to a container
 * it has escaped.
 *
 * `--rad-1..8` (the radial spacing scale) are declared on `.radial-shell`.
 * `QuickPanel` portals to `<body>` precisely so the top bar's `backdrop-filter`
 * can't become its containing block — which also puts it outside `.radial-shell`,
 * so every `--rad-*` reference in the `.rad-panel` rules resolved to nothing.
 * An unresolved `var()` in a declaration makes the WHOLE declaration invalid, so
 * `padding: var(--rad-2)` was not "8px-ish", it was **no padding at all**: the
 * panels rendered with their contents flush against a 22px rounded border, and
 * nothing failed loudly to say so.
 *
 * `--z-quickpanel` was already hoisted to body level in globals.css for exactly
 * this reason (see the comment there) — the spacing tokens simply got missed.
 * This gate is the executable version of that comment: the styles for a
 * body-portaled surface may only use document-level tokens (`--site-*`) or ones
 * the surface declares on itself.
 */

const ROOT = process.cwd();
const RADIAL_CSS = 'components/radial/radial.css';

/** Selectors whose elements are rendered through `createPortal(..., document.body)`. */
const PORTALED_SELECTOR_PREFIX = '.rad-panel';

/** Grab the body of the first rule whose selector list matches `test`. */
function ruleBody(css: string, test: (selector: string) => boolean): string | null {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (selector && test(selector)) return m[2];
  }
  return null;
}

/** Every rule (selector + declarations) in the sheet, comments stripped. */
function rules(css: string): Array<{ selector: string; body: string; index: number }> {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const out: Array<{ selector: string; body: string; index: number }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bare))) {
    out.push({ selector: m[1].trim(), body: m[2], index: m.index });
  }
  return out;
}

const lineAt = (src: string, index: number) => src.slice(0, index).split('\n').length;

describe('portaled surfaces only use document-level design tokens', () => {
  const css = readFileSync(join(ROOT, RADIAL_CSS), 'utf8');

  it('the radial spacing scale is still shell-scoped (guards the premise)', () => {
    // If someone hoists --rad-* to :root this test's premise changes — and the
    // rule below would start passing vacuously. Fail loudly instead.
    const shell = ruleBody(css, (s) => s === '.radial-shell');
    expect(shell, `Could not find the .radial-shell rule in ${RADIAL_CSS}`).toBeTruthy();
    expect(shell).toMatch(/--rad-2:/);
    expect(css).not.toMatch(/^:root\s*\{[^}]*--rad-2:/m);
  });

  it('no .rad-panel rule references the shell-scoped --rad-* scale', () => {
    const offenders = rules(css)
      .filter((r) => r.selector.includes(PORTALED_SELECTOR_PREFIX))
      .flatMap((r) =>
        [...r.body.matchAll(/var\(\s*(--rad-[\w-]+)/g)].map((m) => ({
          line: lineAt(css, r.index),
          selector: r.selector,
          token: m[1],
        })),
      );

    expect(
      offenders,
      `\n.rad-panel is portaled to <body>, so it is NOT inside .radial-shell and ` +
        `these tokens resolve to nothing — which invalidates the whole declaration ` +
        `(the property silently falls back to its initial value):\n` +
        offenders
          .map((o) => `  ${RADIAL_CSS}:${o.line} — ${o.selector} uses ${o.token}`)
          .join('\n') +
        `\n\nDeclare the value on .rad-panel itself (see --panel-pad / --panel-inset / ` +
        `--panel-gap) or use a document-level --site-* token.\n`,
    ).toEqual([]);
  });

  it('the panel declares its own spacing scale', () => {
    const panel = ruleBody(css, (s) => s === '.rad-panel');
    expect(panel, `Could not find the .rad-panel rule in ${RADIAL_CSS}`).toBeTruthy();
    for (const token of ['--panel-pad', '--panel-inset', '--panel-gap']) {
      expect(panel, `.rad-panel must declare ${token} (it cannot inherit one)`).toContain(
        `${token}:`,
      );
    }
  });
});
