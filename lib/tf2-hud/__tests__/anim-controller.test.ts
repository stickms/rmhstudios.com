import { describe, expect, it } from 'vitest';
import {
  AnimController,
  parseTarget,
  type AnimEnv,
  type AnimValue,
  type Channel,
} from '../anim/controller';
import { parseAnimScript } from '../anim/parse';
import { animStyle, composeStyles, snapshotOf } from '../anim/style';
import { propsFromMap } from '../kv/props';

const BASES: Record<string, Partial<Record<Channel, AnimValue>>> = {
  bar: { alpha: 255, x: { prefix: '', value: 10 }, fg: { r: 0, g: 0, b: 0, a: 255 } },
  glow: { alpha: 0 },
};
const env: AnimEnv = {
  base: (panel, ch) => BASES[panel]?.[ch],
  color: (raw) => {
    if (raw === 'White') return { r: 255, g: 255, b: 255, a: 255 };
    const p = raw.split(/\s+/).map(Number);
    return p.length === 4 && p.every(Number.isFinite)
      ? { r: p[0], g: p[1], b: p[2], a: p[3] }
      : undefined;
  },
};
const ctl = (text: string) => new AnimController(parseAnimScript(text), env);
const val = (c: AnimController, panel: string, ch: Channel) => c.values().get(`${panel}|${ch}`);

describe('animation controller', () => {
  it('runs an animation from where the panel is to the target, on time', () => {
    const c = ctl('event E { Animate Glow Alpha "200" Linear 0.0 1.0 }');
    c.fire('E', 0);
    c.advance(0);
    expect(val(c, 'glow', 'alpha')).toBe(0);
    c.advance(0.5);
    expect(val(c, 'glow', 'alpha')).toBeCloseTo(100);
    c.advance(1);
    expect(val(c, 'glow', 'alpha')).toBe(200);
    expect(c.busy).toBe(false);
  });

  it('honours start offsets and starts from the value at that moment', () => {
    const c = ctl(
      'event E { Animate Glow Alpha "100" Linear 0.0 1.0  Animate Glow Alpha "0" Linear 0.5 0.5 }',
    );
    c.fire('E', 0);
    c.advance(0.5);
    // The second animation replaced the first half-way, starting from 50.
    expect(val(c, 'glow', 'alpha')).toBeCloseTo(50);
    c.advance(0.75);
    expect(val(c, 'glow', 'alpha')).toBeCloseTo(25);
    c.advance(1.2);
    expect(val(c, 'glow', 'alpha')).toBe(0);
  });

  it('gives the same answer however the time is chopped up', () => {
    const text =
      'event E { Animate Glow Alpha "100" Linear 0.0 1.0  Animate Glow Alpha "0" Linear 0.5 0.5 }';
    const a = ctl(text);
    a.fire('E', 0);
    a.advance(0.9);
    const b = ctl(text);
    b.fire('E', 0);
    for (let t = 0.05; t < 0.9; t += 0.05) b.advance(t);
    b.advance(0.9);
    expect(val(a, 'glow', 'alpha')).toBeCloseTo(val(b, 'glow', 'alpha') as number, 5);
  });

  it('blends colours and keeps position prefixes', () => {
    const c = ctl(
      `event E { Animate Bar FgColor "White" Linear 0 1  Animate Bar Position "r40 5" Linear 0 1 }`,
    );
    c.fire('E', 0);
    c.advance(0.5);
    expect(val(c, 'bar', 'fg')).toEqual({ r: 128, g: 128, b: 128, a: 255 });
    c.advance(1);
    expect(val(c, 'bar', 'x')).toEqual({ prefix: 'r', value: 40 });
    expect(val(c, 'bar', 'y')).toEqual({ prefix: '', value: 5 });
  });

  it('loops by running itself, and StopEvent ends the loop', () => {
    const c = ctl(`
      event Pulse { Animate Glow Alpha "255" Linear 0.0 0.2  Animate Glow Alpha "0" Linear 0.2 0.4  RunEvent PulseLoop 0.4 }
      event PulseLoop { RunEvent Pulse 0.0 }
      event PulseStop { StopEvent Pulse 0.0  StopEvent PulseLoop 0.0 }
    `);
    c.fire('Pulse', 0);
    c.advance(0.2);
    expect(val(c, 'glow', 'alpha')).toBe(255);
    c.advance(2.1); // five loops later
    expect(c.busy).toBe(true);
    c.advance(2.2);
    expect(val(c, 'glow', 'alpha') as number).toBeGreaterThan(0);
    c.fire('PulseStop', 2.2);
    c.advance(2.2);
    expect(c.busy).toBe(false);
    const stuck = val(c, 'glow', 'alpha');
    c.advance(10);
    expect(val(c, 'glow', 'alpha')).toBe(stuck); // stopped values stay where they were
  });

  it('SetVisible, StopAnimation and StopPanelAnimations', () => {
    const c = ctl(`
      event E { SetVisible Glow 0 0.1  Animate Glow Alpha "255" Linear 0 10  StopAnimation Glow Alpha 1.0 }
      event F { Animate Glow Alpha "10" Linear 0 10  Animate Glow XPos "50" Linear 0 10  StopPanelAnimations Glow 1.0 }
    `);
    c.fire('E', 0);
    c.advance(0.05);
    expect(val(c, 'glow', 'vis')).toBeUndefined();
    c.advance(0.2);
    expect(val(c, 'glow', 'vis')).toBe(false);
    c.advance(2);
    expect(c.busy).toBe(false);
    c.fire('F', 2);
    c.advance(3.5);
    expect(c.busy).toBe(false);
  });

  it('cannot be hung by an event that reruns itself with no delay', () => {
    const c = ctl('event Spin { RunEvent Spin 0.0 }');
    c.fire('Spin', 0);
    expect(() => c.advance(1)).not.toThrow();
  });

  it('ignores events and variables it does not know', () => {
    const c = ctl('event E { Animate Glow Blur "5" Linear 0 1 }');
    expect(c.fire('Nope')).toBe(false);
    c.fire('E', 0);
    c.advance(1);
    expect(c.values().size).toBe(0);
    expect(parseTarget('Position', '10 20', env)).toHaveLength(2);
    expect(parseTarget('FgColor', 'garbage', env)).toEqual([]);
  });

  it('reset forgets everything', () => {
    const c = ctl('event E { Animate Glow Alpha "9" Linear 0 0 }');
    c.fire('E', 0);
    c.advance(0);
    expect(c.values().size).toBe(1);
    c.reset();
    expect(c.values().size).toBe(0);
  });
});

describe('animation styling', () => {
  it('overrides the properties a panel is drawn from, and nothing else', () => {
    const c = ctl(`event E {
      Animate Bar Alpha "128" Linear 0 0
      Animate Bar FgColor "White" Linear 0 0
      Animate Bar Position "r12 3" Linear 0 0
      Animate Bar Size "40 f2" Linear 0 0
      SetVisible Bar 0 0
    }`);
    c.fire('E', 0);
    c.advance(0);
    const style = animStyle(snapshotOf(c))!;
    const base = propsFromMap({
      xpos: '10',
      ypos: '10',
      wide: '5',
      tall: '5',
      visible: '1',
      other: 'keep',
    });
    const out = style('f.res', 'Bar', base);
    expect(out.get('_rmh_alpha')).toBe('128');
    expect(out.get('fgcolor_override')).toBe('255 255 255 255');
    expect(out.get('xpos')).toBe('r12');
    expect(out.get('ypos')).toBe('3');
    expect(out.get('wide')).toBe('40');
    expect(out.get('tall')).toBe('f2');
    expect(out.get('visible')).toBe('0');
    expect(out.get('other')).toBe('keep');
    expect(style('f.res', 'Other', base)).toBe(base);
    expect(animStyle(new Map())).toBeUndefined();
  });

  it('composes styles in order', () => {
    const a = (_f: string, _n: string, p: ReturnType<typeof propsFromMap>) =>
      propsFromMap({ x: `${p.get('x') ?? ''}a` });
    const b = (_f: string, _n: string, p: ReturnType<typeof propsFromMap>) =>
      propsFromMap({ x: `${p.get('x') ?? ''}b` });
    expect(composeStyles(a, undefined, b)!('f', 'n', propsFromMap({ x: '' })).get('x')).toBe('ab');
    expect(composeStyles(undefined, undefined)).toBeUndefined();
  });
});
