/**
 * The #989 press dent's pure parts and its lens: the dent geometry (`envelope.ts` — σ clamp, contact clamp, rubber
 * band capped at `DENT.rubberMaxPx`, one spring formula at `ζ = DENT.damping`) and `lens.ts` — one host at a time,
 * inline `filter` restored exactly, a no-op where SVG filters on HTML are unsupported (WebKit), three displacement
 * passes split by `DENT.lensDispersionPx`, and no turbulence or blur anywhere in the graph.
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { RUBBER_BAND_C, rubberBand } from '@/lib/fluid';

import {
  DENT_SPRING,
  createDentSprings,
  dentContact,
  dentRadius,
  dentSettled,
  stepDent,
  stretchTarget,
} from '../envelope';
import type { JellyDent } from '../lattice-inputs';
import {
  LENS_BOX_SIGMAS,
  LENS_MAP_URL,
  createJellyLens,
  lensGeometry,
  lensSupported,
} from '../lens';
import { DENT } from '../tiers';

class Node_ {
  attrs = new Map<string, string>();
  children: Node_[] = [];
  parent: Node_ | null = null;
  constructor(public tag: string) {}
  setAttribute(n: string, v: string) {
    this.attrs.set(n, v);
  }
  setAttributeNS(_ns: string, n: string, v: string) {
    this.attrs.set(n, v);
  }
  appendChild(c: Node_) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  all(): Node_[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
}

function fakeDoc() {
  const body = new Node_('body');
  const doc = {
    defaultView: null,
    body,
    createElementNS: (_ns: string, tag: string) => new Node_(tag),
  };
  return { doc: doc as unknown as Document, body };
}

const host = (filter = '') => ({ style: { filter } }) as unknown as HTMLElement;
const dent = (over: Partial<JellyDent> = {}): JellyDent => ({
  x: 50,
  y: 40,
  depth: DENT.depthPx,
  radius: 20,
  stretchX: 0,
  stretchY: 0,
  ...over,
});

describe('dent geometry (envelope.ts)', () => {
  it('σ = clamp(radiusFrac · short side)', () => {
    expect(dentRadius(10, 10)).toBe(DENT.minRadiusPx);
    expect(dentRadius(400, 100)).toBeCloseTo(DENT.radiusFrac * 100);
    expect(dentRadius(2000, 2000)).toBe(DENT.maxRadiusPx);
  });

  it('inside: under the pointer; outside: on the edge with a rubber band capped at rubberMaxPx', () => {
    expect(dentContact(30, 20, 100, 50)).toEqual({ x: 30, y: 20, stretchX: 0, stretchY: 0 });
    const near = dentContact(110, 20, 100, 50);
    expect(near).toMatchObject({ x: 100, y: 20, stretchY: 0 });
    expect(near.stretchX).toBeCloseTo(rubberBand(10, DENT.rubberMaxPx, RUBBER_BAND_C));
    for (const far of [1e3, 1e6, Infinity]) {
      const c = dentContact(far, -far, 100, 50);
      expect(Math.hypot(c.stretchX, c.stretchY)).toBeLessThanOrEqual(DENT.rubberMaxPx);
    }
    const diag = dentContact(-300, -300, 100, 50);
    expect(diag.x).toBe(0);
    expect(diag.y).toBe(0);
    expect(diag.stretchX).toBeCloseTo(diag.stretchY);
    expect(diag.stretchX).toBeLessThan(0);
  });

  it('one spring formula: the dent spring is `spring()` at ζ = DENT.damping and settles without ringing much', () => {
    const zeta = DENT_SPRING.damping / (2 * Math.sqrt(DENT_SPRING.stiffness * DENT_SPRING.mass));
    expect(zeta).toBeCloseTo(DENT.damping, 9);
    const d = createDentSprings();
    const target = { depth: DENT.depthPx, stretchX: 0, stretchY: 0 };
    let peak = 0;
    let n = 0;
    while (!dentSettled(d, target) && n++ < 200) {
      stepDent(d, target, 1 / 60);
      peak = Math.max(peak, d.depth.value);
    }
    expect(n).toBeLessThan(60);
    // ζ 0.9 overshoots by e^(−πζ/√(1−ζ²)) ≈ 0.15%.
    expect(peak).toBeLessThan(DENT.depthPx * 1.01);
  });

  it('stretchTarget elongates along the stretch and leans half of it', () => {
    const p = stretchTarget({ sx: 1, sy: 1, tx: 0, ty: 0 }, 10, 0, { w: 200, h: 100 });
    expect(p.sx).toBeCloseTo(1.05);
    expect(p.sy).toBe(1);
    expect(p.tx).toBe(5);
    expect(stretchTarget({ sx: 1, sy: 1, tx: 1, ty: 2 }, 0, 0, { w: 1, h: 1 })).toEqual({
      sx: 1,
      sy: 1,
      tx: 1,
      ty: 2,
    });
  });
});

describe('lens.ts', () => {
  it('geometry: the bowl box is ±3σ, the channel scales split by the dispersion and vanish at depth 0', () => {
    const g = lensGeometry(dent());
    expect(g.size).toBe(2 * LENS_BOX_SIGMAS * 20);
    expect(g.x).toBe(50 - LENS_BOX_SIGMAS * 20);
    expect(g.scaleG).toBeCloseTo(DENT.lensStrength * 20);
    expect((g.scaleR - g.scaleB) / 2).toBeCloseTo(2 * DENT.lensDispersionPx);
    const flat = lensGeometry(dent({ depth: 0 }));
    expect([flat.scaleR, flat.scaleG, flat.scaleB]).toEqual([0, 0, 0]);
  });

  it('support: WebKit and documents without CSS filter support get no lens', () => {
    const win = (ua: string, supports = true) =>
      ({
        CSS: { supports: () => supports },
        navigator: { userAgent: ua },
        document: { createElementNS() {} },
      }) as unknown as Window & typeof globalThis;
    const chrome =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
    const safari =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    const ios =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0';
    const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
    expect(lensSupported(win(chrome))).toBe(true);
    expect(lensSupported(win(firefox))).toBe(true);
    expect(lensSupported(win(safari))).toBe(false);
    expect(lensSupported(win(ios))).toBe(false);
    expect(lensSupported(win(chrome, false))).toBe(false);
    expect(lensSupported(undefined)).toBe(false);
  });

  it('the map is one data URL with no turbulence; the graph has three displacement passes and no blur', () => {
    expect(LENS_MAP_URL.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(LENS_MAP_URL)).not.toMatch(/turbulence|blur/i);
    const { doc, body } = fakeDoc();
    const lens = createJellyLens(doc, { supported: true });
    lens.update(host(), dent());
    const svg = body.children[0];
    expect(svg.attrs.get('aria-hidden')).toBe('true');
    expect(svg.attrs.get('style')).toMatch(/pointer-events:none/);
    const tags = svg.all().map((n) => n.tag);
    expect(tags.filter((t) => t === 'feDisplacementMap')).toHaveLength(3);
    expect(tags.some((t) => /turbulence|blur/i.test(t))).toBe(false);
    const scales = svg
      .all()
      .filter((n) => n.tag === 'feDisplacementMap')
      .map((n) => Number(n.attrs.get('scale')));
    expect(scales[0]).toBeGreaterThan(scales[1]);
    expect(scales[1]).toBeGreaterThan(scales[2]);
    lens.destroy();
    expect(body.children).toHaveLength(0);
  });

  it('one host at a time, inline filter restored exactly; a shallow or null dent releases', () => {
    const { doc } = fakeDoc();
    const lens = createJellyLens(doc, { supported: true });
    const a = host('opacity(1)');
    const b = host();
    lens.update(a, dent());
    expect(lens.host).toBe(a);
    expect(a.style.filter).toMatch(/^url\(#jelly-lens-\d+\)$/);
    lens.update(b, dent());
    expect(lens.host).toBe(b);
    expect(a.style.filter).toBe('opacity(1)');
    lens.release(a); // not the holder: nothing happens
    expect(lens.host).toBe(b);
    lens.update(b, dent({ depth: 0.01 }));
    expect(lens.host).toBeNull();
    expect(b.style.filter).toBe('');
    lens.update(b, dent());
    lens.update(b, null);
    expect(b.style.filter).toBe('');
    lens.update(a, dent());
    lens.destroy();
    expect(a.style.filter).toBe('opacity(1)');
  });

  it('unsupported: a complete no-op', () => {
    const { doc, body } = fakeDoc();
    const lens = createJellyLens(doc, { supported: false });
    const a = host();
    lens.update(a, dent());
    expect(lens.supported).toBe(false);
    expect(lens.host).toBeNull();
    expect(a.style.filter).toBe('');
    expect(body.children).toHaveLength(0);
  });
});
