/**
 * The soft body is CSS (CSS-first jelly, PR 3; spec docs/superpowers/specs/2026-11-07-css-first-jelly-design.md §3).
 *
 * The physics service (lib/jelly/physics.ts, deleted in CSS-first jelly PR 5) is gone. Hover plump, press squash and the release spring
 * are CSS transitions on `scale` in app/jelly-material.css §8, eased by the generated `--spring-*` curves
 * (jelly-spring-tokens.test.ts holds the literals), and the plasma wake / the dent's light dot are radial gradients at
 * `--px` / `--py`, the one pointer variable (lib/jelly/pointer-vars.ts). These are CSS-text assertions, like the
 * woken-haze and N3 gates: what each rule must say, and where it must not apply.
 *
 *  - one host list, scoped off native-material routes and a game in play, mirroring the hosts and exclusions of the physics
 *    service it replaced (panes never move; opt-outs, disabled controls, gesture surfaces, the globe, prose links and play-fields
 *    are not hosts);
 *  - hover plumps cards and dents controls, fine pointers only, never under the app high-contrast mode;
 *  - press squashes on the press spring and releases on the release spring; every Button variant presses (D-C3);
 *  - press-through (D-C2, revised by Task 8): a host never squashes while a real control inside it is the thing
 *    pressed (a plain `<a>` is not one, so a card wrapped in a link squashes), and a `data-jelly-press-body` host (a
 *    JellyGroup, the top bar, the selection bar, a scroller's pill) squashes as one body when any member is pressed,
 *    while the member adds no squash, dent or opacity cue of its own;
 *  - app high contrast keeps the press, plain (critically damped both ways);
 *  - nothing at rest: no will-change, no animation, no transition but `scale` on a spring; print resets it;
 *  - the legacy opacity press cue (globals.css) stands down exactly where the soft body springs (D-B1);
 *  - the hub's compose pill presses as one body (D-C6); the hook mounts the pointer variable, not physics.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CSS_BODY_SIZE_FALLBACK_PX, CSS_SIZE_FALLBACK_PX } from '@/lib/jelly/soft-policy';
import { GLOBE_SELECTOR } from '@/lib/jelly/tiers';
import { readCss } from './css-source';

const ROOT = process.cwd();
const read = (p: string) => readCss(join(ROOT, p));
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
const decl = (body: string, prop: string) => {
  const v = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1];
  return v === undefined ? undefined : flat(v);
};

const MATERIAL = rules(read('app/jelly-material.css'));
const GLOBALS = rules(read('app/globals.css'));
const RADIAL = rules(read('components/radial/radial.css'));

const SCOPE = "html:not(.native-material, [data-game-state='playing']) ";
const SCOPE_HOVER = "html:not(.native-material, [data-game-state='playing']) ";
const FINE = '@media (hover: hover) and (pointer: fine)';
const RELEASE = 'scale var(--spring-release-dur) var(--spring-release)';
const PRESS = 'scale var(--spring-press-dur) var(--spring-press)';
/** Every pose is capped by the host's size (`--jelly-s`, lib/jelly/pointer-vars.ts) to the 4 px edge bound. */
const capped = (token: string, up: boolean) =>
  `${up ? 'min' : 'max'}(var(${token}), calc(1 ${up ? '+' : '-'} var(--jelly-edge-reach) / var(--jelly-s, ${CSS_SIZE_FALLBACK_PX})))`;

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

/** The press body (Task 8, owner: "squash everything"): a cluster host that squashes as ONE body. */
const BODY = '[data-jelly-press-body]';
/**
 * A real control: pressing one inside a host presses the control, not the host. A plain `<a>` (no slot, no role, not a
 * pressable) is not one: a card whose content is a plain link squashes as the card. A press body is one, from outside.
 */
const REAL = [
  'a:is([data-slot], [role], [data-fluid-press]):not([data-evert-delegate])',
  'button',
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='switch']",
  "[role='option']",
  "[data-slot='button']",
  '.glass-interactive',
  'input',
  'textarea',
  'select',
  'summary',
  BODY,
];
const REAL_IS = `:is(${REAL.join(', ')})`;
/** The plain link: the `a` REAL leaves out. */
const PLAIN_A = 'a:not([data-slot], [role], [data-fluid-press], .glass-interactive)';
/** The guard every press rule carries: never inside a press body (the body presses), never while a real control is. */
const IN_BODY = `:not(${BODY} *)`;
const NO_REAL = `:not(:has(${REAL_IS}:active))`;

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
      BODY,
    ])
      expect(hosts, h).toContain(h);
  });

  it('never moves a pane, an opted-out or disabled element, a gesture surface, the globe, a prose link or a play-field', () => {
    const not = splitTop(HOST_NOT);
    for (const h of [
      // A pane or chrome slab never moves, unless it is a press body (the top bar, the selection bar).
      `.glass-pane:not(${BODY})`,
      `.glass-chrome:not(${BODY})`,
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

  it('plumps cards and dents controls on hover, fine pointers only, never under app high contrast', () => {
    // A pane or chrome press body (the top bar, the selection bar) never plumps: it is always under the pointer, and
    // the old physics never moved chrome on hover. It only squashes (below).
    const card = ruleFor(
      MATERIAL,
      `${SCOPE_HOVER}${HOST}:not(.app-high-contrast *):not(.glass-chrome, .glass-pane):hover`,
      FINE,
    );
    expect(card).toHaveLength(1);
    expect(decl(card[0].body, 'scale')).toBe(capped('--jelly-hover-plump', true));
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
    expect(decl(dent[0].body, 'scale')).toBe(capped('--jelly-hover-dent', false));
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
    expect(card.selectors[0].startsWith(`${SCOPE}${HOST}:active${IN_BODY}`)).toBe(true);
    expect(decl(card.body, 'scale')).toBe(capped('--jelly-press-card', false));
    expect(decl(card.body, '--jelly-spring-t')).toBe(PRESS);
    expect(control.selectors[0].startsWith(`${SCOPE}${HOST}:is(button`)).toBe(true);
    expect(decl(control.body, 'scale')).toBe(capped('--jelly-press-control', false));
  });

  it('presses every Button variant (D-C3): the control rule never singles one out', () => {
    const control = pressRules[1]?.selectors[0] ?? '';
    expect(control).toContain("[data-slot='button']");
    expect(control).not.toContain('data-variant');
    // …and the Button carries no press or transition utility of its own any more (globals.css states them, below).
    const button = read('components/ui/button.tsx');
    expect(button).not.toMatch(/active:scale-|transition-\[/);
  });

  it('a real control inside a host presses, the host does not; a plain link does not stop the card (Task 8)', () => {
    expect(pressRules).toHaveLength(2);
    const [card, control] = pressRules;
    // A card squashes when it is a press body, or when no real control inside it is the thing pressed.
    expect(card.selectors).toEqual([`${SCOPE}${HOST}:active${IN_BODY}:is(${BODY}, ${NO_REAL})`]);
    // A control is never a press body; it keeps the plain guard.
    expect(control.selectors).toHaveLength(1);
    expect(control.selectors[0].endsWith(`:active${IN_BODY}${NO_REAL}`), control.selectors[0]).toBe(
      true,
    );
    // The guard names a button, a tab, a menu item, a field, the Button and a `.glass-interactive` row; a bare `a` (a
    // card's content link, a delegate link) is not in it, so pressing one squashes the card around it.
    const real = splitTop(REAL_IS.slice(':is('.length, -1));
    expect(real).not.toContain('a');
    expect(real).not.toContain('a:not([data-evert-delegate])');
    for (const s of [
      'button',
      "[role='tab']",
      "[role='menuitem']",
      'input',
      "[data-slot='button']",
    ])
      expect(real).toContain(s);
    expect(real).toContain('.glass-interactive');
  });

  it('a press body squashes as one body when any member is pressed, and the member adds no cue of its own', () => {
    // The body is a host (cards and controls), and a pane/chrome slab becomes one only by opting in.
    expect(splitTop(HOST_IS)).toContain(BODY);
    // It takes the card pose (bodies are containers, often wide), capped by size like every card.
    const [card] = pressRules;
    expect(decl(card.body, 'scale')).toBe(capped('--jelly-press-card', false));
    // A member never squashes or dents on its own while the body is the thing pressing: the press rules exclude it
    // (IN_BODY above) and this rule outranks the Button's plain 0.98 press (globals.css).
    const member = ruleFor(MATERIAL, `${SCOPE}${BODY} :is(${HOST_IS}):active`);
    expect(member).toHaveLength(1);
    expect(decl(member[0].body, 'scale')).toBe('none');
    // An unsized body (a keyboard press) assumes the widest body, so the fallback pose never breaks the edge bound.
    const size = ruleFor(MATERIAL, `:where(${BODY})`);
    expect(size).toHaveLength(1);
    expect(decl(size[0].body, '--jelly-s')).toBe(String(CSS_BODY_SIZE_FALLBACK_PX));
  });

  it('the opt-in is data-jelly-press-body, on every cluster host; data-jelly-press-through is retired', () => {
    expect(read('components/ui/jelly-group.tsx')).toContain('data-jelly-press-body=""');
    expect(read('components/ui/selection-bar.tsx')).toContain('data-jelly-press-body=""');
    expect(read('components/radial/RadialShell.tsx')).toMatch(
      /<header className="radial-topbar glass-chrome" data-jelly-press-body="">/,
    );
    // The scroller's pill holds flat members (news categories): it is their body. Its card tray is not.
    expect(read('components/ui/horizontal-scroller.tsx')).toMatch(
      /data-jelly-press-body=\{surface === 'pill' \? '' : undefined\}/,
    );
    const retired = 'data-jelly-press-through';
    for (const f of [
      'app/jelly-material.css',
      'app/globals.css',
      'components/radial/radial.css',
      'components/ui/jelly-group.tsx',
      'components/ui/selection-bar.tsx',
      'components/radial/RadialShell.tsx',
      'components/ui/tabs.tsx',
    ])
      expect(read(f), f).not.toContain(retired);
  });

  it('keeps the press, plain, under the app high-contrast mode', () => {
    const lite = MATERIAL.filter(
      (r) => decl(r.body, '--jelly-spring-t') === PRESS && !r.body.includes('scale:'),
    );
    expect(lite).toHaveLength(1);
    expect(lite[0].selectors.sort()).toEqual([`${SCOPE}.app-high-contrast ${HOST}`]);
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
      expect(r.selectors[0].startsWith('html:not(.native-material) :is(.glass-fill')).toBe(true);
    }
    expect(wake[0].selectors[0].endsWith(':hover')).toBe(true);
    expect(decl(wake[0].body, '--jelly-floor-size')).toBe('auto, auto, var(--jelly-tile-size)');
    // The dot sits where the squash does: on a press body for any member, never on a member, never under a real control.
    expect(wake[1].selectors).toHaveLength(1);
    expect(wake[1].selectors[0].endsWith(`:active${IN_BODY}:is(${BODY}, ${NO_REAL})`)).toBe(true);
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
    // It also stands down where the press squashes something AROUND the pressed element (Task 8): a plain link inside a
    // host (the card squashes), and a pointer-pressed member of a press body (the body squashes). One cue per press.
    const guard = `:not(:where(${SCOPE}${HOST}, ${SCOPE}${HOST} ${PLAIN_A}, ${SCOPE}${BODY} *:not(:focus-visible)))`;
    for (const s of cue[0].selectors) expect(s.endsWith(`${guard}:active`), s).toBe(true);
    expect(cue[0].selectors.join(' ')).not.toContain('data-jelly-active');
  });

  it('a keyboard-activated member of a press body keeps the legacy cue; a pointer-pressed one adds none (Task 8 fix)', () => {
    // Chromium sets :active on the member alone for a keyboard Space/Enter, so the body never squashes then: the
    // member's own opacity cue is the only press feedback. A pointer press squashes the body and the member stays quiet.
    const cue = GLOBALS.filter(
      (r) => r.selectors.some((s) => s.includes(':active')) && /opacity\s*:\s*0?\.\d/.test(r.body),
    );
    const sel = cue[0]?.selectors[0] ?? '';
    const clause = `${SCOPE}${BODY} *`;
    expect(sel).toContain(`${clause}:not(:focus-visible)`);
    // No other, unconditional copy of the body clause that would still drop the cue for a focus-visible member.
    expect(sel.split(clause).length - 1).toBe(1);
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
    expect(decl(pill[0].body, 'scale')).toBe(capped('--jelly-press-control', false));
    expect(decl(pill[0].body, '--jelly-spring-t')).toBe(PRESS);
    const inner = ruleFor(RADIAL, `${SCOPE}.radial-feed__compose > button`);
    expect(inner).toHaveLength(1);
    expect(decl(inner[0].body, 'scale')).toBe('none');
  });

  it('the hook mounts the pointer variable, not the physics, registry or fallback light', () => {
    const hook = read('hooks/useJellyPointer.ts').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(hook).toMatch(/installPointerVars\(document\)/);
    expect(hook).not.toMatch(
      /installJellyPhysics|installJellyRegistry|installLiquidInteractions|jelly\/physics|jelly\/registry|liquid\/runtime/,
    );
  });
});

describe('the spring reaches every host', () => {
  /** The selector's last compound (after its final top-level combinator). */
  const lastCompound = (sel: string) => {
    let depth = 0;
    let cur = '';
    const parts: string[] = [];
    for (const c of sel) {
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (' >+~'.includes(c) && depth === 0) {
        if (cur) parts.push(cur);
        cur = '';
      } else cur += c;
    }
    if (cur) parts.push(cur);
    return parts.at(-1) ?? '';
  };
  const HOST_WORD =
    /(?:^|[\s>+~(,])(?:button|summary|a)(?=$|[\s.:[#,)])|\.glass-fill|\.glass-interactive|\[data-evert|\[data-slot='button'\]|\[role='(?:button|tab|menuitem|switch|option)'\]|\[data-fluid-press/;
  /** The sheets whose layered rules can state a host's transition, with the layer an `@import … layer()` gives them. */
  const SHEETS: [string, string | null][] = [
    ['app/globals.css', null],
    ['app/glass-roles.css', null],
    ['app/jelly-material.css', null],
    ['app/jelly-coverage.css', null],
    ['app/jelly-arcs.css', null],
    ['components/ui/jelly-group.css', '@layer components'],
  ];

  it('no base- or components-layer rule transitions a host without the spring hook', () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const [file, imported] of SHEETS) {
      for (const r of rules(read(file))) {
        const t = decl(r.body, 'transition') ?? decl(r.body, 'transition-property');
        if (!t || t === 'none') continue;
        const layer =
          [imported, ...r.at].filter((a): a is string => !!a && a.startsWith('@layer')).at(-1) ??
          '';
        if (!/\b(?:base|components)\b/.test(layer)) continue;
        for (const sel of r.selectors) {
          const last = lastCompound(sel);
          if (/::|:(?:before|after)\b/.test(last) || !HOST_WORD.test(` ${last}`)) continue;
          scanned++;
          if (!/var\(--jelly-spring-t\)/.test(r.body))
            offenders.push(`${file}: ${sel.slice(0, 120)}`);
        }
      }
    }
    expect(scanned, 'the scan found the host transition rules').toBeGreaterThan(10);
    expect(
      offenders,
      "A layered rule that states a transition on a soft-body host outranks the hook's zero-specificity default, so " +
        "the host's press and release would snap. Append `var(--jelly-spring-t)` to its list (app/jelly-material.css §8).",
    ).toEqual([]);
  });

  /** Tailwind v4's compiled property lists (node_modules/tailwindcss, `transition*` utilities). */
  const COLORS = [
    'color',
    'background-color',
    'border-color',
    'outline-color',
    'text-decoration-color',
    'fill',
    'stroke',
    '--tw-gradient-from',
    '--tw-gradient-via',
    '--tw-gradient-to',
  ];
  const ALL = [
    ...COLORS,
    'opacity',
    'box-shadow',
    'transform',
    'translate',
    'scale',
    'rotate',
    'filter',
    '-webkit-backdrop-filter',
    'backdrop-filter',
    'display',
    'content-visibility',
    'overlay',
    'pointer-events',
  ];
  const UTILITIES: [string, string[]][] = [
    ['transition', ALL],
    ['transition-colors', COLORS],
    ['transition-opacity', ['opacity']],
    ['transition-shadow', ['box-shadow']],
  ];
  const D = 'var(--tw-duration, calc(var(--site-transition-speed, 200ms) * 0.75))';
  const E = 'var(--tw-ease, var(--ease-smooth))';

  it('the property lists are the installed Tailwind’s own', () => {
    const tw = read('node_modules/tailwindcss/dist/lib.mjs');
    expect(tw).toContain(`"${ALL.join(', ')}"`);
    expect(tw).toContain(`"${COLORS.join(', ')}"`);
    // …and the site's inline transition defaults (app/globals.css @theme inline) are what the restatement uses.
    const theme = read('app/globals.css');
    expect(theme).toMatch(
      /--default-transition-duration: calc\(var\(--site-transition-speed, 200ms\) \* 0\.75\);/,
    );
    expect(theme).toMatch(/--default-transition-timing-function: var\(--ease-smooth\);/);
  });

  it.each(UTILITIES)(
    'a host carrying `%s` keeps its colours and springs its pose (unlayered restatement)',
    (cls, list) => {
      const r = MATERIAL.filter(
        (x) => x.at.length === 0 && x.selectors.includes(`${SCOPE}${HOST}[class~='${cls}']`),
      );
      expect(r).toHaveLength(1);
      const props = splitTop(decl(r[0].body, 'transition-property') ?? '');
      const expected = list.includes('scale') ? list : [...list, 'translate', 'scale'];
      expect(props).toEqual(expected);
      const dur = splitTop(decl(r[0].body, 'transition-duration') ?? '');
      const ease = splitTop(decl(r[0].body, 'transition-timing-function') ?? '');
      expect(dur).toHaveLength(props.length);
      expect(ease).toHaveLength(props.length);
      props.forEach((p, i) => {
        const pose = p === 'scale' || p === 'translate';
        expect(dur[i], `${cls} ${p} duration`).toBe(pose ? 'var(--jelly-spring-dur)' : D);
        expect(ease[i], `${cls} ${p} easing`).toBe(pose ? 'var(--jelly-spring-ease)' : E);
      });
    },
  );

  it('every state that sets the hook sets its duration and easing to the same spring', () => {
    const states = MATERIAL.filter((r) => decl(r.body, '--jelly-spring-t'));
    const radial = RADIAL.filter((r) => decl(r.body, '--jelly-spring-t'));
    expect(states.length).toBeGreaterThanOrEqual(3);
    for (const r of [...states, ...radial]) {
      const t = decl(r.body, '--jelly-spring-t')!;
      if (!t.startsWith('scale ')) continue; // the :root no-op
      const curve = t === RELEASE ? 'release' : 'press';
      expect(decl(r.body, '--jelly-spring-dur'), r.selectors[0]).toBe(`var(--spring-${curve}-dur)`);
      expect(decl(r.body, '--jelly-spring-ease'), r.selectors[0]).toBe(`var(--spring-${curve})`);
    }
  });

  /**
   * An arbitrary `transition-[…]` utility on a host cannot be restated in CSS: that host's pose snaps. Frozen
   * 2026-11-08, one-directional — a new one fails, and a listed one that no longer matches must come out. Found by
   * a source scan: a `transition-[` on a line whose own text or the three lines above open a host (a button, a
   * summary, a control role, a glass card, an eversion or press mark).
   */
  const ARBITRARY_TRANSITION_DEBT: Record<string, number> = {
    'components/feed/CommunitiesColumn.tsx': 1,
    'components/feed/FeedList.tsx': 1,
    'components/feed/SocialListModal.tsx': 1,
    'components/feed/StreakColumn.tsx': 1,
    'components/groupcall/GroupCallInviteDialog.tsx': 1,
  };

  it('arbitrary transition-[…] utilities on hosts only go down (ratchet)', () => {
    const HOST_SRC =
      /<(?:button|summary)\b|role="(?:button|tab|menuitem|switch|option)"|glass-fill|glass-interactive|data-evert|data-fluid-press|data-slot="button"/;
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p, out);
        else if (p.endsWith('.tsx')) out.push(p);
      }
      return out;
    };
    const found: Record<string, number> = {};
    for (const f of [...walk('components'), ...walk('app')]) {
      const lines = read(f).split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('transition-[')) return;
        if (HOST_SRC.test(lines.slice(Math.max(0, i - 3), i + 1).join('\n')))
          found[f] = (found[f] ?? 0) + 1;
      });
    }
    expect(
      found,
      'A host with an arbitrary transition-[…] utility keeps that list, so its press and release snap. Use ' +
        '`transition-colors` (restated with the spring in app/jelly-material.css §8b) or add `scale` to the list on ' +
        'the spring; when one goes away, remove its entry here.',
    ).toEqual(ARBITRARY_TRANSITION_DEBT);
  }, 30_000);
});

describe('jellyMotion = still (Review Focus 2): hover and press keep responding', () => {
  it('no soft-body rule is gated on the motion level', () => {
    const own = MATERIAL.filter((r) =>
      r.selectors.some((s) => s.includes(HOST) || s.includes(`:is(${HOST_IS})`)),
    );
    expect(own.length).toBeGreaterThanOrEqual(10);
    for (const r of own)
      for (const s of r.selectors)
        expect(s, 'a §8 rule names the motion level').not.toMatch(/jelly-motion/);
    // The wake and the light dot (the woken-host floor rules that read --px / --py) are not gated on it either.
    for (const r of MATERIAL.filter((x) => /var\(--px/.test(x.body)))
      for (const s of r.selectors) expect(s).not.toMatch(/jelly-motion/);
  });

  it('the pointer variable never checks the motion level', () => {
    const src = read('lib/jelly/pointer-vars.ts').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(src).not.toMatch(/jelly-motion|jellyMotion|jellyMotionLevel/);
  });
});
