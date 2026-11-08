/**
 * The soft body is CSS (CSS-first jelly, PR 3; spec docs/superpowers/specs/2026-11-07-css-first-jelly-design.md §3).
 *
 * The physics service (lib/jelly/physics.ts) is no longer installed. Hover plump, press squash and the release spring
 * are CSS transitions on `scale` in app/jelly-material.css §8, eased by the generated `--spring-*` curves
 * (jelly-spring-tokens.test.ts holds the literals), and the plasma wake / the dent's light dot are radial gradients at
 * `--px` / `--py`, the one pointer variable (lib/jelly/pointer-vars.ts). These are CSS-text assertions, like the
 * woken-haze and N3 gates: what each rule must say, and where it must not apply.
 *
 *  - one host list, scoped off native-material routes and a game in play, mirroring the physics service's hosts and
 *    exclusions (panes never move; opt-outs, disabled controls, gesture surfaces, the globe, prose links and play-fields
 *    are not hosts);
 *  - hover plumps cards and dents controls, fine pointers only, never under perf-lite or the app high-contrast mode;
 *  - press squashes on the press spring and releases on the release spring; every Button variant presses (D-C3);
 *  - press-through (D-C2): a host never squashes while an interactive descendant is the thing pressed, and a
 *    `data-jelly-press-through` host never squashes from any descendant's press;
 *  - perf-lite / app high contrast keep the press, plain (critically damped both ways);
 *  - nothing at rest: no will-change, no animation, no transition but `scale` on a spring; print resets it;
 *  - the legacy opacity press cue (globals.css) stands down exactly where the soft body springs (D-B1);
 *  - the hub's compose pill presses as one body (D-C6); the hook mounts the pointer variable, not physics.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GLOBE_SELECTOR } from '@/lib/jelly/tiers';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const flat = (s: string) =>
  s.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();

interface Rule {
  selectors: string[];
  body: string;
  at: string[];
}
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map(flat);
}
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const stack: string[] = [];
  let buf = '';
  for (const ch of strip(css)) {
    if (ch === '{') {
      stack.push(flat(buf));
      buf = '';
    } else if (ch === '}') {
      const sel = stack.pop() ?? '';
      if (buf.trim() && !sel.startsWith('@')) {
        out.push({
          selectors: splitTop(sel),
          body: buf,
          at: stack.filter((s) => s.startsWith('@')),
        });
      }
      buf = '';
    } else buf += ch;
  }
  return out;
}
const decl = (body: string, prop: string) =>
  new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim().replace(/\s+/g, ' ');

const MATERIAL = rules(read('app/jelly-material.css'));
const GLOBALS = rules(read('app/globals.css'));
const RADIAL = rules(read('components/radial/radial.css'));

const SCOPE = "html:not(.native-material, [data-game-state='playing']) ";
const SCOPE_HOVER = "html:not(.native-material, [data-game-state='playing'], .perf-lite) ";
const FINE = '@media (hover: hover) and (pointer: fine)';
const RELEASE = 'scale var(--spring-release-dur) var(--spring-release)';
const PRESS = 'scale var(--spring-press-dur) var(--spring-press)';

/** The rest rule: the one rule that puts the release spring on the hook. Its selector is SCOPE + HOST. */
const REST = MATERIAL.filter((r) => decl(r.body, '--jelly-spring-t') === RELEASE);
const HOST =
  REST.length === 1 && REST[0].selectors.length === 1 && REST[0].selectors[0].startsWith(SCOPE)
    ? REST[0].selectors[0].slice(SCOPE.length)
    : '';
/** The host list (`:is(…)`) and its exclusions (`:not(…)`). */
const HOST_IS = /^:is\((.*?)\):not\(/.exec(HOST)?.[1] ?? '';
const HOST_NOT = HOST.slice(`:is(${HOST_IS}):not(`.length, -1);

/** The rule (in `rules`) with exactly this selector, optionally under an at-rule containing `at`. */
const ruleFor = (rs: Rule[], sel: string, at?: string) =>
  rs.filter((r) => r.selectors.includes(sel) && (!at || r.at.some((a) => a.includes(at))));

/** Press-through guard: every press rule ends with it. */
const INTERACTIVE = [
  'a:not([data-evert-delegate])',
  'button',
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[data-slot='button']",
  'input',
  'textarea',
  'select',
  'summary',
];

describe('the CSS soft body (app/jelly-material.css §8)', () => {
  it('has one host rule, scoped off native-material routes and a game in play, carrying the release spring', () => {
    expect(REST, 'one rule sets --jelly-spring-t to the release spring').toHaveLength(1);
    expect(HOST, `its selector starts with "${SCOPE}"`).not.toBe('');
    expect(HOST_IS).not.toBe('');
  });

  it('mirrors the physics hosts: cards and controls', () => {
    const hosts = splitTop(HOST_IS);
    for (const h of [
      '.glass-fill',
      '.glass-interactive',
      '[data-evert]',
      '[data-liquid-surface]',
      '[data-fluid-press]',
      'button',
      "[role='button']",
      "[role='tab']",
      "[role='menuitem']",
      'summary',
      "[data-slot='button']",
    ])
      expect(hosts, h).toContain(h);
  });

  it('never moves a pane, an opted-out or disabled element, a gesture surface, the globe, a prose link or a play-field', () => {
    const not = splitTop(HOST_NOT);
    for (const h of [
      '.glass-pane',
      '.glass-chrome',
      '.glass-overlay',
      '.glass-inset',
      '.app-glass',
      "[data-jelly='off']",
      "[data-jelly='none']",
      "[data-liquid-material='off']",
      "[data-fluid-press='off']",
      "[data-fluid-press='none']",
      ':disabled',
      "[aria-disabled='true']",
      '[data-evert-delegate]',
      "[data-gesture]:not([data-gesture='hold'])",
      'input',
      'textarea',
      'select',
      '.eversion-overlay',
      '.evert-ghost',
      ...GLOBE_SELECTOR.split(','),
    ])
      expect(not, h).toContain(h);
    const scope = not.find((s) => s.endsWith(' *'));
    expect(scope, 'an opt-out scope exclusion').toBeDefined();
    for (const s of [
      "[data-jelly-scope='off']",
      "[data-jelly-zone='playfield']",
      "[data-liquid-motion='off']",
    ])
      expect(scope).toContain(s);
    expect(not.some((s) => s.startsWith(':is(p, blockquote') && s.includes(' a'))).toBe(true);
  });

  it('hooks every host into the spring at zero specificity, with a no-op off the jelly scope', () => {
    const hook = MATERIAL.filter(
      (r) =>
        r.at.some((a) => a.startsWith('@layer base')) &&
        decl(r.body, 'transition') === 'var(--jelly-spring-t)',
    );
    expect(hook).toHaveLength(1);
    expect(hook[0].selectors).toEqual([`:where(${HOST_IS})`]);
    const root = MATERIAL.filter(
      (r) => r.selectors.includes(':root') && decl(r.body, '--jelly-spring-t'),
    );
    expect(root).toHaveLength(1);
    expect(decl(root[0].body, '--jelly-spring-t')).toMatch(/^--[\w-]+ 0s$/);
  });

  it('plumps cards and dents controls on hover, fine pointers only, never under perf-lite or app high contrast', () => {
    const card = ruleFor(MATERIAL, `${SCOPE_HOVER}${HOST}:not(.app-high-contrast *):hover`, FINE);
    expect(card).toHaveLength(1);
    expect(decl(card[0].body, 'scale')).toBe('var(--jelly-hover-plump)');
    const dent = MATERIAL.filter(
      (r) =>
        r.at.some((a) => a.includes(FINE)) &&
        r.selectors.some(
          (s) =>
            s.startsWith(`${SCOPE_HOVER}${HOST}:is(button`) &&
            s.endsWith(':not(.app-high-contrast *):hover'),
        ),
    );
    expect(dent).toHaveLength(1);
    expect(decl(dent[0].body, 'scale')).toBe('var(--jelly-hover-dent)');
    // No hover pose anywhere else: touch never plumps.
    const poses = MATERIAL.filter((r) => /var\(--jelly-hover-/.test(decl(r.body, 'scale') ?? ''));
    expect(poses.every((r) => r.at.some((a) => a.includes(FINE)))).toBe(true);
  });

  const pressRules = MATERIAL.filter(
    (r) =>
      !r.at.some((a) => a.startsWith('@media')) &&
      r.selectors.some((s) => s.startsWith(`${SCOPE}${HOST}`) && s.includes(':active')),
  );

  it('squashes on the press spring and releases on the release spring; a control by the full bound', () => {
    expect(pressRules).toHaveLength(2);
    const [card, control] = pressRules;
    expect(card.selectors[0].startsWith(`${SCOPE}${HOST}:active:not(:has(`)).toBe(true);
    expect(decl(card.body, 'scale')).toBe('var(--jelly-press-card)');
    expect(decl(card.body, '--jelly-spring-t')).toBe(PRESS);
    expect(control.selectors[0].startsWith(`${SCOPE}${HOST}:is(button`)).toBe(true);
    expect(decl(control.body, 'scale')).toBe('var(--jelly-press-control)');
  });

  it('presses every Button variant (D-C3): the control rule never singles one out', () => {
    const control = pressRules[1]?.selectors[0] ?? '';
    expect(control).toContain("[data-slot='button']");
    expect(control).not.toContain('data-variant');
    // …and the Button carries no press or transition utility of its own any more (globals.css states them, below).
    const button = read('components/ui/button.tsx');
    expect(button).not.toMatch(/active:scale-|transition-\[/);
  });

  it('press-through (D-C2): no squash while an inner control is pressed, none at all on a press-through host', () => {
    for (const r of pressRules) {
      const sel = r.selectors[0];
      expect(sel.endsWith(':not([data-jelly-press-through]:has(:active))'), sel).toBe(true);
      const has = /:not\(:has\(:is\((.*?)\):active\)\)/.exec(sel)?.[1];
      expect(has, 'an inner-control :has() guard').toBeDefined();
      expect(splitTop(has!)).toEqual(expect.arrayContaining(INTERACTIVE));
    }
    // The attribute stays the documented opt-in on the containers that carry it.
    expect(read('components/ui/jelly-group.tsx')).toContain('data-jelly-press-through');
    expect(read('components/ui/selection-bar.tsx')).toContain('data-jelly-press-through');
    expect(read('components/radial/RadialShell.tsx')).toContain('data-jelly-press-through');
  });

  it('keeps the press, plain, under perf-lite and the app high-contrast mode', () => {
    const lite = MATERIAL.filter(
      (r) => decl(r.body, '--jelly-spring-t') === PRESS && !r.body.includes('scale:'),
    );
    expect(lite).toHaveLength(1);
    expect(lite[0].selectors.sort()).toEqual(
      [
        `html.perf-lite:not(.native-material, [data-game-state='playing']) ${HOST}`,
        `${SCOPE}.app-high-contrast ${HOST}`,
      ].sort(),
    );
  });

  it('does nothing at rest: no will-change, no animation, and only scale on a spring', () => {
    const own = MATERIAL.filter((r) => r.selectors.some((s) => s.includes(HOST)));
    expect(own.length).toBeGreaterThanOrEqual(6);
    for (const r of own) {
      expect(r.body, r.selectors[0]).not.toMatch(/will-change|animation|(?:^|;)\s*transition\s*:/);
      const t = decl(r.body, '--jelly-spring-t');
      if (t) expect([RELEASE, PRESS]).toContain(t);
    }
  });

  it('resets the soft body on paper', () => {
    const print = MATERIAL.filter(
      (r) =>
        r.at.some((a) => a.startsWith('@media print')) &&
        /scale\s*:\s*none !important/.test(r.body),
    );
    expect(print).toHaveLength(1);
    expect(print[0].body).toMatch(/translate\s*:\s*none !important/);
    expect(print[0].selectors).toEqual([`:is(${HOST_IS}):is(:hover, :active)`]);
    expect(MATERIAL.some((r) => r.selectors.includes('[data-jelly-body]'))).toBe(false);
  });

  it('places the plasma wake and the light dot at --px/--py on the woken host, fine pointers only', () => {
    const wake = MATERIAL.filter(
      (r) => /--jelly-floor\s*:[^;]*var\(--px/.test(r.body) && /var\(--py/.test(r.body),
    );
    expect(wake).toHaveLength(2);
    for (const r of wake) {
      expect(
        r.at.some((a) => a.includes(FINE)),
        r.selectors[0],
      ).toBe(true);
      expect(
        r.selectors[0].startsWith('html:not(.native-material, .perf-lite) :is(.glass-fill'),
      ).toBe(true);
    }
    expect(wake[0].selectors[0].endsWith(':hover')).toBe(true);
    expect(decl(wake[0].body, '--jelly-floor-size')).toBe('auto, auto, var(--jelly-tile-size)');
    expect(wake[1].selectors[0]).toContain(':active:not(:has(');
    expect(wake[1].body).toContain('var(--gel-specular');
    expect(decl(wake[1].body, '--jelly-floor-size')).toBe(
      'auto, auto, auto, var(--jelly-tile-size)',
    );
  });
});

describe('the soft body elsewhere', () => {
  it('the legacy opacity press cue stands down on every spring host, and only there (D-B1)', () => {
    const cue = GLOBALS.filter(
      (r) => r.selectors.some((s) => s.includes(':active')) && /opacity\s*:\s*0?\.\d/.test(r.body),
    );
    expect(cue).toHaveLength(1);
    const guard = `:not(:where(${SCOPE}${HOST}))`;
    for (const s of cue[0].selectors) expect(s.endsWith(`${guard}:active`), s).toBe(true);
    expect(cue[0].selectors.join(' ')).not.toContain('data-jelly-active');
  });

  it('the Button keeps a plain press and its transition list carries the spring hook', () => {
    const base = ruleFor(GLOBALS, "[data-slot='button']", '@layer components');
    expect(base).toHaveLength(1);
    expect(flat(decl(base[0].body, 'transition') ?? '')).toMatch(/, var\(--jelly-spring-t\)$/);
    const press = ruleFor(
      GLOBALS,
      "[data-slot='button']:not(:disabled, [aria-disabled='true']):active",
      '@layer components',
    );
    expect(press).toHaveLength(1);
    expect(decl(press[0].body, 'scale')).toBe('0.98');
  });

  it('the hub compose pill presses as one body (D-C6)', () => {
    const pill = ruleFor(RADIAL, `${SCOPE}.radial-feed__compose:active`);
    expect(pill).toHaveLength(1);
    expect(decl(pill[0].body, 'scale')).toBe('var(--jelly-press-control)');
    expect(decl(pill[0].body, '--jelly-spring-t')).toBe(PRESS);
    const inner = ruleFor(RADIAL, `${SCOPE}.radial-feed__compose > button`);
    expect(inner).toHaveLength(1);
    expect(decl(inner[0].body, 'scale')).toBe('none');
  });

  it('the hook mounts the pointer variable, not the physics, registry or fallback light', () => {
    const hook = read('hooks/useLiquidInteractions.ts').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(hook).toMatch(/installPointerVars\(document\)/);
    expect(hook).not.toMatch(
      /installJellyPhysics|installJellyRegistry|installLiquidInteractions|jelly\/physics|jelly\/registry|liquid\/runtime/,
    );
  });
});
