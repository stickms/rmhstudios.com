import { describe, expect, it } from 'vitest';
import { RUN_SPEED, WALK_SPEED, locomotionBlend } from '../../avatar/controller';
import {
  CYCLES_PER_SPEED,
  CharacterAnimator,
  approach,
  locomotionRate,
  newDrive,
  pushTrigger,
  strideCadence,
  type FigureDrive,
} from '../animator';
import type { ClipSlot } from '../model-manifest';
import { FIXTURE_CLIPS, MINIMAL_CLIPS, buildFixture } from './fixture-model';

const DT = 1 / 60;

function make(entry: { clips: Partial<Record<ClipSlot, string>> } = FIXTURE_CLIPS, seed = 0.3) {
  const f = buildFixture();
  const clips = new Map(f.animations.map((c) => [c.name, c]));
  const anim = new CharacterAnimator(f.scene, clips, entry, { seed });
  return { anim, scene: f.scene, drive: newDrive() };
}

function run(anim: CharacterAnimator, drive: FigureDrive, seconds: number, each?: () => void) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    anim.update(DT, drive);
    each?.();
  }
}

const total = (anim: CharacterAnimator) => [...anim.applied.values()].reduce((a, b) => a + b, 0);

describe('stride cadence and playback rate', () => {
  it('is zero when standing and grows linearly with ground speed', () => {
    expect(strideCadence(0)).toBe(0);
    expect(strideCadence(-3)).toBe(0);
    expect(strideCadence(NaN)).toBe(0);
    expect(strideCadence(2)).toBeCloseTo(2 * CYCLES_PER_SPEED, 10);
    expect(strideCadence(RUN_SPEED)).toBeGreaterThan(strideCadence(WALK_SPEED));
  });

  it('plays a longer clip at a higher rate, so every clip covers the same ground per cycle', () => {
    expect(locomotionRate(2, WALK_SPEED)).toBeCloseTo(2 * locomotionRate(1, WALK_SPEED), 10);
    // Feet matched to ground: distance per cycle = speed / cadence is constant whatever the speed.
    const stride = (v: number) => v / strideCadence(v);
    expect(stride(WALK_SPEED)).toBeCloseTo(stride(RUN_SPEED), 10);
  });

  it('approach is monotone and never overshoots, at any frame rate', () => {
    for (const dt of [0.001, 1 / 144, 1 / 60, 0.1, 5]) {
      const v = approach(0, 1, dt, 12);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // Two half-steps land where one whole step does (frame-rate independence).
    expect(approach(approach(0, 1, 0.05, 9), 1, 0.05, 9)).toBeCloseTo(approach(0, 1, 0.1, 9), 10);
  });
});

describe('locomotion blend', () => {
  it('plays idle standing, walk at walking speed, run at running speed, with weights that sum to 1', () => {
    const { anim, drive } = make();
    drive.speed = 0;
    run(anim, drive, 1);
    expect(anim.weightOf('Idle')).toBeCloseTo(1, 3);
    expect(total(anim)).toBeCloseTo(1, 3);

    drive.speed = WALK_SPEED;
    run(anim, drive, 1);
    expect(anim.weightOf('Walk')).toBeGreaterThan(0.97);
    expect(total(anim)).toBeCloseTo(1, 3);

    drive.speed = RUN_SPEED;
    run(anim, drive, 1);
    expect(anim.weightOf('Run')).toBeGreaterThan(0.97);
    expect(total(anim)).toBeCloseTo(1, 3);
  });

  it('matches the avatar controller’s blend at steady speed', () => {
    const { anim, drive } = make();
    drive.speed = 2.4;
    run(anim, drive, 1.5);
    const want = locomotionBlend(2.4);
    expect(anim.weightOf('Idle')).toBeCloseTo(want.idle, 2);
    expect(anim.weightOf('Walk')).toBeCloseTo(want.walk, 2);
    expect(anim.weightOf('Run')).toBeCloseTo(want.run, 2);
  });

  it('never pops: weights move by a small step per frame even when the speed jumps', () => {
    const { anim, drive } = make();
    run(anim, drive, 0.5);
    let prev = new Map(anim.applied);
    let maxStep = 0;
    drive.speed = RUN_SPEED; // an instant change of input
    run(anim, drive, 1, () => {
      for (const [k, v] of anim.applied) maxStep = Math.max(maxStep, Math.abs(v - (prev.get(k) ?? 0)));
      prev = new Map(anim.applied);
    });
    expect(maxStep).toBeLessThan(0.3);
  });

  it('turns around mid-blend without overshooting 0..1', () => {
    const { anim, drive } = make();
    run(anim, drive, 0.3);
    drive.speed = RUN_SPEED;
    run(anim, drive, 0.2);
    drive.speed = 0;
    run(anim, drive, 0.2, () => {
      for (const v of anim.applied.values()) {
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
      expect(total(anim)).toBeCloseTo(1, 3);
    });
  });

  it('locks walk and run to one stride phase so their feet land together while blending', () => {
    const { anim, drive } = make();
    drive.speed = (WALK_SPEED + RUN_SPEED) / 2;
    run(anim, drive, 1.3);
    const actions = anim['actions'] as Map<string, { time: number; getClip(): { duration: number } }>;
    const pw = actions.get('Walk')!.time / actions.get('Walk')!.getClip().duration;
    const pr = actions.get('Run')!.time / actions.get('Run')!.getClip().duration;
    expect(pw).toBeCloseTo(pr, 6);
  });

  it('advances the stride only as fast as the ground speed says (no skating)', () => {
    const { anim, drive } = make(FIXTURE_CLIPS, 0);
    const actions = anim['actions'] as Map<string, { time: number; getClip(): { duration: number } }>;
    drive.speed = WALK_SPEED;
    anim.update(0, drive);
    const before = actions.get('Walk')!.time / 1;
    run(anim, drive, 1);
    const cycles = (actions.get('Walk')!.time / 1 - before + 1) % 1;
    expect(cycles).toBeCloseTo((strideCadence(WALK_SPEED) * 1) % 1, 1);
  });

  it('uses walk for run when the model has no run clip', () => {
    const { anim, drive } = make(MINIMAL_CLIPS);
    drive.speed = RUN_SPEED;
    run(anim, drive, 1);
    expect(anim.weightOf('Walk')).toBeGreaterThan(0.97);
    expect(anim.weightOf('Run')).toBe(0);
    expect(total(anim)).toBeCloseTo(1, 3);
  });
});

describe('air', () => {
  it('blends to jump and to fall, and back, with weights summing to 1', () => {
    const { anim, drive } = make();
    drive.speed = WALK_SPEED;
    run(anim, drive, 0.5);
    drive.air = 'jump';
    run(anim, drive, 0.6);
    expect(anim.weightOf('Jump')).toBeGreaterThan(0.95);
    expect(anim.weightOf('Walk')).toBeLessThan(0.05);
    drive.air = 'fall';
    run(anim, drive, 0.8);
    expect(anim.weightOf('Fall')).toBeGreaterThan(0.95);
    expect(anim.weightOf('Jump')).toBeLessThan(0.05);
    drive.air = 'ground';
    run(anim, drive, 0.8, () => expect(total(anim)).toBeCloseTo(1, 3));
    expect(anim.weightOf('Walk')).toBeGreaterThan(0.95);
  });

  it('restarts the jump from its first frame each time the avatar leaves the ground', () => {
    const { anim, drive } = make();
    const actions = anim['actions'] as Map<string, { time: number }>;
    drive.air = 'jump';
    run(anim, drive, 0.5);
    expect(actions.get('Jump')!.time).toBeGreaterThan(0.3);
    drive.air = 'ground';
    run(anim, drive, 0.5);
    drive.air = 'jump';
    anim.update(DT, drive);
    expect(actions.get('Jump')!.time).toBeLessThan(0.05);
  });

  it('stays idle when the model has no jump or fall clip', () => {
    const { anim, drive } = make(MINIMAL_CLIPS);
    drive.air = 'jump';
    run(anim, drive, 0.6);
    expect(anim.weightOf('Idle')).toBeGreaterThan(0.99);
  });
});

describe('one-shots', () => {
  it('shoot takes over, then hands the body back to locomotion', () => {
    const { anim, drive } = make();
    drive.speed = 0;
    run(anim, drive, 0.3);
    pushTrigger(drive, 'shoot');
    run(anim, drive, 0.2);
    expect(anim.weightOf('Shoot')).toBeGreaterThan(0.8);
    expect(drive.triggers).toHaveLength(0);
    run(anim, drive, 1.2);
    expect(anim.weightOf('Shoot')).toBe(0);
    expect(anim.weightOf('Idle')).toBeGreaterThan(0.99);
  });

  it('keeps some gait under a shot while running', () => {
    const { anim, drive } = make();
    drive.speed = RUN_SPEED;
    run(anim, drive, 1);
    pushTrigger(drive, 'shoot');
    run(anim, drive, 0.2);
    expect(anim.weightOf('Shoot')).toBeLessThanOrEqual(0.71);
    expect(anim.weightOf('Run')).toBeGreaterThan(0.2);
  });

  it('a newer one-shot interrupts the older, with weights always summing to 1', () => {
    const { anim, drive } = make();
    pushTrigger(drive, 'reload');
    run(anim, drive, 0.3);
    expect(anim.weightOf('Reload')).toBeGreaterThan(0.7);
    pushTrigger(drive, 'hurt');
    run(anim, drive, 0.2, () => expect(total(anim)).toBeCloseTo(1, 2));
    expect(anim.weightOf('Hurt')).toBeGreaterThan(0.6);
    expect(anim.weightOf('Reload')).toBeLessThan(0.15);
  });

  it('does nothing for a clip the model lacks (shoot falls back to idle, which is already playing)', () => {
    const { anim, drive } = make(MINIMAL_CLIPS);
    expect(anim.trigger('shoot')).toBe(false);
    pushTrigger(drive, 'hurt');
    run(anim, drive, 0.3);
    expect(anim.weightOf('Idle')).toBeCloseTo(1, 3);
  });

  it('keeps repeating interact while busy and stops when not', () => {
    const { anim, drive } = make();
    drive.busy = true;
    let seen = 0;
    run(anim, drive, 3.5, () => {
      if (anim.weightOf('Interact') > 0.5) seen++;
    });
    expect(seen).toBeGreaterThan(60);
    drive.busy = false;
    run(anim, drive, 2);
    expect(anim.weightOf('Interact')).toBe(0);
  });

  it('a queue nobody drains cannot grow without bound', () => {
    const d = newDrive();
    for (let i = 0; i < 100; i++) pushTrigger(d, 'shoot');
    expect(d.triggers.length).toBeLessThanOrEqual(4);
  });
});

describe('death', () => {
  it('plays once and holds the last frame', () => {
    const { anim, drive } = make();
    drive.speed = WALK_SPEED;
    run(anim, drive, 0.5);
    drive.dead = true;
    run(anim, drive, 0.8, () => expect(total(anim)).toBeCloseTo(1, 3));
    expect(anim.weightOf('Death')).toBeGreaterThan(0.95);
    run(anim, drive, 4);
    expect(anim.weightOf('Death')).toBe(1);
    const actions = anim['actions'] as Map<string, { time: number; getClip(): { duration: number } }>;
    expect(actions.get('Death')!.time).toBeCloseTo(actions.get('Death')!.getClip().duration, 3);
    // still dead after the clip ended: pose does not change
    const hips = anim['root'].getObjectByName('Hips')!;
    const y = hips.position.y;
    run(anim, drive, 1);
    expect(hips.position.y).toBe(y);
  });

  it('falls back to hurt, then to nothing at all', () => {
    const hurtOnly = { ...MINIMAL_CLIPS, clips: { ...MINIMAL_CLIPS.clips, hurt: 'Hurt' } };
    const a = make(hurtOnly);
    a.drive.dead = true;
    run(a.anim, a.drive, 1);
    expect(a.anim.weightOf('Hurt')).toBeGreaterThan(0.95);
    // played by the flinch, but it is not a death of its own: the figure topples as well (ModelFigure)
    expect(a.anim.hasOwnClip('death')).toBe(false);
    expect(a.anim.hasOwnClip('hurt')).toBe(true);

    const b = make(MINIMAL_CLIPS);
    expect(b.anim.hasOwnClip('death')).toBe(false);
  });

  it('can be revived', () => {
    const { anim, drive } = make();
    drive.dead = true;
    run(anim, drive, 1.5);
    drive.dead = false;
    run(anim, drive, 1.2);
    expect(anim.weightOf('Death')).toBe(0);
    expect(anim.weightOf('Idle')).toBeGreaterThan(0.99);
  });
});

describe('robustness and disposal', () => {
  it('ignores NaN, negative and enormous input', () => {
    const { anim, drive } = make();
    drive.speed = NaN;
    anim.update(NaN, drive);
    drive.speed = -5;
    anim.update(-1, drive);
    drive.speed = 1e9;
    anim.update(1e9, drive);
    for (const v of anim.applied.values()) expect(Number.isFinite(v)).toBe(true);
    expect(total(anim)).toBeCloseTo(1, 3);
  });

  it('survives rare updates (a slow-tier or background-tab step)', () => {
    const { anim, drive } = make();
    drive.speed = WALK_SPEED;
    for (let i = 0; i < 5; i++) anim.update(0.1, drive);
    expect(total(anim)).toBeCloseTo(1, 3);
  });

  it('deforms the skeleton: bones actually move when walking', () => {
    const { anim, drive, scene } = make();
    const leg = scene.getObjectByName('LegL')!;
    drive.speed = WALK_SPEED;
    const seen = new Set<number>();
    run(anim, drive, 1.2, () => seen.add(Math.round(leg.quaternion.x * 100)));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('dispose releases the mixer’s actions and bindings, and further updates are no-ops', () => {
    const { anim, drive, scene } = make();
    pushTrigger(drive, 'shoot');
    run(anim, drive, 0.2);
    const mixer = anim.mixer as unknown as { _actions: unknown[]; _bindings: unknown[]; _nActiveActions: number };
    expect(mixer._actions.length).toBeGreaterThan(0);
    anim.dispose();
    expect(anim.disposed).toBe(true);
    expect(mixer._actions).toHaveLength(0);
    expect(mixer._bindings).toHaveLength(0);
    expect(mixer._nActiveActions).toBe(0);
    const pose = scene.getObjectByName('LegL')!.quaternion.toArray();
    drive.speed = RUN_SPEED;
    anim.update(1, drive);
    expect(anim.trigger('shoot')).toBe(false);
    expect(scene.getObjectByName('LegL')!.quaternion.toArray()).toEqual(pose);
    expect(() => anim.dispose()).not.toThrow();
  });

  it('gives each person its own idle phase so a crowd does not move in lockstep', () => {
    const a = make(FIXTURE_CLIPS, 0.11);
    const b = make(FIXTURE_CLIPS, 0.77);
    a.anim.update(0, a.drive);
    b.anim.update(0, b.drive);
    expect(a.scene.getObjectByName('Spine')!.quaternion.x).not.toBeCloseTo(b.scene.getObjectByName('Spine')!.quaternion.x, 4);
  });
});
