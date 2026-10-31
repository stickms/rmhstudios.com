import { describe, expect, it } from 'vitest';
import {
  IN_ATTACK,
  IN_ATTACK2,
  IN_BACK,
  IN_DUCK,
  IN_FORWARD,
  IN_JUMP,
  IN_MOVELEFT,
  IN_MOVERIGHT,
  IN_RELOAD,
  IN_SCORE,
} from '../../core/constants';
import { defaultSettings, M_YAW, zoomSensitivityScale } from '../settings';
import { FovState, TF_WEAPON_ZOOM_FOV, TF_ZOOM_RATE } from '../view';
import {
  bindingIndex,
  defaultKeybinds,
  mouseCode,
  rebind,
  slotOf,
  type Keybinds,
} from './actions';
import { applyGamepad, mapGamepad, PAD, stickResponse, type GamepadLike } from './gamepad';
import {
  applyLook,
  buildUserCmd,
  createInputState,
  drainImpulses,
  normalizeYaw,
  pushImpulse,
  releaseAll,
  setHeld,
} from './input-state';
import { dragToLook, floatingOrigin, isTouchFirst, knobOffset, stickVector } from './touch';
import { keyLabel } from './keyboard-mouse';

const settings = defaultSettings('tf2');
const angles = () => ({ x: 0, y: 0, z: 0 });

describe('key bindings', () => {
  it('maps the TF2 defaults to actions', () => {
    const idx = bindingIndex(defaultKeybinds('tf2'));
    expect(idx.get('KeyW')).toEqual(['forward']);
    expect(idx.get('Space')).toEqual(['jump']);
    expect(idx.get('ControlLeft')).toEqual(['duck']);
    expect(idx.get('KeyR')).toEqual(['reload']);
    expect(idx.get('Mouse1')).toEqual(['attack']);
    expect(idx.get('Mouse2')).toEqual(['attack2']);
    expect(idx.get('Digit3')).toEqual(['slot3']);
    expect(idx.get('KeyQ')).toEqual(['lastinv']);
    expect(idx.get('KeyE')).toEqual(['medic']);
    expect(idx.get('Tab')).toEqual(['showscores']);
    expect(idx.get('KeyY')).toEqual(['say']);
    expect(idx.get('KeyU')).toEqual(['say_team']);
    expect(idx.get('KeyZ')).toEqual(['voice_menu_1']);
    expect(idx.get('MWheelUp')).toEqual(['invprev']);
    expect(idx.get('Escape')).toEqual(['menu']);
  });

  it('gives HL2 use, sprint and the flashlight; Portal no weapon slots', () => {
    const hl2 = bindingIndex(defaultKeybinds('hl2'));
    expect(hl2.get('KeyE')).toEqual(['use']);
    expect(hl2.get('ShiftLeft')).toEqual(['speed']);
    expect(hl2.get('KeyF')).toEqual(['flashlight']);
    const portal = bindingIndex(defaultKeybinds('portal'));
    expect(portal.get('Digit1')).toBeUndefined();
    expect(portal.get('Mouse2')).toEqual(['attack2']);
  });

  it('rebinding moves a key off its old action', () => {
    const b: Keybinds = rebind(defaultKeybinds('tf2'), 'jump', 'KeyW');
    expect(b.jump).toEqual(['KeyW', 'Space']);
    expect(b.forward).toBeUndefined();
    const idx = bindingIndex(b);
    expect(idx.get('KeyW')).toEqual(['jump']);
  });

  it('names mouse buttons and keys like Source', () => {
    expect(mouseCode(0)).toBe('Mouse1');
    expect(mouseCode(2)).toBe('Mouse2');
    expect(mouseCode(1)).toBe('Mouse3');
    expect(mouseCode(3)).toBe('Mouse4');
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ControlLeft')).toBe('CTRL');
    expect(keyLabel('Digit7')).toBe('7');
    expect(slotOf('slot4')).toBe(4);
    expect(slotOf('lastinv')).toBe(0);
  });
});

describe('buildUserCmd', () => {
  it('turns held actions into IN_* bits and moves', () => {
    const s = createInputState();
    setHeld(s, 'key', 'forward', true);
    setHeld(s, 'key', 'moveleft', true);
    setHeld(s, 'key', 'jump', true);
    setHeld(s, 'key', 'attack', true);
    setHeld(s, 'key', 'reload', true);
    setHeld(s, 'key', 'showscores', true);
    const cmd = buildUserCmd(s, angles(), settings);
    expect(cmd.buttons & IN_FORWARD).toBeTruthy();
    expect(cmd.buttons & IN_MOVELEFT).toBeTruthy();
    expect(cmd.buttons & IN_JUMP).toBeTruthy();
    expect(cmd.buttons & IN_ATTACK).toBeTruthy();
    expect(cmd.buttons & IN_RELOAD).toBeTruthy();
    expect(cmd.buttons & IN_SCORE).toBeTruthy();
    expect(cmd.buttons & (IN_BACK | IN_MOVERIGHT | IN_DUCK | IN_ATTACK2)).toBe(0);
    expect(cmd.forwardMove).toBe(450);
    expect(cmd.sideMove).toBe(-450);
  });

  it('cancels opposite keys and ORs sources without one releasing another', () => {
    const s = createInputState();
    setHeld(s, 'key', 'forward', true);
    setHeld(s, 'key', 'back', true);
    setHeld(s, 'key', 'jump', true);
    setHeld(s, 'touch', 'jump', true);
    setHeld(s, 'touch', 'jump', false);
    const cmd = buildUserCmd(s, angles(), settings);
    expect(cmd.forwardMove).toBe(0);
    expect(cmd.buttons & IN_JUMP).toBeTruthy();
  });

  it('adds analog sticks, clamped, and sets direction bits past half way', () => {
    const s = createInputState();
    s.analog.pad = { x: 0.3, y: 0.8 };
    s.analog.touch = { x: 0.9, y: 0.6 };
    const cmd = buildUserCmd(s, angles(), settings);
    expect(cmd.forwardMove).toBe(450);
    expect(cmd.sideMove).toBe(450);
    expect(cmd.buttons & IN_FORWARD).toBeTruthy();
    expect(cmd.buttons & IN_MOVERIGHT).toBeTruthy();
  });

  it('converts mouse counts with sensitivity × m_yaw (0.022)', () => {
    const s = createInputState();
    s.mouseDx = 100;
    s.mouseDy = -50;
    const view = angles();
    const cmd = buildUserCmd(s, view, { sensitivity: 2, invertY: false });
    expect(cmd.viewAngles.y).toBeCloseTo(-100 * 2 * M_YAW, 6);
    expect(cmd.viewAngles.x).toBeCloseTo(-50 * 2 * 0.022, 6);
    expect(view.y).toBeCloseTo(-4.4, 6);
    // Accumulators are consumed.
    expect(s.mouseDx).toBe(0);
    const again = buildUserCmd(s, view, { sensitivity: 2, invertY: false });
    expect(again.viewAngles.y).toBeCloseTo(-4.4, 6);
  });

  it('inverts pitch, clamps it to ±89 and wraps yaw', () => {
    const s = createInputState();
    s.mouseDy = 10_000;
    const cmd = buildUserCmd(s, angles(), { sensitivity: 3, invertY: true });
    expect(cmd.viewAngles.x).toBe(-89);
    expect(normalizeYaw(190)).toBe(-170);
    expect(normalizeYaw(-180)).toBe(180);
    const v = { x: 0, y: 179, z: 0 };
    s.lookYaw = 2;
    expect(buildUserCmd(s, v, settings).viewAngles.y).toBeCloseTo(-179, 6);
  });

  it('selects slots, and resolves next / prev / last against the loadout', () => {
    const s = createInputState();
    pushImpulse(s, 'slot2');
    expect(buildUserCmd(s, angles(), settings).weaponSelect).toBe(2);
    expect(buildUserCmd(s, angles(), settings).weaponSelect).toBe(0);
    const weapons = { slots: [1, 2, 3], active: 3, last: 1 };
    pushImpulse(s, 'invnext');
    expect(buildUserCmd(s, angles(), settings, weapons).weaponSelect).toBe(1);
    pushImpulse(s, 'invprev');
    expect(buildUserCmd(s, angles(), settings, weapons).weaponSelect).toBe(2);
    pushImpulse(s, 'lastinv');
    expect(buildUserCmd(s, angles(), settings, weapons).weaponSelect).toBe(1);
    pushImpulse(s, 'slot5');
    expect(buildUserCmd(s, angles(), settings, weapons).weaponSelect).toBe(0);
  });

  it('routes slot keys to the menu while one is open, and drops buttons while suspended', () => {
    const s = createInputState();
    s.menuOpen = true;
    pushImpulse(s, 'slot3');
    expect(drainImpulses(s)).toEqual(['slot3']);
    expect(buildUserCmd(s, angles(), settings).weaponSelect).toBe(0);
    s.menuOpen = false;
    s.suspended = true;
    setHeld(s, 'key', 'attack', true);
    expect(buildUserCmd(s, angles(), settings).buttons).toBe(0);
    releaseAll(s);
    expect(s.held.key.size).toBe(0);
  });
});

const pad = (axes: number[], pressed: number[] = [], values: Record<number, number> = {}): GamepadLike => ({
  connected: true,
  mapping: 'standard',
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: values[i] ?? (pressed.includes(i) ? 1 : 0) })),
});

describe('gamepad', () => {
  it('applies a radial deadzone and a power curve', () => {
    expect(stickResponse(0.1, 0.05, 0.15, 2)).toEqual({ x: 0, y: 0 });
    const full = stickResponse(1, 0, 0.15, 2);
    expect(full.x).toBeCloseTo(1, 6);
    // Half way through the live range → 0.25 with curve 2.
    const half = stickResponse(0.575, 0, 0.15, 2);
    expect(half.x).toBeCloseTo(0.25, 3);
    // Direction is kept on diagonals.
    const diag = stickResponse(0.7, 0.7, 0.15, 1);
    expect(diag.x).toBeCloseTo(diag.y, 6);
    expect(Math.hypot(diag.x, diag.y)).toBeLessThanOrEqual(1);
  });

  it('maps triggers, face buttons and sticks', () => {
    const s = createInputState();
    const prev: boolean[] = [];
    applyGamepad(s, pad([0, -1, 1, 0], [PAD.A], { [PAD.RT]: 0.9, [PAD.LT]: 0.2 }), prev, 0.5, 'tf2', settings);
    expect(s.held.pad.has('attack')).toBe(true);
    expect(s.held.pad.has('attack2')).toBe(false);
    expect(s.held.pad.has('jump')).toBe(true);
    expect(s.analog.pad.y).toBeCloseTo(1, 6);
    // Right stick full right for 0.5 s at 220°/s turns right (yaw decreases).
    expect(s.lookYaw).toBeCloseTo(-110, 3);
    const cmd = buildUserCmd(s, angles(), settings);
    expect(cmd.buttons & IN_ATTACK).toBeTruthy();
    expect(cmd.buttons & IN_FORWARD).toBeTruthy();
  });

  it('fires impulses on button edges only', () => {
    const s = createInputState();
    const prev: boolean[] = [];
    applyGamepad(s, pad([0, 0, 0, 0], [PAD.RB]), prev, 0.016, 'tf2', settings);
    applyGamepad(s, pad([0, 0, 0, 0], [PAD.RB]), prev, 0.016, 'tf2', settings);
    expect(drainImpulses(s)).toEqual(['invnext']);
    applyGamepad(s, pad([0, 0, 0, 0], [PAD.UP]), prev, 0.016, 'tf2', settings);
    expect(drainImpulses(s)).toEqual(['voice_menu_1']);
  });

  it('navigates menus with the d-pad, A and B while one is open', () => {
    const s = createInputState();
    s.menuOpen = true;
    const prev: boolean[] = [];
    applyGamepad(s, pad([0, 0, 0, 0], [PAD.DOWN, PAD.A]), prev, 0.016, 'tf2', settings);
    expect(drainImpulses(s)).toEqual(['menu_accept', 'menu_down']);
    expect(s.held.pad.has('jump')).toBe(false);
  });

  it('gives HL2 use on Y and Portal fire on the bumpers', () => {
    expect(mapGamepad('hl2').held[PAD.Y]).toBe('use');
    expect(mapGamepad('tf2').press[PAD.Y]).toBe('medic');
    expect(mapGamepad('portal').held[PAD.RB]).toBe('attack');
  });
});

describe('touch', () => {
  it('maps the stick with a deadzone, screen-up as forward', () => {
    expect(stickVector({ x: 100, y: 100 }, { x: 103, y: 100 }, 56, 0.12)).toEqual({ x: 0, y: 0 });
    const up = stickVector({ x: 100, y: 100 }, { x: 100, y: 44 }, 56, 0.12);
    expect(up.y).toBeCloseTo(1, 6);
    expect(up.x).toBeCloseTo(0, 6);
    const far = stickVector({ x: 0, y: 0 }, { x: 500, y: 0 }, 56, 0.12);
    expect(far.x).toBeCloseTo(1, 6);
    expect(knobOffset({ x: 0, y: 0 }, { x: 500, y: 0 }, 56)).toEqual({ x: 56, y: 0 });
  });

  it('keeps a floating base inside its zone', () => {
    const o = floatingOrigin({ x: 5, y: 900 }, { left: 0, top: 300, right: 400, bottom: 844 }, 56);
    expect(o).toEqual({ x: 56, y: 788 });
  });

  it('turns a drag into degrees', () => {
    const d = dragToLook(40, -20, 0.25);
    expect(d.yaw).toBeCloseTo(-10, 6);
    expect(d.pitch).toBeCloseTo(-5, 6);
    expect(dragToLook(0, 20, 0.25, true).pitch).toBeCloseTo(-5, 6);
  });

  it('detects touch-first devices', () => {
    expect(isTouchFirst({ coarsePointer: true, anyFinePointer: false, hoverNone: true, maxTouchPoints: 5 })).toBe(true);
    expect(isTouchFirst({ coarsePointer: true, anyFinePointer: true, hoverNone: false, maxTouchPoints: 10 })).toBe(false);
    expect(isTouchFirst({ coarsePointer: false, anyFinePointer: true, hoverNone: false, maxTouchPoints: 0 })).toBe(false);
  });
});

describe('zoom sensitivity (CHud::Think: sensitivity × fov / default_fov × zoom_sensitivity_ratio)', () => {
  it('is 1 at or above the default FOV and the FOV ratio below it', () => {
    expect(zoomSensitivityScale(90, 90)).toBe(1);
    expect(zoomSensitivityScale(100, 90)).toBe(1);
    // TF2's sniper scope (fov 20 against fov_desired 90).
    expect(zoomSensitivityScale(TF_WEAPON_ZOOM_FOV, 90)).toBeCloseTo(20 / 90, 9);
    // CS:GO's AWP levels (40 / 10) and a 75° HL2 player in a 25° env_zoom.
    expect(zoomSensitivityScale(40, 90)).toBeCloseTo(4 / 9, 9);
    expect(zoomSensitivityScale(10, 90)).toBeCloseTo(1 / 9, 9);
    expect(zoomSensitivityScale(25, 75)).toBeCloseTo(1 / 3, 9);
    // zoom_sensitivity_ratio multiplies only while zoomed.
    expect(zoomSensitivityScale(45, 90, 1.5)).toBeCloseTo(0.75, 9);
    expect(zoomSensitivityScale(90, 90, 1.5)).toBe(1);
    // A missing FOV never zeroes the look.
    expect(zoomSensitivityScale(0, 90)).toBe(1);
  });

  it('follows the FOV lerp through a zoom in and out', () => {
    const fov = new FovState(90);
    fov.set(TF_WEAPON_ZOOM_FOV, TF_ZOOM_RATE, 0);
    const mid = zoomSensitivityScale(fov.current(TF_ZOOM_RATE / 2), 90);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(20 / 90);
    expect(zoomSensitivityScale(fov.current(TF_ZOOM_RATE * 2), 90)).toBeCloseTo(20 / 90, 9);
    fov.set(0, TF_ZOOM_RATE, 10);
    expect(zoomSensitivityScale(fov.current(10 + TF_ZOOM_RATE * 2), 90)).toBe(1);
  });

  it('scales the mouse turn by the look scale', () => {
    const plain = createInputState();
    plain.mouseDx = 100;
    const a = applyLook(plain, angles(), settings);
    const zoomed = createInputState();
    zoomed.mouseDx = 100;
    zoomed.lookScale = zoomSensitivityScale(TF_WEAPON_ZOOM_FOV, 90);
    const b = applyLook(zoomed, angles(), settings);
    expect(a.y).toBeCloseTo(-100 * settings.sensitivity * M_YAW, 9);
    expect(b.y).toBeCloseTo(a.y * (20 / 90), 9);
    // The command path scales the same way.
    const cmdState = createInputState();
    cmdState.mouseDy = 50;
    cmdState.lookScale = 0.5;
    expect(buildUserCmd(cmdState, angles(), settings).viewAngles.x).toBeCloseTo(50 * settings.sensitivity * M_YAW * 0.5, 9);
  });

  it('feeds the zoomed sensitivity into m_customaccel, as ScaleMouse reads gHUD.GetSensitivity()', () => {
    // Mode 1: pow(|d|, exp) × scale + sensitivity — only the sensitivity term takes the zoom.
    const accel = { ...settings, mouseAccel: 1, mouseAccelExponent: 1, mouseAccelScale: 0.04 };
    const s = createInputState();
    s.mouseDx = 10;
    s.lookScale = 0.5;
    const y = applyLook(s, angles(), accel).y;
    expect(y).toBeCloseTo(-10 * (10 * 0.04 + settings.sensitivity * 0.5) * M_YAW, 9);
  });

  it('scales gamepad and touch look degrees too', () => {
    const s = createInputState();
    s.lookYaw = 10;
    s.lookPitch = -4;
    s.lookScale = 0.25;
    const a = applyLook(s, angles(), settings);
    expect(a.y).toBeCloseTo(2.5, 9);
    expect(a.x).toBeCloseTo(-1, 9);
  });
});
