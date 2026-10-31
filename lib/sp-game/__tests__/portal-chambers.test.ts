/**
 * Portal: First Slice, testchmb_a_00. The map's scripted portals open, the
 * player walks through them, picks up the cube the dropper releases, puts it
 * on the floor button (the exit doors open), rides the elevator and reaches
 * the changelevel. Then the portal mechanics on the same map: a fall into a
 * floor portal comes out of a wall portal at the same speed, a fizzler closes
 * the gun's portals, and a dropped cube settles. PORTAL_ROOT; skipped without it.
 */
import { describe, expect, it } from 'vitest';
import { BspEntity } from '../../tf2-game/formats/keyvalues';
import { vec3 } from '../../tf2-game/core/vec';
import { portalRoot } from '../sp-root.test-support';
import { Driver, loadWorld } from '../sp-driver.test-support';
import { frameForward } from '../portal/portal-math';
import { emptyTrace } from '../../tf2-game/core/types';
import { MASK_PLAYERSOLID } from '../../tf2-game/core/constants';

describe.skipIf(!portalRoot())('testchmb_a_00 puzzle', () => {
  it('walks through the scripted portals, solves the cube/button puzzle and reaches the elevator changelevel', async () => {
    const d = new Driver(await loadWorld('portal', 'testchmb_a_00'));
    const w = d.w;

    // The intro (GLaDOS scene) ends by activating the vault's portal pair.
    expect(d.idle(80, () => d.fired('portal_red_0.setactivatedstate'))).toBe(true);
    d.idle(0.5);
    const red = d.entity('portal_red_0')!;
    d.walkTo(vec3(red.origin.x, red.origin.y + 40, 0), { radius: 6 });
    d.walkTo(vec3(red.origin.x, red.origin.y - 100, 0), { radius: 8, timeout: 2 });
    const tp = w.portals.lastTeleport;
    expect(tp && tp.entity === w.player.id).toBe(true);
    expect(Math.abs(tp!.speedOut - tp!.speedIn)).toBeLessThan(1e-9 * Math.max(1, tp!.speedIn));
    d.walkTo(vec3(-760, -330, 0), { radius: 8, timeout: 3 });

    // Into the box room: the dropper releases the cube.
    expect(d.goTo(vec3(-544, -788, 128)).ok).toBe(true);
    d.idle(7);
    const box = w.findAllByName('box').find((b) => b.origin.z < 200);
    expect(box).toBeTruthy();
    expect(d.goTo(vec3(box!.origin.x + 60, box!.origin.y, 128)).ok).toBe(true);
    d.look(box!.worldSpaceCenter(vec3()));
    d.idle(0.2);
    d.use();
    expect(w.player.held?.id).toBe(box!.id);
    d.idle(0.5);

    // Carry it over the floor button and let go.
    const btn = d.entity('floor_button_trigger_box_a00')!;
    const bc = btn.worldSpaceCenter(vec3());
    const target = vec3(bc.x, bc.y, bc.z + 24);
    const hd = w.player.holdDistance;
    const dz = w.player.origin.z + 64 - target.z;
    const h = Math.sqrt(Math.max(1, hd * hd - dz * dz));
    const stand = vec3(target.x + h, target.y, 128);
    expect(d.goTo(stand).ok).toBe(true);
    d.walkTo(stand, { radius: 3, timeout: 3 });
    d.look(target);
    d.idle(1.5);
    expect(w.player.held?.id).toBe(box!.id);
    d.use();
    expect(w.player.held).toBeNull();
    expect(d.idle(3, () => d.fired('exit_door_left_a00.open'))).toBe(true);
    d.idle(2);
    // The doors stay open while the cube sits on the button.
    expect(d.fired('exit_door_left_a00.close')).toBe(false);

    // Through the exit to the elevator; its door opens and the lift rises.
    expect(d.goTo(vec3(-1340, -864, 128)).ok).toBe(true);
    d.idle(1.5);
    expect(d.goTo(vec3(-1472, -864, 140)).ok).toBe(true);
    d.idle(12);
    // The upper elevator shaft (the ride between the two halves) is bridged by teleport.
    const trig = d.entity('a00-a01_trigger_elevator_move')!;
    const tc = trig.worldSpaceCenter(vec3());
    w.teleportEntity(w.player, vec3(tc.x, tc.y, tc.z - 40), null, vec3());
    expect(d.idle(40, () => d.events.some((e) => e.type === 'changelevel'))).toBe(true);
    const cl = d.events.find((e) => e.type === 'changelevel');
    expect(cl && cl.type === 'changelevel' && cl.map).toBe('testchmb_a_01');
    expect(cl && cl.type === 'changelevel' && cl.landmark).toBe('a00-a01_landmark_elevator');
  }, 300_000);
});

describe.skipIf(!portalRoot())('the arrival elevator of testchmb_a_01', () => {
  it('rides in from testchmb_a_00, is never left inside the lift as it settles, and lets the player out', async () => {
    const d = new Driver(await loadWorld('portal', 'testchmb_a_00'));
    const w = d.w;
    d.idle(1);
    // Into the departing lift (standing on its floor) and up to the changelevel.
    const trig = d.entity('a00-a01_trigger_elevator_move')!;
    const tc = trig.worldSpaceCenter(vec3());
    const down = emptyTrace();
    w.collision.traceHull(vec3(tc.x, tc.y, tc.z + 20), vec3(tc.x, tc.y, tc.z - 300), w.player.mins, w.player.maxs, MASK_PLAYERSOLID, w.player.traceFilter, down);
    w.teleportEntity(w.player, vec3(down.endPos.x, down.endPos.y, down.endPos.z + 1), null, vec3());
    expect(d.idle(60, () => d.events.some((e) => e.type === 'changelevel'))).toBe(true);
    const cl = d.events.find((e) => e.type === 'changelevel');
    if (!cl || cl.type !== 'changelevel') throw new Error('no changelevel');
    w.dispose();

    // The new map places the lift on its path 0.1 s in; the player arriving inside it must not
    // stay embedded in its floor while it does (it used to, for most of a second).
    const d2 = new Driver(await loadWorld('portal', 'testchmb_a_01', { loadType: 'transition', transition: cl.transition }));
    const w2 = d2.w;
    const p = w2.player;
    const tr = emptyTrace();
    let stuck = 0;
    for (let i = 0; i < Math.round(4 / w2.tick); i++) {
      d2.tick();
      w2.collision.traceHull(p.origin, p.origin, p.mins, p.maxs, MASK_PLAYERSOLID, p.traceFilter, tr);
      if (tr.startSolid) stuck++;
    }
    expect(stuck).toBe(0);
    const body = d2.entity('a00-a01_elevator_body_model')!;
    expect(p.move.groundEntity).toBe(body.id);
    // The doors opened and stopped colliding; the lift's opening faces the chamber.
    const doors = d2.entity('a00-a01_elevator_door_model') as unknown as { anim: { sequence: string } | null; collisionOn: boolean };
    expect(doors.anim?.sequence).toBe('open');
    expect(doors.collisionOn).toBe(false);
    const start = vec3(p.origin.x, p.origin.y, p.origin.z);
    const out = d2.walkTo(vec3(start.x - 170, start.y - 10, start.z), { radius: 12, timeout: 5 });
    expect(out.reached).toBe(true);
  }, 300_000);
});

describe.skipIf(!portalRoot())('portal mechanics on testchmb_a_00', () => {
  it('conserves momentum: a 1000-unit fall into a floor portal comes out of a wall portal at the same speed', async () => {
    const d = new Driver(await loadWorld('portal', 'testchmb_a_00'));
    const w = d.w;
    d.idle(0.5);
    const p = w.player;
    w.teleportEntity(p, vec3(-1300, -400, 577), null, vec3());
    d.idle(0.5);
    p.portalgun = { canFire1: true, canFire2: true, nextFire: 0 };
    p.eyeAngles.x = 89;
    p.eyeAngles.y = 0;
    const floor = w.portals.firePortal(p, 0);
    expect(floor).toBeTruthy();
    expect(frameForward(floor!.frame).z).toBeCloseTo(1, 6);
    p.eyeAngles.x = 0;
    p.eyeAngles.y = 180;
    const wall = w.portals.firePortal(p, 1);
    expect(wall).toBeTruthy();
    const wallOut = frameForward(wall!.frame);
    expect(wallOut.x).toBeCloseTo(1, 6);
    expect(w.portals.isLinked(floor!)).toBe(true);

    // Arrive 40 units over the floor portal at the speed of a 1000-unit fall.
    const vFall = Math.sqrt(2 * 600 * 1000);
    const o = floor!.frame.origin;
    w.teleportEntity(p, vec3(o.x, o.y, o.z + 40), null, vec3(0, 0, -vFall));
    w.portals.lastTeleport = null;
    expect(d.idle(1, () => w.portals.lastTeleport !== null)).toBe(true);
    const t = w.portals.lastTeleport!;
    expect(t.from).toBe(floor!.id);
    expect(t.to).toBe(wall!.id);
    expect(t.speedIn).toBeGreaterThan(vFall);
    expect(t.speedIn).toBeLessThan(vFall + 600 * 0.1);
    // Speedy thing goes in, speedy thing comes out — exactly.
    expect(Math.abs(t.speedOut - t.speedIn)).toBeLessThan(1e-9 * t.speedIn);
    // Out of the wall portal along its normal (+x).
    const v = p.move.velocity;
    expect(v.x).toBeGreaterThan(0.95 * t.speedIn);
    expect(p.origin.x).toBeGreaterThan(wall!.frame.origin.x);

    // A cube dropped in comes out the same way.
    const cube = w.spawnEntity('prop_physics', undefined, new BspEntity([
      ['classname', 'prop_physics'],
      ['model', 'models/props/metal_box.mdl'],
      ['origin', `${o.x} ${o.y} ${o.z + 60}`],
    ]));
    const body = w.bodiesByEntity.get(cube.id)!;
    expect(body).toBeTruthy();
    w.teleportEntity(p, vec3(-1300, -560, 577), null, vec3());
    body.setVelocity(vec3(0, 0, -vFall));
    w.portals.lastTeleport = null;
    expect(d.idle(1, () => w.portals.lastTeleport?.entity === cube.id)).toBe(true);
    const tb = w.portals.lastTeleport!;
    expect(Math.abs(tb.speedOut - tb.speedIn)).toBeLessThan(1e-9 * tb.speedIn);
    expect(body.getVelocity(vec3()).x).toBeGreaterThan(0.9 * tb.speedIn);
  }, 120_000);

  it('a fizzler closes the gun portals', async () => {
    const d = new Driver(await loadWorld('portal', 'testchmb_a_00'));
    const w = d.w;
    d.idle(0.5);
    const p = w.player;
    w.teleportEntity(p, vec3(-1300, -400, 577), null, vec3());
    d.idle(0.5);
    p.portalgun = { canFire1: true, canFire2: true, nextFire: 0 };
    p.eyeAngles.x = 89;
    const a = w.portals.firePortal(p, 0)!;
    p.eyeAngles.x = 0;
    p.eyeAngles.y = 180;
    const b = w.portals.firePortal(p, 1)!;
    expect(a.activated && b.activated).toBe(true);

    const fryer = w.findByName('a00-a01_trigger_fryer_rm2')!;
    expect(fryer.classname).toBe('trigger_portal_cleanser');
    const fc = fryer.worldSpaceCenter(vec3());
    w.teleportEntity(p, vec3(fc.x, fc.y, fc.z - 36), null, vec3());
    d.idle(0.3);
    expect(a.activated).toBe(false);
    expect(b.activated).toBe(false);
    const fizzles = d.events.filter((e) => e.type === 'effect' && e.kind === 'portal_fizzle');
    expect(fizzles.length).toBe(2);
    // The map's own (scripted) portals are not the gun's: untouched.
    expect(w.portals.portals.filter((q) => !q.fromGun).every((q) => !q.removed)).toBe(true);
  }, 120_000);

  it('a dropped cube settles on the floor', async () => {
    const d = new Driver(await loadWorld('portal', 'testchmb_a_00'));
    const w = d.w;
    d.idle(0.5);
    const cube = w.spawnEntity('prop_physics', undefined, new BspEntity([
      ['classname', 'prop_physics'],
      ['model', 'models/props/metal_box.mdl'],
      ['origin', '-1300 -400 700'],
      ['angles', '20 30 10'],
    ]));
    const body = w.bodiesByEntity.get(cube.id)!;
    d.idle(6);
    const v = body.getVelocity(vec3());
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(1);
    // Resting on a face: its centre is half the cube's height over the floor at z = 576.
    const c = body.getCenter(vec3());
    expect(c.z).toBeGreaterThan(576 + 15);
    expect(c.z).toBeLessThan(576 + 26);
    expect(Math.hypot(c.x - -1300, c.y - -400)).toBeLessThan(64);
  }, 120_000);
});
