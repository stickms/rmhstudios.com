import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Driver } from '../../sp-game/sp-driver.test-support';
import { SpWorld } from '../../sp-game/world/sp-world';
import { HARMONIC_MATERIAL_LOOKUP, createHarmonicAssets } from '../assets';
import { compileLevel } from '../compiler';
import { harmonicSounds, type HarmonicSoundEvent } from '../audio/events';
import { applyNarrativeHud, defaultLineMs, DialogueRunner, getNarrative } from './index';
import type { DialogueEvent } from './index';
import { ALL_SCRIPTS, findScript } from './scripts';
import { say, radio } from './speakers';
import type { DialogueScript } from './types';
import { emptyHarmonicHud } from '../client/hud-state';
import { devDialogueSource } from '../levels/dev_dialogue';
import { HARMONIC_LEVELS } from '../levels';
import { LINE_GAP_S, LINE_MIN_MS } from './constants';
import '../sim';

const demo: DialogueScript = {
  id: 't.demo',
  lines: [
    say('ines', 't.demo.1', 'One.', 2000),
    radio('odile', 't.demo.2', 'Two.', 1000),
    say('ines', 't.demo.3', 'Three.', 1000),
  ],
  then: ['OnUser1'],
};

function rig() {
  let now = 0;
  const r = new DialogueRunner(() => now);
  const log: string[] = [];
  r.on((e: DialogueEvent) =>
    log.push(e.type === 'line' ? `line${e.index + 1}` : `${e.type}:${e.script.id}`),
  );
  return {
    r,
    log,
    advance(s: number) {
      now += s;
      r.tick();
    },
  };
}

describe('DialogueRunner', () => {
  it('plays lines in order for their durations, with a gap between', () => {
    const { r, log, advance } = rig();
    r.start(demo);
    expect(log).toEqual(['line1']);
    advance(1.9);
    expect(r.current()?.index).toBe(0);
    advance(0.2); // 2.1: line 1 over, in the gap
    expect(r.current()).toBeNull();
    advance(LINE_GAP_S);
    expect(log).toEqual(['line1', 'line2']);
    expect(r.current()?.line.channel).toBe('radio');
    advance(1 + LINE_GAP_S);
    expect(log).toEqual(['line1', 'line2', 'line3']);
    advance(1.01);
    expect(log.at(-1)).toBe('finished:t.demo');
    expect(r.busy).toBe(false);
  });

  it('catches up after a long frame without skipping events', () => {
    const { r, log, advance } = rig();
    r.start(demo);
    advance(60);
    expect(log).toEqual(['line1', 'line2', 'line3', 'finished:t.demo']);
  });

  it('queues a second script behind the first; interrupt replaces it', () => {
    const a = rig();
    const other: DialogueScript = { id: 't.other', lines: [say('ines', 't.o.1', 'Other.', 1000)] };
    a.r.start(demo);
    a.r.start(other);
    expect(a.r.playingId).toBe('t.demo');
    a.advance(60);
    a.advance(60);
    expect(a.log.filter((l) => l.startsWith('finished'))).toEqual([
      'finished:t.demo',
      'finished:t.other',
    ]);

    const b = rig();
    b.r.start(demo);
    b.r.start(other, { interrupt: true });
    expect(b.log).toEqual(['line1', 'cancelled:t.demo', 'line1']);
    expect(b.r.playingId).toBe('t.other');
  });

  it('cancel stops the script, drops queued ones, and fires no finish', () => {
    const { r, log, advance } = rig();
    const other: DialogueScript = { id: 't.other', lines: [say('ines', 't.o.1', 'Other.', 1000)] };
    r.start(demo);
    r.start(other);
    advance(0.5);
    expect(r.cancel()).toBe(2);
    expect(log).toEqual(['line1', 'cancelled:t.demo']);
    expect(r.busy).toBe(false);
    advance(10);
    expect(log).toHaveLength(2);
  });

  it('cancel by source only touches that source', () => {
    const { r, log } = rig();
    const a = {};
    const b = {};
    r.start(demo, { source: a });
    r.start({ ...demo, id: 't.b' }, { source: b });
    expect(r.cancel(b)).toBe(1);
    expect(r.playingId).toBe('t.demo');
    expect(log).not.toContain('cancelled:t.demo');
  });

  it('makes no progress while the clock is stopped (pause)', () => {
    const { r, advance } = rig();
    r.start(demo);
    advance(0.5);
    const at = r.current()!.endsAt;
    for (let i = 0; i < 100; i++) r.tick(); // the sim is paused: same clock
    expect(r.current()?.index).toBe(0);
    expect(r.current()?.endsAt).toBe(at);
  });

  it('skip ends the line on screen', () => {
    const { r, log, advance } = rig();
    r.start(demo);
    advance(0.5);
    expect(r.skip()).toBe(true);
    expect(r.current()).toBeNull();
    advance(LINE_GAP_S);
    expect(log).toEqual(['line1', 'line2']);
  });

  it('plays a once script a single time until reset', () => {
    const { r, log, advance } = rig();
    const once = { ...demo, id: 't.once', once: true };
    expect(r.start(once)).toBe(true);
    advance(60);
    expect(r.start(once)).toBe(false);
    expect(r.hasPlayed('t.once')).toBe(true);
    expect(log.filter((l) => l === 'line1')).toHaveLength(1);
    r.reset();
    expect(r.start(once)).toBe(true);
  });

  it('default duration scales with the text and has a floor', () => {
    expect(defaultLineMs('Hi.')).toBe(LINE_MIN_MS);
    expect(defaultLineMs('x'.repeat(80))).toBeGreaterThan(defaultLineMs('x'.repeat(40)));
  });
});

describe('script content', () => {
  const catalogue = JSON.parse(
    readFileSync(new URL('../../../locales/en/harmonic.json', import.meta.url), 'utf8'),
  ) as Record<string, string>;

  it('has unique ids and every key in locales/en/harmonic.json with an identical default', () => {
    const ids = new Set<string>();
    for (const s of ALL_SCRIPTS) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(findScript(s.id)).toBe(s);
      for (const l of s.lines) {
        expect(l.key.startsWith(s.id.startsWith('dev.') ? 'dev.' : 'ch')).toBe(true);
        expect(catalogue[l.key], l.key).toBe(l.defaultValue);
      }
    }
  });

  it('the dev level hint and its title are in the catalogue', () => {
    const hint = devDialogueSource().entities.find((e) => e.classname === 'harmonic_hint')!;
    expect(catalogue[hint.keys!.hintkey]).toBe(hint.keys!.hinttext);
    const lvl = HARMONIC_LEVELS.find((l) => l.id === 'dev_dialogue')!;
    expect(catalogue[lvl.titleKey]).toBe(lvl.titleDefault);
  });
});

async function load() {
  const level = compileLevel(devDialogueSource(), { materials: HARMONIC_MATERIAL_LOOKUP });
  const world = await SpWorld.create({
    game: 'hl2',
    mapName: 'dev_dialogue',
    bsp: level.bsp,
    assets: createHarmonicAssets(),
  });
  return { world, d: new Driver(world) };
}

describe('harmonic_dialogue / harmonic_hint in a world', () => {
  it('Start plays the script in order on the sim clock; outputs and radio audio fire', async () => {
    const { world, d } = await load();
    const sounds: string[] = [];
    const off = harmonicSounds.on((e: HarmonicSoundEvent) => {
      if (e.type === 'sfx') sounds.push(e.sound);
    });
    d.idle(0.2);
    const n = getNarrative(world)!;
    const script = findScript('dev.radio_check')!;
    world.fireInput('dev_radio_check', 'Start');
    d.idle(0.1);
    expect(n.runner.current()?.line.key).toBe('dev.radio_check.1');
    expect(sounds).toContain('radio.click');
    expect(sounds).toContain('radio.static');
    expect(d.fired('dev_line1.trigger')).toBe(true);
    expect(d.fired('dev_finished.trigger')).toBe(false);

    // Subtitle `until` is on the HUD clock and carries the remaining sim time.
    const hud = applyNarrativeHud(emptyHarmonicHud(), world, 100);
    expect(hud.subtitles).toHaveLength(1);
    expect(hud.subtitles[0]).toMatchObject({ speakerId: 'odile', channel: 'radio' });
    expect(hud.subtitles[0].until).toBeGreaterThan(100);

    const seen: string[] = [];
    let last = '';
    const total = script.lines.reduce(
      (a, l) => a + (l.durationMs ?? defaultLineMs(l.defaultValue)) / 1000 + LINE_GAP_S,
      0,
    );
    d.run(total + 1, () => {
      const k = n.runner.current()?.line.key ?? last;
      if (k !== last) seen.push(k);
      last = k;
      return d.fired('dev_finished.trigger');
    });
    expect(seen).toEqual(script.lines.map((l) => l.key));
    expect(d.fired('dev_finished.trigger')).toBe(true);
    expect(d.fired('dev_then.trigger')).toBe(true);
    expect(sounds.filter((s) => s === 'radio.click').length).toBeGreaterThanOrEqual(4);
    off();
  });

  it('Cancel stops the script and fires OnCancelled, not OnFinished', async () => {
    const { world, d } = await load();
    d.idle(0.2);
    world.fireInput('dev_radio_check', 'Start');
    d.idle(0.3);
    world.fireInput('dev_radio_check', 'Cancel');
    d.idle(0.3);
    expect(getNarrative(world)!.runner.current()).toBeNull();
    expect(d.fired('dev_cancelled.trigger')).toBe(true);
    d.idle(20);
    expect(d.fired('dev_finished.trigger')).toBe(false);
  });

  it('the once-only script plays the first time only; a hint shows and hides', async () => {
    const { world, d } = await load();
    d.idle(0.2);
    const n = getNarrative(world)!;
    world.fireInput('dev_field_note', 'Start');
    d.idle(0.1);
    expect(n.runner.playingId).toBe('dev.field_note');
    d.idle(30);
    expect(n.runner.busy).toBe(false);
    world.fireInput('dev_field_note', 'Start');
    d.idle(0.1);
    expect(n.runner.busy).toBe(false);

    world.fireInput('dev_hint', 'ShowHint');
    d.idle(0.1);
    expect(applyNarrativeHud(emptyHarmonicHud(), world, 0).hint).toEqual({
      key: 'dev.hint.1',
      defaultValue: 'Use doors and buttons with the use key.',
    });
    world.fireInput('dev_hint', 'HideHint');
    d.idle(0.1);
    expect(applyNarrativeHud(emptyHarmonicHud(), world, 0).hint).toBeNull();
  });

  it('walking into the first volume starts the radio check', async () => {
    const { world, d } = await load();
    d.idle(0.3);
    d.walkTo({ x: 120, y: 192, z: 0 });
    d.idle(0.3);
    expect(getNarrative(world)!.runner.playingId).toBe('dev.radio_check');
  });

  it('stands still while the sim is not stepped (pause)', async () => {
    const { world, d } = await load();
    d.idle(0.2);
    const n = getNarrative(world)!;
    world.fireInput('dev_radio_check', 'Start');
    d.idle(0.2);
    const a = applyNarrativeHud(emptyHarmonicHud(), world, 10).subtitles[0].until;
    const b = applyNarrativeHud(emptyHarmonicHud(), world, 20).subtitles[0].until;
    expect(b - a).toBeCloseTo(10, 6); // HUD clock runs, remaining sim time is unchanged
    expect(n.runner.current()).not.toBeNull();
  });
});

describe('hud slice', () => {
  it('is empty without a narrative service', () => {
    const hud = emptyHarmonicHud();
    expect(applyNarrativeHud(hud, null, 5)).toBe(hud);
    expect(hud.subtitles).toEqual([]);
  });
});
