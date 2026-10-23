import { describe, expect, it } from 'vitest';
import { governBudget, GOVERNED_HAZE_SCALE, knobsAt } from '@/lib/jelly/governor';
import { AMBIENT_BOUNDS, CHARGE, IDLE_AFTER_MS, JELLY_BUDGETS, PLASMA } from '@/lib/jelly/tiers';
import { HAZE_FRAG } from '../haze-shader';
import {
  GLASS_BUDGET,
  HAZE,
  PLASMA_LOOK,
  addRing,
  admit,
  ambientHz,
  dueHaze,
  easePlasma,
  hazeEligible,
  hazeScaleFor,
  hazeSize,
  hazeSlots,
  latticeAmplitude,
  nextDue,
  overdrawMargin,
  packRings,
  ringAlive,
  ringLifetimeMs,
  ringState,
  seedFor,
  type Candidate,
  type ClockState,
  type GlassRole,
} from '../policy';
import { FRAG } from '../shader';

const engaged: ClockState = {
  hidden: false,
  focused: true,
  scrolling: false,
  hazeSurfaces: 3,
  ambient: true,
  msSinceInput: 0,
  clockHz: 30,
  idleClockHz: 12,
};

describe('ambient clock (R7)', () => {
  it('runs at the tier clock while engaged and drops to the idle floor — never to 0 — after IDLE_AFTER_MS', () => {
    expect(ambientHz(engaged)).toBe(30);
    expect(ambientHz({ ...engaged, msSinceInput: IDLE_AFTER_MS - 1 })).toBe(30);
    expect(ambientHz({ ...engaged, msSinceInput: IDLE_AFTER_MS + 1 })).toBe(12);
    expect(ambientHz({ ...engaged, msSinceInput: 10 * 60_000 })).toBe(12);
  });

  it.each<[string, Partial<ClockState>]>([
    ['the tab is hidden', { hidden: true }],
    ['the window is unfocused', { focused: false }],
    ['a scroll is in flight', { scrolling: true }],
    ['no haze surface is on screen', { hazeSurfaces: 0 }],
    ['ambient motion is off (degraded tier, still, a game playing)', { ambient: false }],
  ])('stops (0 Hz, so no loop) when %s', (_, patch) => {
    expect(ambientHz({ ...engaged, ...patch })).toBe(0);
    expect(ambientHz({ ...engaged, ...patch, msSinceInput: IDLE_AFTER_MS * 3 })).toBe(0);
  });

  it('follows the governed and calm-capped budget, and never exceeds the engaged clock when idle', () => {
    const governed = governBudget(JELLY_BUDGETS.full, 1);
    expect(
      ambientHz({ ...engaged, clockHz: governed.clockHz, idleClockHz: governed.idleClockHz }),
    ).toBe(20);
    const ladderEnd = governBudget(JELLY_BUDGETS.full, 6);
    expect(
      ambientHz({ ...engaged, clockHz: ladderEnd.clockHz, idleClockHz: ladderEnd.idleClockHz }),
    ).toBe(0);
    expect(
      ambientHz({ ...engaged, clockHz: 12, idleClockHz: 30, msSinceInput: IDLE_AFTER_MS + 1 }),
    ).toBe(12);
  });

  it('handheld runs 15 Hz engaged and 8 Hz idle; lite and off have no clock', () => {
    const h = JELLY_BUDGETS.handheld;
    expect(ambientHz({ ...engaged, clockHz: h.clockHz, idleClockHz: h.idleClockHz })).toBe(15);
    expect(
      ambientHz({
        ...engaged,
        clockHz: h.clockHz,
        idleClockHz: h.idleClockHz,
        msSinceInput: IDLE_AFTER_MS + 1,
      }),
    ).toBe(8);
    for (const t of ['lite', 'off'] as const) {
      const b = JELLY_BUDGETS[t];
      expect(ambientHz({ ...engaged, clockHz: b.clockHz, idleClockHz: b.idleClockHz })).toBe(0);
    }
  });
});

describe('haze slots and caps', () => {
  it('controls never get a haze canvas; every other role may', () => {
    expect(hazeEligible('control')).toBe(false);
    for (const r of ['overlay', 'chrome', 'pane', 'fill', 'other'] as GlassRole[])
      expect(hazeEligible(r)).toBe(true);
    const ranked = (['overlay', 'pane', 'fill', 'control', 'control'] as GlassRole[]).map(
      (role, i) => ({
        role,
        i,
      }),
    );
    expect(hazeSlots(ranked).map((e) => e.role)).toEqual(['overlay', 'pane', 'fill']);
  });

  it('the tier budgets cap ambient slots at 8 / 6 / 4 and lattices at 8 / 6 / 4', () => {
    expect(
      [JELLY_BUDGETS.full, JELLY_BUDGETS.coarse, JELLY_BUDGETS.handheld].map((b) => b.hazeSlots),
    ).toEqual([8, 6, 4]);
    expect(
      [JELLY_BUDGETS.full, JELLY_BUDGETS.coarse, JELLY_BUDGETS.handheld].map((b) => b.lattices),
    ).toEqual([8, 6, 4]);
    expect(JELLY_BUDGETS.lite.hazeSlots + JELLY_BUDGETS.off.hazeSlots).toBe(0);
  });

  it('rim admission follows the tier budget and never exceeds the engine ceiling', () => {
    const many: Candidate[] = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      role: 'fill',
      order: i,
      visible: true,
      width: 200,
      height: 100,
    }));
    expect(admit(many)).toHaveLength(GLASS_BUDGET.maxSurfaces);
    expect(admit(many, JELLY_BUDGETS.coarse.rims)).toHaveLength(16);
    expect(admit(many, JELLY_BUDGETS.handheld.rims)).toHaveLength(10);
    expect(admit(many, 2)).toHaveLength(2);
    expect(admit(many, 0)).toHaveLength(0);
    expect(admit(many, 100)).toHaveLength(GLASS_BUDGET.maxSurfaces);
  });

  it('no haze canvas exceeds 256px on its long side (128 for fills), nor a quarter of the CSS size', () => {
    for (const [w, h] of [
      [40, 40],
      [360, 180],
      [1200, 56],
      [1920, 1080],
      [4000, 300],
      [300, 5000],
    ]) {
      for (const role of ['overlay', 'chrome', 'pane', 'fill'] as GlassRole[]) {
        const [pw, ph] = hazeSize(w, h, role);
        const cap = role === 'fill' ? HAZE.fillMaxSide : HAZE.maxSide;
        expect(Math.max(pw, ph)).toBeLessThanOrEqual(cap + 1);
        expect(hazeScaleFor(w, h, role)).toBeLessThanOrEqual(HAZE.baseScale);
      }
    }
  });

  it("the governor's haze-scale step lowers the scale and never raises it", () => {
    expect(knobsAt(5).hazeScale).toBe(GOVERNED_HAZE_SCALE);
    expect(hazeScaleFor(360, 180, 'pane', knobsAt(5).hazeScale)).toBe(GOVERNED_HAZE_SCALE);
    expect(hazeScaleFor(360, 180, 'pane', knobsAt(0).hazeScale)).toBe(HAZE.baseScale);
    expect(hazeScaleFor(3000, 3000, 'pane', knobsAt(5).hazeScale)).toBeLessThan(
      GOVERNED_HAZE_SCALE,
    );
  });
});

describe('haze scheduling', () => {
  const tickets = (dues: number[]) => dues.map((due, id) => ({ id, due }));

  it('draws at most 6 haze surfaces in one frame, however many are due', () => {
    const all = tickets(Array.from({ length: 24 }, () => 0));
    expect(dueHaze(all, 100)).toHaveLength(HAZE.maxDrawsPerFrame);
    expect(HAZE.maxDrawsPerFrame).toBe(6);
    expect(dueHaze(all, 100, 50)).toHaveLength(6);
    expect(dueHaze(all, 100, 2)).toHaveLength(2);
  });

  it('takes the oldest due first and leaves the not-yet-due alone (a round robin)', () => {
    const t = tickets([50, 10, 500, 30, 1000]);
    expect(dueHaze(t, 100).map((i) => i.id)).toEqual([1, 3, 0]);
    // Round robin: what is drawn moves to the back; the rest go first next tick.
    const items = tickets(Array.from({ length: 8 }, (_, i) => i));
    const drawnFirst = dueHaze(items, 100);
    for (const i of drawnFirst) i.due = nextDue(100, 30, 'pane');
    const second = dueHaze(items, 101);
    expect(second.map((i) => i.id)).toEqual([6, 7]);
  });

  it('fills tick at half rate, every other role at the clock; no clock means never due', () => {
    expect(nextDue(0, 30, 'pane')).toBeCloseTo(1000 / 30);
    expect(nextDue(0, 30, 'fill')).toBeCloseTo((1000 / 30) * HAZE.fillRateDivisor);
    expect(nextDue(0, 0, 'pane')).toBe(Infinity);
  });

  it('seeds are stable, in [0,1), and differ between neighbours', () => {
    const seeds = Array.from({ length: 24 }, (_, i) => seedFor(i));
    for (const s of seeds) expect(s >= 0 && s < 1).toBe(true);
    expect(new Set(seeds.map((s) => s.toFixed(4))).size).toBe(24);
    expect(seedFor(7)).toBe(seedFor(7));
  });
});

describe('lattice overdraw and charge pulse', () => {
  it('overdraws at most 2px, only on cards and controls, and never without lattices', () => {
    expect(overdrawMargin('fill', true)).toBe(AMBIENT_BOUNDS.maxOverdrawPx);
    expect(overdrawMargin('control', true)).toBeLessThanOrEqual(2);
    for (const r of ['overlay', 'chrome', 'pane'] as GlassRole[])
      expect(overdrawMargin(r, true)).toBe(0);
    for (const r of ['fill', 'control'] as GlassRole[]) expect(overdrawMargin(r, false)).toBe(0);
  });

  it('halves the lattice amplitude on large surfaces', () => {
    expect(latticeAmplitude(300, 120)).toBe(1);
    expect(latticeAmplitude(1000, 400)).toBe(AMBIENT_BOUNDS.largeLatticeScale);
  });
});

describe('#989 plasma level and charge rings', () => {
  it('the plasma level eases (never steps), settles exactly, and is clamped to 0..1', () => {
    const a = easePlasma(0, 1, 16);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(0.2);
    let v = 0;
    for (let i = 0; i < 200; i++) v = easePlasma(v, PLASMA.wake, 16);
    expect(v).toBe(PLASMA.wake);
    expect(easePlasma(0.5, 7, 1e6)).toBe(1);
    expect(easePlasma(0.5, -3, 1e6)).toBe(0);
    expect(easePlasma(0, 0, 16)).toBe(0); // at rest it stays exactly 0
    expect(easePlasma(0.3, 1, 0)).toBe(0.3);
  });

  it('a ring travels at the pulse speed and decays with the pulse tau', () => {
    expect(ringState(1, 0)).toEqual({ radius: 0, amp: 1 });
    const r = ringState(1, CHARGE.pulseTauMs);
    expect(r.radius).toBeCloseTo((CHARGE.pulseSpeedPxS * CHARGE.pulseTauMs) / 1000);
    expect(r.amp).toBeCloseTo(Math.exp(-1));
    expect(ringState(1, -1).amp).toBe(0);
    expect(ringState(5, 0).amp).toBe(1);
  });

  it('a ring has a bounded lifetime, and dies sooner when its front leaves the surface', () => {
    const life = ringLifetimeMs(1);
    expect(life).toBeLessThan(CHARGE.pulseTauMs * 5);
    expect(ringLifetimeMs(0)).toBe(0);
    const ring = { x: 0, y: 0, q: 1, at: 0 };
    expect(ringAlive(ring, 10, 10_000)).toBe(true);
    expect(ringAlive(ring, life + 1, 10_000)).toBe(false);
    const crossed = ((40 + PLASMA_LOOK.ringWidthPx * 2) / CHARGE.pulseSpeedPxS) * 1000 + 1;
    expect(ringAlive(ring, crossed, 40)).toBe(false);
  });

  it('rings per surface are bounded, oldest dropped; same-instant twins merge', () => {
    let rings: ReturnType<typeof addRing> = [];
    for (let i = 0; i < 9; i++) rings = addRing(rings, { x: i * 100, y: 0, q: 0.5, at: i * 100 });
    expect(rings).toHaveLength(PLASMA_LOOK.ringsPerSurface);
    expect(rings[0]!.at).toBe(600);
    const merged = addRing([{ x: 10, y: 10, q: 0.4, at: 1000 }], {
      x: 14,
      y: 12,
      q: 0.9,
      at: 1020,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.q).toBe(0.9);
    expect(addRing([], { x: 0, y: 0, q: 0, at: 0 })).toHaveLength(0);
  });

  it('packs at most four live rings into the shader array and zeroes the rest', () => {
    const out = new Float32Array(16).fill(9);
    const n = packRings(
      [
        { x: 1, y: 2, q: 1, at: 0 },
        { x: 3, y: 4, q: 1, at: -1e6 }, // spent
      ],
      100,
      out,
    );
    expect(n).toBe(1);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(2);
    expect(out[3]).toBeGreaterThan(0);
    expect([...out.slice(4)].every((v) => v === 0)).toBe(true);
  });
});

describe('shader contract', () => {
  it('the rim reads the lattice and jelly terms but never a clock; the haze reads the clock', () => {
    expect(FRAG).toContain('uniform vec2 uJelly[8]');
    expect(FRAG).toContain('uJellyOn');
    expect(FRAG).toContain('uDispersion');
    expect(FRAG).not.toContain('uTime');
    expect(HAZE_FRAG).toContain('uniform float uTime');
    // Alpha is capped in the shader, far above what the legibility tokens allow.
    expect(HAZE_FRAG).toContain('clamp(hazeA + plasmaA + sss, 0.0, 0.6)');
  });

  it('#989: no broad gloss band or face glint — specular lives at the edges and in the dent', () => {
    // The old diagonal sheen across the face and the cursor bloom on the face are gone.
    for (const src of [FRAG, HAZE_FRAG]) {
      expect(src).not.toMatch(/\bsheen\b/);
      expect(src).not.toMatch(/\bcurGlow\b/);
      expect(src).not.toMatch(/\bbloom\b/);
      expect(src).not.toMatch(/\bgloss\b/);
    }
    // Every specular term is masked to the bevel band.
    expect(FRAG).toContain('float edgeOnly = 1.0 - smoothstep(0.6, 1.0, t);');
    for (const term of ['keySpec', 'fillSpec', 'curSpec', 'counter']) {
      const line = FRAG.split('\n').find((l) => l.trim().startsWith(`float ${term} =`));
      expect(line, term).toBeDefined();
      expect(line!.trim().endsWith('* edgeOnly;'), term).toBe(true);
    }
  });

  it('#989: RGB-led edge, Fresnel line, gel depth, plasma clipped inside, dent glow and light dot', () => {
    for (const decl of [
      'vec3 uDisperse',
      'vec2 uBand',
      'vec4 uFresnel',
      'vec4 uEdgeR',
      'vec4 uEdgeB',
      'vec4 uDent',
      'vec2 uDentStretch',
      'vec4 uSpecular',
    ])
      expect(FRAG).toContain(`uniform ${decl};`);
    // Signed split (negative = toward the light): each channel's band, tinted by its --gel-edge-* token.
    expect(FRAG).toContain('jBand(d - sh * uDisperse.r - d0, bw) * uEdgeR.a');
    expect(FRAG).toContain('jBand(d - sh * uDisperse.b - d0, bw) * uEdgeB.a');
    // The body → depth coat is CSS; the shader must not draw it a second time.
    expect(FRAG).not.toContain('uDepth');
    // Plasma: both programs, clipped inside the gel (never an outline), in the accent colour.
    for (const src of [FRAG, HAZE_FRAG]) {
      expect(src).toContain('float clip = smoothstep(3.0, 14.0, d);');
      expect(src).toContain('uniform vec3 uAccent;');
      expect(src).toContain('uniform float uLevel;');
    }
    // Static in the rim (no clock), moving in the haze.
    expect(FRAG).toContain('jPlasma(P, uSize, d, uSeed, 0.0)');
    expect(HAZE_FRAG).toContain('jPlasma(P, uSize, d, uSeed, uTime * uPlasmaMotion)');
  });
});
