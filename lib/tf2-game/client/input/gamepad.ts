/**
 * Gamepad input over the Gamepad API's "standard" mapping, polled once per
 * frame by the client loop (`GamepadInput.poll(dt)` — no rAF of its own):
 *
 *   left stick move · right stick look (radial deadzone + power curve, degrees
 *   per second × dt) · RT fire · LT alt-fire · LB/RB previous/next weapon ·
 *   A jump · B crouch · X reload · Y use (TF2: call for a Medic) · Start menu ·
 *   Select (Back) scoreboard · L3 sprint (HL2) / special attack (TF2) ·
 *   R3 zoom (HL2) / taunt (TF2) · d-pad voice menus (TF2), flashlight and
 *   weapon cycling (HL2).
 *
 * While a HUD menu is open the d-pad, A and B navigate it instead
 * (`menu_up/down/left/right/accept/back` impulses).
 *
 * Pure helpers (`stickResponse`, `mapGamepad`) are separate so they test
 * without a browser.
 */

import type { HudGame } from '../hud-state';
import type { GameSettings } from '../settings';
import type { HeldAction, ImpulseAction } from './actions';
import { pushImpulse, releaseAll, setHeld, type InputState, type Vec2 } from './input-state';

/** The parts of a `Gamepad` the mapping reads. */
export interface GamepadLike {
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
}

// Standard mapping indices (https://w3c.github.io/gamepad/#remapping).
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

/** A trigger counts as pressed past this value. */
export const TRIGGER_THRESHOLD = 0.35;

/**
 * A stick's response: a radial deadzone (the vector's length, so diagonals do
 * not snap to the axes), rescaled to start at 0 just outside it, then raised
 * to `curve` for fine aim near the centre. Direction is preserved; the result's
 * length is at most 1.
 */
export function stickResponse(x: number, y: number, deadzone: number, curve: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len <= deadzone || len === 0) return { x: 0, y: 0 };
  const t = Math.min(1, (len - deadzone) / Math.max(1e-6, 1 - deadzone));
  const mag = Math.pow(t, curve);
  return { x: (x / len) * mag, y: (y / len) * mag };
}

export interface PadMapping {
  /** Held actions while the button is down. */
  held: Partial<Record<number, HeldAction>>;
  /** Impulses on press. */
  press: Partial<Record<number, ImpulseAction>>;
}

/** Per-game button mapping. */
export function mapGamepad(game: HudGame): PadMapping {
  const held: PadMapping['held'] = {
    [PAD.RT]: 'attack',
    [PAD.LT]: 'attack2',
    [PAD.A]: 'jump',
    [PAD.B]: 'duck',
    [PAD.X]: 'reload',
  };
  const press: PadMapping['press'] = {
    [PAD.START]: 'menu',
    [PAD.LB]: 'invprev',
    [PAD.RB]: 'invnext',
  };
  if (game === 'tf2') {
    held[PAD.SELECT] = 'showscores';
    held[PAD.L3] = 'attack3';
    press[PAD.Y] = 'medic';
    press[PAD.R3] = 'taunt';
    press[PAD.UP] = 'voice_menu_1';
    press[PAD.RIGHT] = 'voice_menu_2';
    press[PAD.DOWN] = 'voice_menu_3';
    press[PAD.LEFT] = 'lastinv';
  } else {
    held[PAD.Y] = 'use';
    if (game === 'hl2') {
      held[PAD.L3] = 'speed';
      held[PAD.R3] = 'zoom';
      press[PAD.UP] = 'flashlight';
      press[PAD.LEFT] = 'invprev';
      press[PAD.RIGHT] = 'invnext';
      press[PAD.DOWN] = 'lastinv';
    } else {
      // Portal: no weapon cycling (one gun), the bumpers fire too for comfort.
      delete press[PAD.LB];
      delete press[PAD.RB];
      held[PAD.RB] = 'attack';
      held[PAD.LB] = 'attack2';
    }
  }
  return { held, press };
}

const MENU_NAV: Partial<Record<number, ImpulseAction>> = {
  [PAD.UP]: 'menu_up',
  [PAD.DOWN]: 'menu_down',
  [PAD.LEFT]: 'menu_left',
  [PAD.RIGHT]: 'menu_right',
  [PAD.A]: 'menu_accept',
  [PAD.B]: 'menu_back',
};

const isPressed = (b: { pressed: boolean; value: number } | undefined, index: number): boolean =>
  !!b && (index === PAD.LT || index === PAD.RT ? b.value > TRIGGER_THRESHOLD || b.pressed : b.pressed);

/**
 * Applies one gamepad sample to the input state: held buttons, the move
 * stick, look degrees for `dt` seconds, and impulses on button edges. `prev`
 * is the pressed state from the last sample (updated in place).
 */
export function applyGamepad(
  state: InputState,
  pad: GamepadLike,
  prev: boolean[],
  dt: number,
  game: HudGame,
  settings: Pick<GameSettings, 'gamepad'>,
): void {
  const g = settings.gamepad;
  const map = mapGamepad(game);
  const menu = state.menuOpen;
  for (let i = 0; i < pad.buttons.length; i++) {
    const down = isPressed(pad.buttons[i], i);
    const was = prev[i] ?? false;
    prev[i] = down;
    const nav = menu ? MENU_NAV[i] : undefined;
    const heldAction = map.held[i];
    if (heldAction) setHeld(state, 'pad', heldAction, down && !nav && !state.suspended);
    if (down && !was) {
      if (nav) pushImpulse(state, nav);
      else {
        const imp = map.press[i];
        if (imp) pushImpulse(state, imp);
      }
    }
  }
  if (state.suspended) {
    state.analog.pad.x = 0;
    state.analog.pad.y = 0;
    return;
  }
  const move = stickResponse(pad.axes[0] ?? 0, pad.axes[1] ?? 0, g.deadzone, 1);
  // Gamepad Y is down-positive; forward is up.
  state.analog.pad.x = move.x;
  state.analog.pad.y = -move.y;
  const look = stickResponse(pad.axes[2] ?? 0, pad.axes[3] ?? 0, g.deadzone, g.curve);
  state.lookYaw += -look.x * g.lookSpeed * dt;
  state.lookPitch += look.y * g.lookSpeed * 0.75 * dt * (g.invertY ? -1 : 1);
}

/** Polls `navigator.getGamepads()` (first standard-mapped pad) once per frame. */
export class GamepadInput {
  private prev: boolean[] = [];
  private index = -1;

  constructor(
    private readonly state: InputState,
    private readonly game: HudGame,
    private readonly getSettings: () => Pick<GameSettings, 'gamepad'>,
  ) {}

  /** The pad in use, or null. */
  current(): GamepadLike | null {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    let pads: ReadonlyArray<Gamepad | null>;
    try {
      pads = navigator.getGamepads();
    } catch {
      return null;
    }
    if (this.index >= 0 && pads[this.index]?.connected) return pads[this.index];
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected && p.mapping === 'standard') {
        this.index = i;
        return p;
      }
    }
    this.index = -1;
    return null;
  }

  get connected(): boolean {
    return this.current() !== null;
  }

  poll(dt: number): void {
    const pad = this.current();
    if (!pad) {
      if (this.prev.length) {
        releaseAll(this.state, 'pad');
        this.prev = [];
      }
      return;
    }
    applyGamepad(this.state, pad, this.prev, dt, this.game, this.getSettings());
  }
}
