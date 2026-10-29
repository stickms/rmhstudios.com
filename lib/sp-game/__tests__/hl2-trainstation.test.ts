/**
 * Half-Life 2 train station: the arrival plays out through the map's own I/O
 * (intro, train ride on func_tracktrain / path_track, scenes, doors) and the
 * player walks the main path on waypoints derived from the map (a grid search
 * over the player's hull); segments a scripted gate holds shut are bridged
 * by teleport, with the door / scene I/O exercised there. The "pick up that
 * can" props: the can lifts, throws, and drops into the bin trigger.
 * HL2_ROOT; skipped without it.
 */
import { describe, expect, it } from 'vitest';
import { vec3 } from '../../tf2-game/core/vec';
import { hl2Root } from '../sp-root.test-support';
import { Driver, loadWorld } from '../sp-driver.test-support';
import { PropDoorRotating } from '../entities/props';
import { FuncTrackTrain } from '../entities/brush';

describe.skipIf(!hl2Root())('d1_trainstation_01 main path', () => {
  it('rides the train in, walks off along the platform, pushes the turnstile, and changes level at the end', async () => {
    const d = new Driver(await loadWorld('hl2', 'd1_trainstation_01'));
    const w = d.w;

    // The intro hands over to the train (point_teleport), which rides to the station.
    expect(d.idle(130, () => d.fired('relay_train_reached_station.trigger'))).toBe(true);
    const train = w.findByName('intro_train_2') as FuncTrackTrain;
    expect(train.moving).toBe(false);
    expect(Math.abs(train.origin.x - -4680)).toBeLessThan(800);
    // Scenes started on arrival; the doors open through train_door_1 → OnFullyOpen → train_door_2.
    expect(d.idle(5, () => d.fired('train_door_2.open'))).toBe(true);
    expect(d.fired('lcs_trainride_stand_endline.start')).toBe(true);
    d.idle(1);

    // Off the train and along the platform (several trigger_once on the way).
    expect(d.goTo(vec3(-5360, -2048, -31)).ok).toBe(true);
    expect(d.goTo(vec3(-4560, -2048, -31)).ok).toBe(true);
    expect(d.fired('luggage_script_condition.enable')).toBe(true);

    // The turnstile is a func_physbox on a phys_hinge: the player pushes through it.
    expect(d.goTo(vec3(-4100, -1520, -31)).ok).toBe(true);
    const turnstile = w.findByName('turnstyle_1')!;
    const yaw0 = turnstile.angles.y;
    const pushed = d.walkTo(vec3(-4100, -1380, -31), { radius: 16, timeout: 8 });
    expect(pushed.reached).toBe(true);
    expect(Math.abs(turnstile.angles.y - yaw0)).toBeGreaterThan(10);

    // Through the customs hall toward the police gate (the queue moves up as the player passes).
    expect(d.goTo(vec3(-4330, -700, -31), { near: 250 }).ok).toBe(true);
    expect(Math.hypot(w.player.origin.x - -4330, w.player.origin.y - -700)).toBeLessThan(260);
    expect(d.fired('actbusy_customs_queue.movequeueup')).toBe(true);

    // The interrogation rooms are held shut by the cops' scripts; exercise their doors' I/O.
    const door = w.findByName('barney_door_2') as PropDoorRotating;
    expect(door.locked).toBe(true);
    w.fireInput('barney_door_2', 'Unlock');
    w.fireInput('barney_door_2', 'Open', '', 0.1);
    expect(d.idle(5, () => d.fired('barney_door_2.open') && Math.abs(door.angles.y - door.closedYaw) >= door.distance - 0.5)).toBe(true);

    // Out of the storage room window (the crate stack is skipped) to the exit.
    w.teleportEntity(w.player, vec3(-3150, 95, -60), null, vec3());
    d.idle(0.5);
    expect(d.goTo(vec3(-3104, -110, -64)).ok).toBe(true);
    // The ajar door on the way out: +use swings it open.
    const exitDoor = w.findAllByClassname('prop_door_rotating').find((e) => Math.hypot(e.origin.x - -3127, e.origin.y - -136) < 2) as PropDoorRotating;
    d.look(exitDoor.worldSpaceCenter(vec3()));
    d.idle(0.1);
    d.use();
    expect(d.idle(3, () => exitDoor.doorState === 2)).toBe(true);
    // Into the trigger_changelevel (a 16-unit slab across the way out).
    d.cmd.viewAngles.y = -90;
    d.cmd.forwardMove = 450;
    expect(d.run(3, () => w.pendingChangeLevel !== null)).toBe(true);
    const cl = d.events.find((e) => e.type === 'changelevel');
    expect(cl && cl.type === 'changelevel' && cl.map).toBe('d1_trainstation_02');
    expect(cl && cl.type === 'changelevel' && cl.landmark).toBe('trainstation_01_to_02');
  }, 300_000);
});

describe.skipIf(!hl2Root())('d1_trainstation_02 the can', () => {
  it('picks up the can, throws it, and drops it in the bin (trashcan_trigger)', async () => {
    const d = new Driver(await loadWorld('hl2', 'd1_trainstation_02'));
    const w = d.w;
    d.idle(1);
    const can = w.findByName('cupcop_can')!;
    expect(can).not.toBeNull();
    const at = (e: { origin: { x: number; y: number; z: number } }) => ({ ...e.origin });

    // Stand next to the can, look at it, +use.
    const c0 = at(can);
    w.teleportEntity(w.player, vec3(c0.x + 40, c0.y, c0.z - 40), null, vec3());
    d.idle(1);
    d.look(can.origin);
    d.idle(0.1);
    d.use();
    expect(w.player.held?.id).toBe(can.id);
    expect(d.fired('cupcop_can_pickup.trigger')).toBe(true);

    // +attack throws it (CPlayerPickupController: player_throwforce × mass factor).
    d.idle(0.5);
    const before = at(can);
    d.press(1 /* IN_ATTACK */);
    expect(w.player.held).toBeNull();
    const b = w.bodiesByEntity.get(can.id)!;
    expect(Math.hypot(...Object.values(b.getVelocity(vec3())))).toBeGreaterThan(300);
    d.idle(2);
    expect(Math.hypot(can.origin.x - before.x, can.origin.y - before.y)).toBeGreaterThan(40);

    // Pick it up again and drop it into the bin.
    w.teleportEntity(w.player, vec3(can.origin.x + 40, can.origin.y, can.origin.z + 4), null, vec3());
    d.idle(1);
    d.look(can.origin);
    d.idle(0.1);
    d.use();
    expect(w.player.held?.id).toBe(can.id);
    // The bin's trigger sits at its origin (its brush bounds run along the counter).
    const bin = w.findByName('trashcan_trigger')!;
    const bc = vec3(bin.origin.x, bin.origin.y, bin.origin.z);
    expect(w.pointInBrushEntity(bin, bc)).toBe(true);
    w.teleportEntity(w.player, vec3(bc.x + 40, bc.y, bc.z - 30), null, vec3());
    const hd = w.player.holdDistance;
    d.cmd.viewAngles.y = 180;
    const dz = w.player.origin.z + 64 - (bc.z + 10);
    const h = Math.sqrt(Math.max(1, hd * hd - dz * dz));
    w.teleportEntity(w.player, vec3(bc.x + h, bc.y, w.player.origin.z), null, vec3());
    d.look(vec3(bc.x, bc.y, bc.z + 10));
    d.idle(1);
    d.use();
    expect(d.idle(4, () => d.fired('lcs_cupcop_pass.start'))).toBe(true);
  }, 300_000);
});
