import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { weight } from '../anim/interp';
import { manifestFiles, mergeScripts, parseAnimScript } from '../anim/parse';

const BASE = path.resolve(__dirname, '../../../public/tf2-hud/base');
const read = (p: string) => readFileSync(path.join(BASE, p), 'utf8');

describe('animation script parser', () => {
  it('reads events and every command kind', () => {
    const s = parseAnimScript(`
      // a comment
      event One
      {
        Animate  Panel Alpha "255" Linear 0.0 0.2   // trailing comment
        Animate  Panel FgColor "TanLight" Deaccel 0.1 0.5
        Animate  Panel Position "r10 20" Pulse 3 0 1
        Animate  Dimmer wide 285 Bias 0.1  0.0 0.4
        RunEvent Two 0.4
        RunEventChild Child Three 0.5
        StopEvent Two 0.0
        StopAnimation Panel Alpha 0.1
        StopPanelAnimations Panel 0.2
        SetVisible Panel 0 0.3
        FireCommand 0.0 "echo hi"
      }
      event Two { }
    `);
    const one = s.events.get('one')!;
    expect(one.commands).toEqual([
      {
        t: 'animate',
        panel: 'Panel',
        variable: 'Alpha',
        target: '255',
        interp: { kind: 'linear' },
        start: 0,
        duration: 0.2,
      },
      {
        t: 'animate',
        panel: 'Panel',
        variable: 'FgColor',
        target: 'TanLight',
        interp: { kind: 'deaccel' },
        start: 0.1,
        duration: 0.5,
      },
      {
        t: 'animate',
        panel: 'Panel',
        variable: 'Position',
        target: 'r10 20',
        interp: { kind: 'pulse', param: 3 },
        start: 0,
        duration: 1,
      },
      {
        t: 'animate',
        panel: 'Dimmer',
        variable: 'wide',
        target: '285',
        interp: { kind: 'bias', param: 0.1 },
        start: 0,
        duration: 0.4,
      },
      { t: 'run', event: 'Two', start: 0.4 },
      { t: 'run', event: 'Three', start: 0.5 },
      { t: 'stop', event: 'Two', start: 0 },
      { t: 'stopAnimation', panel: 'Panel', variable: 'Alpha', start: 0.1 },
      { t: 'stopPanel', panel: 'Panel', start: 0.2 },
      { t: 'visible', panel: 'Panel', value: false, start: 0.3 },
    ]);
    // FireCommand is understood but not simulated, and says so.
    expect(s.notes.some((n) => n.includes('firecommand is not simulated'))).toBe(true);
    expect(s.events.get('two')!.commands).toEqual([]);
  });

  it('survives garbage and unknown commands', () => {
    const s = parseAnimScript('event A { Wibble 1 2 3 Animate X Alpha "1" Linear 0 1 } event');
    expect(s.events.get('a')!.commands).toHaveLength(1);
    expect(parseAnimScript('').events.size).toBe(0);
  });

  it('parses the whole default HUD script', () => {
    const s = parseAnimScript(read('scripts/hudanimations_tf.txt'));
    expect(s.events.size).toBe(232);
    const bonus = s.events.get('hudhealthbonuspulse')!;
    expect(bonus.commands).toHaveLength(3);
    expect(bonus.commands[2]).toEqual({ t: 'run', event: 'HudHealthBonusPulseLoop', start: 0.4 });
    let animates = 0;
    for (const e of s.events.values())
      animates += e.commands.filter((c) => c.t === 'animate').length;
    expect(animates).toBe(654);
    // Nothing was misread: the only skips are commands the HUD uses that nothing here runs.
    expect(s.notes.filter((n) => n.includes('could not read'))).toEqual([]);
  });

  it('merges scripts, later events replacing earlier ones, and reads the manifest', () => {
    const a = parseAnimScript('event A { RunEvent B 0 }');
    const b = parseAnimScript('event A { }');
    expect(mergeScripts([a, b]).events.get('a')!.commands).toEqual([]);
    expect(manifestFiles(read('scripts/hudanimations_manifest.txt'))).toEqual([
      'scripts/hudanimations.txt',
      'scripts/hudanimations_tf.txt',
    ]);
    expect(manifestFiles(undefined)).toEqual([]);
  });
});

describe('interpolators', () => {
  it('start at 0 and land on 1', () => {
    for (const kind of [
      'linear',
      'accel',
      'deaccel',
      'spline',
      'gain',
      'bias',
      'bounce',
    ] as const) {
      expect(weight({ kind, param: 0.3 }, 0)).toBeCloseTo(0);
      expect(weight({ kind, param: 0.3 }, 1)).toBeCloseTo(1);
    }
    expect(weight({ kind: 'pulse', param: 3 }, 0)).toBeCloseTo(0);
    expect(weight({ kind: 'pulse', param: 3 }, 1)).toBeCloseTo(1);
    expect(weight({ kind: 'flicker', param: 0.5 }, 1)).toBe(1);
  });

  it('have the shapes the game documents', () => {
    expect(weight({ kind: 'linear' }, 0.5)).toBe(0.5);
    expect(weight({ kind: 'accel' }, 0.5)).toBeLessThan(0.5);
    expect(weight({ kind: 'deaccel' }, 0.5)).toBeGreaterThan(0.5);
    expect(weight({ kind: 'spline' }, 0.5)).toBe(0.5);
    expect(weight({ kind: 'bias', param: 0.9 }, 0.5)).toBeGreaterThan(0.5);
    expect(weight({ kind: 'bias', param: 0.1 }, 0.5)).toBeLessThan(0.5);
    expect(weight({ kind: 'linear' }, 5)).toBe(1);
    expect(weight({ kind: 'linear' }, -1)).toBe(0);
  });

  it('pulses the number of times it is told to', () => {
    const peaks = [...Array(1001)]
      .map((_, i) => weight({ kind: 'pulse', param: 3 }, i / 1000))
      .filter((w, i, a) => i > 0 && i < 1000 && w > a[i - 1] && w >= a[i + 1]).length;
    expect(peaks).toBe(3);
  });

  it('flicker is repeatable', () => {
    const run = () =>
      [...Array(20)].map((_, f) => weight({ kind: 'flicker', param: 0.5 }, 0.5, f, 7));
    expect(run()).toEqual(run());
    expect(new Set(run()).size).toBe(2);
  });
});
