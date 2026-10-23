/**
 * The liquid globe is Plasmatic Jelly drawn by its OWN round shader (components/radial/jelly-glass.ts), so no element
 * of it may be admitted by the rectangular slab services. The owner's report — "the plasma is outlining the shape in
 * a square" — was the square `.radial-globe__stage` carrying `data-jelly="on"` as a private "shader has drawn" flag:
 * `[data-jelly]` is the site material's opt-in, so jelly-coverage.css painted its rim, static haze floor and plasma
 * subsurface glow round the stage's bounding box, and the click-arc service took it for a host.
 *
 * This pins both halves: the globe never spells the material's opt-ins on its own elements, and every service's
 * admission rule (registry → carriers/arcs, the engine's slab exclude, physics' opt-out, click arcs) drops the globe
 * through the one shared `GLOBE_SELECTOR` even if a role were put on it by mistake.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pressHost } from '../arcs/clicks';
import { REGISTRY_EXCLUDE, isJellyHost } from '../registry';
import { resolveSoftPolicy } from '../soft-policy';
import { GLOBE_SELECTOR, JELLY_SELECTOR, OPT_OUT_SELECTOR, jellyOptedOut } from '../tiers';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * A tiny fake DOM (the suite runs in node; same approach as registry.test.ts): an element matches a selector list when
 * one of its comma-separated parts is a simple selector the element carries — `tag`, `.class`, `[attr]`,
 * `[attr="value"]`, `a[href]`. Every selector these services use on the globe is a list of such parts.
 */
class El {
  parent: El | null = null;
  children: El[] = [];
  readonly classList: Set<string>;
  constructor(
    readonly tagName: string,
    classes: string,
    readonly attrs: Record<string, string> = {},
  ) {
    this.classList = new Set(classes.split(/\s+/).filter(Boolean));
  }
  get className() {
    return [...this.classList].join(' ');
  }
  get isConnected() {
    return true;
  }
  append(...kids: El[]): El {
    for (const k of kids) {
      k.parent = this;
      this.children.push(k);
    }
    return this;
  }
  private simple(): Set<string> {
    const out = new Set<string>([this.tagName]);
    for (const c of this.classList) out.add(`.${c}`);
    for (const [k, v] of Object.entries(this.attrs)) {
      out.add(`[${k}]`);
      out.add(`[${k}="${v}"]`);
      out.add(`${this.tagName}[${k}]`);
    }
    return out;
  }
  matches(selector: string): boolean {
    const mine = this.simple();
    return selector.split(',').some((part) => mine.has(part.trim()));
  }
  closest(selector: string): El | null {
    return this.matches(selector) ? this : (this.parent?.closest(selector) ?? null);
  }
  all(): El[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}
const asEl = (e: El) => e as unknown as HTMLElement;

/** The globe's DOM as LiquidGlobe + RadialGlobeDock render it, inside a glass rail. */
function mountGlobe(stageAttrs: Record<string, string> = { 'data-globe-coat': 'on' }, stageClass = '') {
  const pin = new El('a', 'radial-globe__pin', { href: '/explore', role: 'menuitem', 'data-fluid-press': 'lift' });
  const pinName = new El('span', 'radial-globe__pin-name');
  pin.append(new El('span', 'radial-globe__pin-dot'), pinName);
  const coat = new El('canvas', 'radial-globe__jelly', { 'aria-hidden': 'true' });
  const stage = new El('div', `radial-globe__stage ${stageClass}`, stageAttrs).append(
    new El('span', 'radial-globe__glass').append(new El('span', 'radial-globe__contact'), coat),
    new El('canvas', 'radial-globe__cage'),
    new El('ul', 'radial-globe__pins', { role: 'menu' }).append(
      new El('li', 'radial-globe__pin-wrap', { role: 'none' }).append(pin),
    ),
  );
  const globe = new El('div', 'radial-globe', { tabindex: '-1' }).append(stage);
  const dock = new El('div', 'rad-globe-dock').append(globe, new El('span', 'rad-globe-dock__shimmer'));
  const rail = new El('aside', 'glass-chrome').append(new El('nav', 'rad-rail rad-rail--globe').append(dock));
  const parts = rail.all().filter((e) => e.matches(GLOBE_SELECTOR));
  return { rail, dock, globe, stage, coat, pin, pinName, parts };
}

describe('the liquid globe is never a rectangular jelly host', () => {
  it('the globe never marks its own elements with the site material opt-ins', () => {
    for (const file of [
      'components/radial/LiquidGlobe.tsx',
      'components/radial/RadialGlobeDock.tsx',
      'components/radial/jelly-glass.ts',
    ]) {
      const src = read(file);
      expect(src, `${file}: dataset.jelly / data-jelly is the material opt-in`).not.toMatch(
        /dataset\.jelly\b(?!Zone|Scope)|['"`]data-jelly['"`]|\sdata-jelly=/,
      );
      expect(src, `${file}: no glass role class on a globe element`).not.toMatch(
        /className=["'`][^"'`]*\bglass-(?:fill|pane|chrome|overlay|inset|interactive)\b/,
      );
      expect(src).not.toMatch(/\sdata-evert[=\s>]|\sdata-liquid-glass[=\s>]/);
    }
    const css = read('components/radial/radial.css');
    expect(css, 'radial.css keys the coat on data-globe-coat').not.toMatch(
      /\.radial-globe__stage\[data-jelly/,
    );
    expect(css).toMatch(/\.radial-globe__stage\[data-globe-coat='on'\]/);
  });

  it('the shared selector covers every globe body part and rides the opt-out', () => {
    const { parts: els } = mountGlobe();
    const parts = els.map((el) => el.className);
    expect(parts).toEqual(
      expect.arrayContaining([
        'rad-globe-dock',
        'radial-globe',
        'radial-globe__stage',
        'radial-globe__glass',
        'radial-globe__jelly',
        'radial-globe__cage',
      ]),
    );
    for (const part of GLOBE_SELECTOR.split(',')) expect(OPT_OUT_SELECTOR.split(',')).toContain(part);
    for (const el of els) expect(jellyOptedOut(asEl(el)), el.className).toBe(true);
  });

  it('no globe element is admitted by the registry, the engine, physics or click arcs — even when mis-marked', () => {
    // The worst case: the stage carries the old flag AND a role class. Still out.
    const g = mountGlobe({ 'data-jelly': 'on', 'data-globe-coat': 'on' }, 'glass-fill');
    expect(g.stage.matches(JELLY_SELECTOR), 'the fixture really is mis-marked').toBe(true);
    for (const el of g.parts) {
      expect(isJellyHost(asEl(el)), `registry admits ${el.className}`).toBe(false);
      expect(el.matches(REGISTRY_EXCLUDE) || jellyOptedOut(asEl(el))).toBe(true);
      // Physics: its traits mark an element matching OPT_OUT_SELECTOR as scope-off, which resolves to mode off.
      expect(
        resolveSoftPolicy({
          tag: el.tagName.toLowerCase(),
          role: null,
          classes: [...el.classList],
          attrs: { 'data-jelly': 'card' },
          scopeOff: el.matches(OPT_OUT_SELECTOR),
        }).mode,
        `physics body on ${el.className}`,
      ).toBe('off');
    }
    // The engine excludes the same selector from slab admission.
    expect(read('lib/liquid/glass/engine.ts')).toMatch(/const EXCLUDE = `[^`]*\$\{GLOBE_SELECTOR\}/);
    // A press anywhere on the globe — the glass, a pin — never makes a rect host (the globe's, or the rail's) arc.
    expect(pressHost(asEl(g.coat))).toBeNull();
    expect(pressHost(asEl(g.pinName))).toBeNull();
    expect(pressHost(asEl(g.stage))).toBeNull();
    // The rail around it is still an ordinary host.
    expect(isJellyHost(asEl(g.rail))).toBe(true);
  });

  it('the pins keep their own lift press (they are not globe body parts)', () => {
    const { pin } = mountGlobe();
    expect(pin.matches(GLOBE_SELECTOR)).toBe(false);
    expect(pin.matches(OPT_OUT_SELECTOR)).toBe(false);
  });
});
