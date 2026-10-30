/**
 * The one input state every device writes into — keyboard and mouse, gamepad
 * and the touch overlay — and `buildUserCmd`, which turns it into the tick's
 * `UserCmd` (the SDK's CInput::CreateMove: buttons from the held `+commands`,
 * forward/side moves from keys and sticks, view angles from mouse counts and
 * look deltas, weapon selection from the slot impulses).
 *
 * Each source keeps its own held set and analog move, so lifting a finger on
 * the touch jump button never releases a held Space key. Look input arrives
 * two ways: raw mouse counts (`mouseDx/Dy`, converted with the sensitivity
 * here, so the settings apply in one place) and ready-made degrees
 * (`lookYaw/lookPitch`: gamepad rate × dt, touch drag × sensitivity).
 *
 * Environment-agnostic.
 */

import {
  IN_ATTACK,
  IN_ATTACK2,
  IN_ATTACK3,
  IN_BACK,
  IN_DUCK,
  IN_FORWARD,
  IN_JUMP,
  IN_MOVELEFT,
  IN_MOVERIGHT,
  IN_RELOAD,
  IN_SCORE,
  IN_SPEED,
  IN_USE,
} from '../../core/constants';
import type { UserCmd } from '../../core/types';
import type { QAngle } from '../../core/vec';
import { CL_FORWARDSPEED, CL_SIDESPEED, PITCH_LIMIT, mouseToDegrees, type GameSettings, type MouseSettings } from '../settings';
import { slotOf, type HeldAction, type ImpulseAction } from './actions';

/** in_buttons.h bits the core constants do not name yet. */
export const IN_WALK = 1 << 18;
export const IN_ZOOM = 1 << 19;

/** Held action → IN_* bit (0 for actions that are not buttons). */
export const ACTION_BUTTON: Readonly<Record<HeldAction, number>> = {
  forward: IN_FORWARD,
  back: IN_BACK,
  moveleft: IN_MOVELEFT,
  moveright: IN_MOVERIGHT,
  jump: IN_JUMP,
  duck: IN_DUCK,
  attack: IN_ATTACK,
  attack2: IN_ATTACK2,
  attack3: IN_ATTACK3,
  reload: IN_RELOAD,
  use: IN_USE,
  speed: IN_SPEED,
  walk: IN_WALK,
  zoom: IN_ZOOM,
  showscores: IN_SCORE,
  inspect: 0,
};

export type InputSource = 'key' | 'pad' | 'touch';

export interface Vec2 {
  x: number;
  y: number;
}

export interface InputState {
  held: Record<InputSource, Set<HeldAction>>;
  /** Analog move per source: x = right, y = forward, each −1…1. */
  analog: Record<InputSource, Vec2>;
  /** Raw mouse counts since the last command. */
  mouseDx: number;
  mouseDy: number;
  /** The previous look sample's counts (`m_filter` averages over two samples). */
  mousePrevX: number;
  mousePrevY: number;
  /** Look in degrees since the last command (+yaw turns left, +pitch looks down — Source's axes). */
  lookYaw: number;
  lookPitch: number;
  /** 1-based weapon slot asked for since the last command (0 = none). */
  weaponSelect: number;
  /** Relative weapon switches asked for (resolved against the loadout by buildUserCmd). */
  weaponStep: 'next' | 'prev' | 'last' | null;
  /** Impulses not yet handled by the HUD (chat, voice menus, menu navigation…). */
  impulses: ImpulseAction[];
  /** A HUD menu is open: slot keys pick menu items, not weapons. */
  menuOpen: boolean;
  /** Text entry or the pause menu has the keyboard: the game sees no keys. */
  suspended: boolean;
}

export function createInputState(): InputState {
  return {
    held: { key: new Set(), pad: new Set(), touch: new Set() },
    analog: { key: { x: 0, y: 0 }, pad: { x: 0, y: 0 }, touch: { x: 0, y: 0 } },
    mouseDx: 0,
    mouseDy: 0,
    mousePrevX: 0,
    mousePrevY: 0,
    lookYaw: 0,
    lookPitch: 0,
    weaponSelect: 0,
    weaponStep: null,
    impulses: [],
    menuOpen: false,
    suspended: false,
  };
}

/** Press or release a held action from one source. */
export function setHeld(state: InputState, source: InputSource, action: HeldAction, down: boolean): void {
  if (down) state.held[source].add(action);
  else state.held[source].delete(action);
}

/** Release everything a source holds (window blur, pointer lock lost, a touch cancelled). */
export function releaseAll(state: InputState, source?: InputSource): void {
  const sources: InputSource[] = source ? [source] : ['key', 'pad', 'touch'];
  for (const s of sources) {
    state.held[s].clear();
    state.analog[s].x = 0;
    state.analog[s].y = 0;
  }
}

/**
 * Queue an impulse. Weapon impulses also set the pending selection — unless a
 * menu is open, where `slotN` is a menu choice (Source's `menuselect`).
 */
export function pushImpulse(state: InputState, action: ImpulseAction): void {
  const slot = slotOf(action);
  if (!state.menuOpen) {
    if (slot) state.weaponSelect = slot;
    else if (action === 'invnext') state.weaponStep = 'next';
    else if (action === 'invprev') state.weaponStep = 'prev';
    else if (action === 'lastinv') state.weaponStep = 'last';
  }
  state.impulses.push(action);
  if (state.impulses.length > 64) state.impulses.splice(0, state.impulses.length - 64);
}

/** Takes the queued impulses (the HUD calls this once per frame). */
export function drainImpulses(state: InputState): ImpulseAction[] {
  if (!state.impulses.length) return [];
  const out = state.impulses;
  state.impulses = [];
  return out;
}

/** OR of every source's held buttons. */
export function heldButtons(state: InputState): number {
  let b = 0;
  for (const s of ['key', 'pad', 'touch'] as const) for (const a of state.held[s]) b |= ACTION_BUTTON[a];
  return b;
}

/** Keyboard digital movement as an analog vector (W/S, A/D cancel like Source's KeyState). */
export function keyMove(held: ReadonlySet<HeldAction>): Vec2 {
  return {
    x: (held.has('moveright') ? 1 : 0) - (held.has('moveleft') ? 1 : 0),
    y: (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0),
  };
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Yaw into (−180, 180] (anglemod as the engine sends it). */
export function normalizeYaw(yaw: number): number {
  let y = yaw % 360;
  if (y > 180) y -= 360;
  else if (y <= -180) y += 360;
  return y;
}

/** What `buildUserCmd` needs to resolve next/prev/last weapon (1-based slots). */
export interface WeaponContext {
  /** Slots the player has, ascending (1 = primary). */
  slots: readonly number[];
  active: number;
  last: number;
}

/** The settings the look reads. */
export type LookSettings = MouseSettings & Partial<Pick<GameSettings, 'mouseFilter'>>;

/**
 * Applies the pending look to `viewAngles` (mutated and returned). Pitch clamps to ±89 (cl_pitchup/down).
 * With `m_filter` the counts are averaged with the previous sample's (CInput::GetMouseDelta).
 */
export function applyLook(state: InputState, viewAngles: QAngle, settings: LookSettings, frameSample = true): QAngle {
  let dx = state.mouseDx;
  let dy = state.mouseDy;
  // One filter sample per rendered frame (the client's frame call); a command's own call adds none.
  if (frameSample) {
    if (settings.mouseFilter) {
      dx = (dx + state.mousePrevX) * 0.5;
      dy = (dy + state.mousePrevY) * 0.5;
    }
    state.mousePrevX = state.mouseDx;
    state.mousePrevY = state.mouseDy;
  }
  const m = mouseToDegrees(dx, dy, settings);
  viewAngles.y = normalizeYaw(viewAngles.y + m.yaw + state.lookYaw);
  viewAngles.x = clamp(viewAngles.x + m.pitch + state.lookPitch, -PITCH_LIMIT, PITCH_LIMIT);
  viewAngles.z = 0;
  return viewAngles;
}

/**
 * Builds this tick's command from the input state and clears the per-command
 * accumulators (mouse counts, look degrees, weapon selection). `viewAngles` is
 * updated in place — it is the client's view, which the command carries.
 * The command number, tick and seed are the sender's (net/input.ts).
 */
export function buildUserCmd(
  state: InputState,
  viewAngles: QAngle,
  settings: LookSettings,
  weapons?: WeaponContext,
  out: Partial<UserCmd> = {},
): UserCmd {
  applyLook(state, viewAngles, settings, false);
  let buttons = 0;
  let mx = 0;
  let my = 0;
  if (!state.suspended) {
    buttons = heldButtons(state);
    const k = keyMove(state.held.key);
    mx = clamp(k.x + state.analog.pad.x + state.analog.touch.x, -1, 1);
    my = clamp(k.y + state.analog.pad.y + state.analog.touch.y, -1, 1);
    // Analog movement presses the direction bits too, as a stick past half way does in CInput::JoyStickMove.
    if (my > 0.5) buttons |= IN_FORWARD;
    if (my < -0.5) buttons |= IN_BACK;
    if (mx > 0.5) buttons |= IN_MOVERIGHT;
    if (mx < -0.5) buttons |= IN_MOVELEFT;
  }
  const cmd: UserCmd = {
    commandNumber: out.commandNumber ?? 0,
    tickCount: out.tickCount ?? 0,
    viewAngles: { x: viewAngles.x, y: viewAngles.y, z: 0 },
    forwardMove: my * CL_FORWARDSPEED,
    sideMove: mx * CL_SIDESPEED,
    upMove: 0,
    buttons,
    weaponSelect: resolveWeaponSelect(state, weapons),
    randomSeed: out.randomSeed ?? 0,
  };
  state.mouseDx = 0;
  state.mouseDy = 0;
  state.lookYaw = 0;
  state.lookPitch = 0;
  state.weaponSelect = 0;
  state.weaponStep = null;
  return cmd;
}

/** The pending absolute slot, or the next/prev/last slot the loadout has (CBaseHudWeaponSelection::CycleTo…). */
export function resolveWeaponSelect(state: InputState, weapons?: WeaponContext): number {
  if (state.weaponSelect) {
    if (!weapons || weapons.slots.includes(state.weaponSelect)) return state.weaponSelect;
    return 0;
  }
  if (!state.weaponStep || !weapons || weapons.slots.length === 0) return 0;
  const slots = weapons.slots;
  if (state.weaponStep === 'last') return weapons.last && slots.includes(weapons.last) && weapons.last !== weapons.active ? weapons.last : 0;
  const i = slots.indexOf(weapons.active);
  const n = slots.length;
  const next = state.weaponStep === 'next' ? slots[(i + 1 + n) % n] : slots[(i - 1 + n) % n];
  return next === weapons.active ? 0 : next;
}
