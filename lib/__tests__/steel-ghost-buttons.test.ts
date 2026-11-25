/**
 * Steel K3 and K8 gate (docs/plans/2026-11-11-steel-design-implementation.md section 6):
 *  - K3: site-tier ghost text buttons carry zero box padding (`padding: 0`, `block-size: auto`, `border-width: 0`),
 *    draw their M1 hover/press fill and K10 focus ring on an overhanging `::before`, and keep a 44px touch target via
 *    `::after` on coarse pointers without inflating layout height.
 *  - No site-tier `<Button variant="ghost">` carries a negative horizontal margin (`-ms-*`, `-ml-*`, `-me-*`, `-mr-*`,
 *    `-mx-*`): text already sits flush on the column edge, so a manual bleed hack pulls it into the gutter.
 *  - No site-tier `<Button variant="ghost">` renders only an icon on a text `size`: icon-only controls use
 *    `<IconButton>` (preferred: bundles `aria-label` + tooltip, K8) or `size="icon*"` so they keep their square box.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isSiteTier } from '../../eslint-local-rules/design-scope.js';

const ROOT = process.cwd();
const SCAN_DIRS = ['components', 'features', join('app', 'routes')];

const POINTER =
  'See Steel K3 and K8 in ' +
  join('docs', 'plans', '2026-11-11-steel-design-implementation.md') +
  ' and ' +
  join('docs', 'design-language.md') +
  ' §5.';

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

function lineAt(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

/** Find the end of an opening `<Button ...>` tag (respecting balanced `{...}` and quotes). */
function findTagEnd(src: string, openIdx: number): { end: number; selfClosing: boolean } {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth <= 0) {
      return { end: i, selfClosing: src[i - 1] === '/' };
    }
  }
  return { end: src.length - 1, selfClosing: false };
}

describe('Steel K3: flush ghost-text CSS contract', () => {
  const surfaces = readFileSync(join(ROOT, 'app', 'styles', 'steel-surfaces.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const interaction = readFileSync(join(ROOT, 'app', 'globals', 'base-interaction.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('zeros padding, border and height on site-tier ghost text buttons and isolates ::before', () => {
    expect(surfaces).toContain("html:not(.app-route) [data-slot='button'][data-variant='ghost']:not([data-size^='icon'])");
    expect(surfaces).toContain('isolation: isolate;');
    expect(surfaces).toContain('block-size: auto;');
    expect(surfaces).toContain('padding: 0;');
    expect(surfaces).toContain('border-width: 0;');
  });

  it('draws the overhanging hover/press fill and K10 focus ring on ::before', () => {
    expect(surfaces).toContain('inset-inline: calc(-1 * var(--ghost-x));');
    expect(surfaces).toContain(":hover::before {\n    background-color: var(--site-bg-subtle);");
    expect(surfaces).toContain(":focus-visible::before {\n  outline: 2px solid var(--site-text);\n  outline-offset: 2px;");
  });

  it('supplies the 44px touch target via ::after on coarse pointers without forcing min-block-size', () => {
    expect(interaction).toContain(
      "html:not(.app-route) [data-slot='button'][data-variant='ghost']:not([data-size^='icon'])::after",
    );
    expect(interaction).toContain("[data-slot='button']:not([data-variant='ghost'])");
    expect(interaction).toContain("[data-slot='button'][data-size^='icon']");
  });
});

describe('Steel K3 & K8: site-tier ghost button call sites', () => {
  const negBleed: string[] = [];
  const iconOnTextSize: string[] = [];
  const toggleJump: string[] = [];

  for (const file of SITE_FILES) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const openRe = /<Button\b/g;
    let m: RegExpExecArray | null;
    while ((m = openRe.exec(src))) {
      const { end, selfClosing } = findTagEnd(src, m.index);
      const attrs = src.slice(m.index + '<Button'.length, end);
      const isAlwaysGhost = /\bvariant\s*=\s*(?:["']ghost["']|\{\s*["']ghost["']\s*\})/.test(attrs);
      const hasGhostBranch = /\bvariant\s*=\s*\{[^}]*["']ghost["'][^}]*\}/.test(attrs);
      if (!isAlwaysGhost && !hasGhostBranch) continue;

      const line = lineAt(src, m.index);
      if (/(?:^|[\s"'`])-m[slrex]-\d/.test(attrs)) {
        negBleed.push(`${file}:${line}`);
      }

      // Switching a text button between `ghost` (0 padding) and `default`/`primary` (px-4 h-9) jumps in width/height.
      // Icon-sized buttons (`size="icon*"` or a matching `size={... ? 'icon' : 'default'}`) keep stable boxes.
      if (
        hasGhostBranch &&
        !isAlwaysGhost &&
        /(?<![?])\?(?![.?])/.test(attrs) &&
        !/\bsize\s*=\s*(?:["']icon|\{[^}]*["']icon)/.test(attrs)
      ) {
        toggleJump.push(`${file}:${line}`);
      }

      // Check icon-only body when `variant="ghost"` has no `size="icon*"`.
      if (
        isAlwaysGhost &&
        !selfClosing &&
        !/\bsize\s*=\s*(?:["']icon|\{[^}]*["']icon)/.test(attrs) &&
        !/\basChild\b/.test(attrs)
      ) {
        const closeIdx = src.indexOf('</Button>', end + 1);
        if (closeIdx > end) {
          const body = src
            .slice(end + 1, closeIdx)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/<span[^>]*\bsr-only\b[^>]*>[\s\S]*?<\/span>/g, '')
            .trim();
          // Pure self-closing JSX icon (`<X ... />`) or ternary of self-closing icons (`{a ? <X /> : <Y />}`).
          const isSingleIcon = /^<[A-Z][\w.]*\b[^>]*\/>$/.test(body);
          const isIconTernary =
            /^\{[^{}?]+\?\s*<[A-Z][\w.]*\b[^>]*\/>\s*:\s*<[A-Z][\w.]*\b[^>]*\/>\s*\}$/.test(body);
          if (isSingleIcon || isIconTernary) {
            iconOnTextSize.push(`${file}:${line}`);
          }
        }
      }
    }
  }

  it('adds no negative horizontal margin bleed hack to a ghost Button', () => {
    expect(
      negBleed,
      `Negative horizontal margin on a site-tier ghost <Button> (${negBleed.length}):\n  ` +
        negBleed.join('\n  ') +
        `\nGhost text buttons already sit flush on the column edge. ${POINTER}`,
    ).toEqual([]);
  });

  it('uses IconButton or size="icon*" for every icon-only ghost Button', () => {
    expect(
      iconOnTextSize,
      `Icon-only ghost <Button> with a text size (${iconOnTextSize.length}):\n  ` +
        iconOnTextSize.join('\n  ') +
        `\nUse <IconButton> (with label) or size="icon*" so icon buttons keep their square box. ${POINTER}`,
    ).toEqual([]);
  });

  it('does not toggle a text Button dynamically between ghost and a padded variant', () => {
    expect(
      toggleJump,
      `Text <Button> switching between ghost and a padded variant shifts width on click (${toggleJump.length}):\n  ` +
        toggleJump.join('\n  ') +
        `\nKeep toggle chips on variant="default" with aria-pressed weight/border (A2). ${POINTER}`,
    ).toEqual([]);
  });
});
