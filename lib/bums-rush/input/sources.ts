/**
 * Bum's Rush — the unified input producer (§4, §4.7).
 *
 * Everything above this file reads exactly one physical source. A seat can be
 * driven by several at once (a gamepad's stick AND its keyboard alternate
 * both live, per §4.5's "multiple per action = alternates"), so this module
 * is where they become the one `InputFrame` per owned seat per tick that
 * `net/input.ts` puts on the wire.
 *
 * **Merge rule.** For an axis action (`aimLeft`/`aimRight`), every live
 * alternate resolves to a candidate vector and the LARGEST-magnitude one wins
 * — so if a customised profile has both a gamepad stick and a keyboard
 * alternate bound and both happen to be live, whichever currently has the
 * stronger signal drives the arm, rather than one silently overriding the
 * other by binding order. For a boolean/analog action (grab, emote, …), every
 * live alternate is OR'd (boolean) or MAX'd (grip) — this is what makes "LT
 * OR LB both grab" (§4.1) actually true rather than LB just not working.
 *
 * **Two layers of aim smoothing, deliberately distinct:**
 *  1. Keyboard's own digital→analog smoothing (§4.2, 12 rad/s) — always
 *     applied to the keyboard candidate specifically, before merging.
 *  2. The `aimSmoothing` ASSIST (§4.7, default 0.35) — a low-pass over
 *     whichever vector wins the merge, applied uniformly regardless of
 *     source, for tremor and worn sticks.
 *
 * **`pause`/`objectives` never reach `InputFrame.buttons`** — `InputButton`
 * (types.ts, THE CONTRACT) has no bits for them. They come back as
 * edge-triggered `meta` flags instead; see `bindings.ts`'s `ACTION_IDS` doc
 * comment for why.
 */

import type { Assists, InputFrame, SeatIndex, Vec2 } from '../types';
import { InputButton } from '../types';
import { NET } from '../constants';
import type { Binding, BindingSet } from './bindings';
import { readGamepadAxisPair, readGamepadButtonPressed, readGamepadGripStrength } from './gamepad';
import {
  aimVectorFromSmoother,
  createAimSmoother,
  isKeyboardActionPressed,
  resolveDigitalAimTarget,
  smoothDigitalAim,
  type AimSmoother,
} from './keyboard';
import { isMouseActionPressed, resolveMouseAim, type MouseState } from './mouse';
import type { ArmSide, TouchFrame, TouchScheme } from './touch';

/** The cadence `InputFrame`s are meant to be produced at (THE CONTRACT: `NET.INPUT_HZ`). Callers may drive `produceInputFrame` at a different `dtSeconds` — the aim-smoothing assist is dt-aware specifically so that's safe. */
export const INPUT_TICK_SECONDS = 1 / NET.INPUT_HZ;

// ─── Device snapshots ───────────────────────────────────────────────────────

export interface KeyboardSnapshot {
  held: ReadonlySet<string>;
}

export interface GamepadSnapshot {
  pad: Gamepad;
}

export interface MouseSnapshot {
  state: MouseState;
}

export interface DeviceSnapshot {
  keyboard?: KeyboardSnapshot;
  gamepad?: GamepadSnapshot;
  mouse?: MouseSnapshot;
  touch?: TouchFrame;
  /** Pressed touch-button codes (`grab-left-button`, `btn-emote`, …) — the two-stick scheme's explicit buttons, resolved like any other boolean binding. */
  touchButtonsPressed?: ReadonlySet<string>;
}

const EMPTY_HELD: ReadonlySet<string> = new Set();

// ─── Per-seat persistent state ──────────────────────────────────────────────

export interface SeatInputState {
  keyboardAimL: AimSmoother;
  keyboardAimR: AimSmoother;
  /** Output of the `aimSmoothing` assist low-pass, carried tick to tick. */
  smoothedAimL: Vec2;
  smoothedAimR: Vec2;
  /** One-handed mode's currently-active arm (§4.7). */
  oneHandedActiveArm: ArmSide;
  /** Edge-detect state for the one-handed swap trigger. */
  swapHeldLastTick: boolean;
  /** Edge-detect state for the pause/objectives meta actions. */
  pauseHeldLastTick: boolean;
  objectivesHeldLastTick: boolean;
}

export function createSeatInputState(): SeatInputState {
  return {
    keyboardAimL: createAimSmoother(),
    keyboardAimR: createAimSmoother(),
    smoothedAimL: { x: 0, y: 0 },
    smoothedAimR: { x: 0, y: 0 },
    oneHandedActiveArm: 'l',
    swapHeldLastTick: false,
    pauseHeldLastTick: false,
    objectivesHeldLastTick: false,
  };
}

// ─── Pure merge helpers ──────────────────────────────────────────────────────

/** The alternate with the largest magnitude wins (see module doc comment). Ties keep the first. */
export function maxMagnitude(vectors: readonly Vec2[]): Vec2 {
  let best: Vec2 = { x: 0, y: 0 };
  let bestMagSq = 0;
  for (const v of vectors) {
    const magSq = v.x * v.x + v.y * v.y;
    if (magSq > bestMagSq) {
      bestMagSq = magSq;
      best = v;
    }
  }
  return best;
}

/**
 * Exponential low-pass toward `target`, frame-rate independent: `smoothing`
 * (0..1, `Assists.aimSmoothing`) is the fraction of the OLD value retained
 * per `1/60`s reference tick — the constant the design doc's 0.35 default is
 * tuned against (`PHYSICS.FIXED_DT_MS`) — so calling this at any cadence
 * converges at the same real-world rate. `0` is a snap-to-target passthrough.
 */
export function lowPassAim(prev: Vec2, target: Vec2, smoothing: number, dtSeconds: number): Vec2 {
  const clamped = Math.min(1, Math.max(0, smoothing));
  if (clamped <= 0) return target;
  const REFERENCE_DT_SECONDS = 1 / 60;
  const steps = Math.max(0, dtSeconds) / REFERENCE_DT_SECONDS;
  const retain = clamped ** steps;
  return {
    x: target.x + (prev.x - target.x) * retain,
    y: target.y + (prev.y - target.y) * retain,
  };
}

// ─── Per-action resolution ───────────────────────────────────────────────────

interface ResolveContext {
  dtSeconds: number;
  devices: DeviceSnapshot;
  deadzone: number;
  saturation: number;
  touchScheme: TouchScheme;
  mouseAnchorL: Vec2 | undefined;
  mouseAnchorR: Vec2 | undefined;
}

interface AimResolution {
  raw: Vec2;
  nextSmoother: AimSmoother;
}

/**
 * `resolveDigitalAimTarget` already ignores non-keyboard-axis bindings, so
 * `bindings` is passed through unfiltered — the keyboard candidate is simply
 * `{0,0}` (magnitude 0, never wins the merge) when the action has no keyboard
 * alternate bound at all.
 */
function resolveAimAction(
  bindings: readonly Binding[],
  side: ArmSide,
  ctx: ResolveContext,
  prevSmoother: AimSmoother,
): AimResolution {
  const held = ctx.devices.keyboard?.held ?? EMPTY_HELD;
  const target = resolveDigitalAimTarget(bindings, held);
  const nextSmoother = smoothDigitalAim(prevSmoother, target, ctx.dtSeconds);

  const candidates: Vec2[] = [aimVectorFromSmoother(nextSmoother)];

  for (const binding of bindings) {
    if (binding.source === 'gamepad' && ctx.devices.gamepad) {
      candidates.push(readGamepadAxisPair(ctx.devices.gamepad.pad, binding.code, ctx.deadzone, ctx.saturation));
    } else if (binding.source === 'touch' && ctx.devices.touch) {
      if (binding.code === 'half-left') candidates.push(ctx.devices.touch.left.aim);
      else if (binding.code === 'half-right') candidates.push(ctx.devices.touch.right.aim);
    } else if (binding.source === 'mouse' && ctx.devices.mouse) {
      const anchor = side === 'l' ? ctx.mouseAnchorL : ctx.mouseAnchorR;
      if (anchor) candidates.push(resolveMouseAim(anchor, ctx.devices.mouse.state.position));
    }
  }

  return { raw: maxMagnitude(candidates), nextSmoother };
}

/**
 * Auto-Grab's grip is a fact about the ARM (a finger down on that half), not
 * about any specific bound code — it's added once per side rather than once
 * per touch binding, so a customised binding set can't accidentally double-
 * or zero-count it. The two-stick scheme's grab buttons, by contrast, ARE
 * ordinary bound codes and go through the normal per-binding loop.
 */
function resolveGripAction(
  side: ArmSide,
  bindings: readonly Binding[],
  ctx: ResolveContext,
  assists: Assists,
): number {
  const candidates: number[] = [];

  for (const binding of bindings) {
    switch (binding.source) {
      case 'keyboard':
        if (ctx.devices.keyboard && isKeyboardActionPressed([binding], ctx.devices.keyboard.held)) candidates.push(1);
        break;
      case 'gamepad':
        if (ctx.devices.gamepad) {
          candidates.push(readGamepadGripStrength(ctx.devices.gamepad.pad, binding.code, assists.analogTriggers));
        }
        break;
      case 'mouse':
        if (ctx.devices.mouse && isMouseActionPressed(binding.code, ctx.devices.mouse.state)) candidates.push(1);
        break;
      case 'touch':
        if (ctx.touchScheme === 'two-stick' && ctx.devices.touchButtonsPressed?.has(binding.code)) candidates.push(1);
        break;
    }
  }

  if (ctx.touchScheme === 'auto-grab' && ctx.devices.touch) {
    const frame = side === 'l' ? ctx.devices.touch.left : ctx.devices.touch.right;
    candidates.push(frame.gripRequested ? 1 : 0);
  }

  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function resolveButtonAction(bindings: readonly Binding[], ctx: ResolveContext): boolean {
  for (const binding of bindings) {
    switch (binding.source) {
      case 'keyboard':
        if (ctx.devices.keyboard && isKeyboardActionPressed([binding], ctx.devices.keyboard.held)) return true;
        break;
      case 'gamepad':
        if (ctx.devices.gamepad && readGamepadButtonPressed(ctx.devices.gamepad.pad, binding.code)) return true;
        break;
      case 'mouse':
        if (ctx.devices.mouse && isMouseActionPressed(binding.code, ctx.devices.mouse.state)) return true;
        break;
      case 'touch':
        if (ctx.devices.touchButtonsPressed?.has(binding.code)) return true;
        break;
    }
  }
  return false;
}

// ─── The producer ────────────────────────────────────────────────────────────

export interface ProduceFrameInput {
  seat: SeatIndex;
  /** The host frame this input targets — the caller's own counter, fed straight into `InputFrame.frame` / `net/input.ts`. */
  frameNumber: number;
  dtSeconds: number;
  bindingSet: BindingSet;
  devices: DeviceSnapshot;
  /**
   * Screen-space shoulder positions for mouse aim (§4.3) — a render/camera
   * fact this module cannot compute itself. Omit an arm to leave its mouse
   * alternate inert that tick (other alternates on the same action still
   * work).
   */
  mouseAnchorL?: Vec2;
  mouseAnchorR?: Vec2;
  assists: Assists;
  touchScheme: TouchScheme;
  prevState: SeatInputState;
}

export interface ProduceFrameResult {
  frame: InputFrame;
  /** Local, UI-level actions with no `InputButton` bit — see the module doc comment. Each is true only on the tick the press started. */
  meta: { pauseJustPressed: boolean; objectivesJustPressed: boolean };
  nextState: SeatInputState;
}

export function produceInputFrame(input: ProduceFrameInput): ProduceFrameResult {
  const { bindingSet, devices, assists, touchScheme, prevState, dtSeconds } = input;
  const ctx: ResolveContext = {
    dtSeconds,
    devices,
    deadzone: bindingSet.deadzone,
    saturation: bindingSet.saturation,
    touchScheme,
    mouseAnchorL: input.mouseAnchorL,
    mouseAnchorR: input.mouseAnchorR,
  };

  const aimLeftResolution = resolveAimAction(bindingSet.bindings.aimLeft ?? [], 'l', ctx, prevState.keyboardAimL);
  const aimRightResolution = resolveAimAction(bindingSet.bindings.aimRight ?? [], 'r', ctx, prevState.keyboardAimR);

  const smoothedAimL = lowPassAim(prevState.smoothedAimL, aimLeftResolution.raw, assists.aimSmoothing, dtSeconds);
  const smoothedAimR = lowPassAim(prevState.smoothedAimR, aimRightResolution.raw, assists.aimSmoothing, dtSeconds);

  const gripLeftRaw = resolveGripAction('l', bindingSet.bindings.grabLeft ?? [], ctx, assists);
  const gripRightRaw = resolveGripAction('r', bindingSet.bindings.grabRight ?? [], ctx, assists);

  let buttons = 0;
  if (resolveButtonAction(bindingSet.bindings.emote ?? [], ctx)) buttons |= InputButton.Emote;
  if (resolveButtonAction(bindingSet.bindings.useItem ?? [], ctx)) buttons |= InputButton.UseItem;
  if (resolveButtonAction(bindingSet.bindings.dropItem ?? [], ctx)) buttons |= InputButton.Drop;
  if (resolveButtonAction(bindingSet.bindings.toggleTags ?? [], ctx)) buttons |= InputButton.ToggleTags;

  let aimL = smoothedAimL;
  let aimR = smoothedAimR;
  let gripL = gripLeftRaw;
  let gripR = gripRightRaw;
  let oneHandedActiveArm = prevState.oneHandedActiveArm;
  let swapHeldLastTick = false;

  if (assists.oneHanded) {
    // §4.7: "Both arms driven from one stick: aim controls the active arm,
    // grab-toggle swaps." There is no ActionId for the swap toggle (§4.5's
    // list doesn't have one) and `InputButton.SwapArm` exists in THE
    // CONTRACT with nothing else to drive it — so grabRight's alternates,
    // which normally grip the right hand, are entirely repurposed here as
    // the swap trigger, edge-detected so a HELD press doesn't swap every
    // tick. grabLeft's alternates become "the" grip button, applied to
    // whichever arm is currently active.
    const swapPressed = gripRightRaw > 0.5;
    const swapJustPressed = swapPressed && !prevState.swapHeldLastTick;
    swapHeldLastTick = swapPressed;
    if (swapJustPressed) {
      oneHandedActiveArm = oneHandedActiveArm === 'l' ? 'r' : 'l';
      buttons |= InputButton.SwapArm;
    }

    const activeAim = smoothedAimL;
    aimL = oneHandedActiveArm === 'l' ? activeAim : { x: 0, y: 0 };
    aimR = oneHandedActiveArm === 'r' ? activeAim : { x: 0, y: 0 };
    gripL = oneHandedActiveArm === 'l' ? gripLeftRaw : 0;
    gripR = oneHandedActiveArm === 'r' ? gripLeftRaw : 0;
  }

  const pausePressed = resolveButtonAction(bindingSet.bindings.pause ?? [], ctx);
  const objectivesPressed = resolveButtonAction(bindingSet.bindings.objectives ?? [], ctx);

  const frame: InputFrame = {
    seat: input.seat,
    frame: input.frameNumber,
    aimL,
    aimR,
    gripL,
    gripR,
    buttons,
  };

  const nextState: SeatInputState = {
    keyboardAimL: aimLeftResolution.nextSmoother,
    keyboardAimR: aimRightResolution.nextSmoother,
    smoothedAimL,
    smoothedAimR,
    oneHandedActiveArm,
    swapHeldLastTick,
    pauseHeldLastTick: pausePressed,
    objectivesHeldLastTick: objectivesPressed,
  };

  return {
    frame,
    meta: {
      pauseJustPressed: pausePressed && !prevState.pauseHeldLastTick,
      objectivesJustPressed: objectivesPressed && !prevState.objectivesHeldLastTick,
    },
    nextState,
  };
}
