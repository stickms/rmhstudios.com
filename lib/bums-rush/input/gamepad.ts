/**
 * Bum's Rush — gamepad reading (§4.1).
 *
 * Everything here is pure given a `Gamepad` snapshot, except the three
 * explicitly stateful/side-effecting helpers at the bottom (`pollGamepads`,
 * `watchForGamepadPress`, `playGamepadRumble`) — and even those never touch
 * `navigator`/`window` outside a function body, because this module is
 * imported during SSR (repo rule).
 *
 * Button/stick identity uses one small string scheme so `bindings.ts` and
 * `glyphs.ts` can agree on what a code means without importing browser types:
 * `stick0`/`stick1` are the whole left/right stick (a Binding here yields a
 * full Vec2, unlike a keyboard key which only ever drives one axis
 * component), `buttonN` is `pad.buttons[N]` under the W3C "standard" gamepad
 * mapping — the same mapping `components/nightrail/NightrailGame.tsx` already
 * assumes (`pad.axes[2]/[3]` for the right stick, `pad.buttons[6]/[7]` for
 * the triggers, `pad.buttons[12..15]` for the d-pad).
 */

import type { Vec2 } from '../types';
import { PHYSICS } from '../constants';

// ─── Brand detection (§4.1) ────────────────────────────────────────────────

export type PadBrand = 'xbox' | 'playstation' | 'nintendo' | 'generic';

/**
 * A hint, not a lock (§4.1) — `resolvePadBrand` lets `GameSettings.padBrand`
 * override it. Matches on vendor id substrings the way browsers actually
 * report `Gamepad.id` (e.g. `"Sony Interactive Entertainment Wireless
 * Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"` or
 * `"Xbox 360 Controller (XInput STANDARD GAMEPAD)"`).
 */
export function detectPadBrand(id: string): PadBrand {
  const lowered = id.toLowerCase();
  if (lowered.includes('054c')) return 'playstation';
  if (lowered.includes('057e')) return 'nintendo';
  if (/xinput|xbox/.test(lowered)) return 'xbox';
  return 'generic';
}

/** `override` is `GameSettings.padBrand` — `'auto'` defers to detection, anything else wins outright. */
export function resolvePadBrand(
  id: string,
  override: 'auto' | PadBrand,
): PadBrand {
  return override === 'auto' ? detectPadBrand(id) : override;
}

/**
 * A stable-ish per-model key for the binding-profile store (§4.5: "keyed by
 * `gamepad.id` hash for pads"). FNV-1a over the id string — deterministic,
 * no crypto dependency, short enough to use as a storage key suffix.
 *
 * Known limitation: the Gamepad API exposes no hardware serial, so two
 * identical-model pads connected at once hash to the same key and share one
 * binding profile. Accepted for this ticket — see the input-layer report.
 */
export function hashPadId(id: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ─── Deadzone / saturation (§4.1) ──────────────────────────────────────────

/**
 * Radial deadzone with a re-normalised outer range: inputs inside `deadzone`
 * read as zero, inputs at or beyond `saturation` read as full strength, and
 * everything between is rescaled to fill 0..1 — so a stick that leaves the
 * deadzone doesn't feel like it "starts" partway up the response curve.
 * Direction is preserved throughout; only magnitude is reshaped. Because the
 * threshold is on magnitude rather than per-axis, a square-gated stick whose
 * diagonal reads a hair under the cardinal maximum still saturates at the
 * `saturation` radius rather than falling just short of full strength.
 */
export function applyRadialDeadzone(x: number, y: number, deadzone: number, saturation: number): Vec2 {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) return { x: 0, y: 0 };

  const span = Math.max(1e-6, saturation - deadzone);
  const clamped = Math.min(magnitude, saturation);
  const normalisedMagnitude = (clamped - deadzone) / span; // 0..1
  const scale = normalisedMagnitude / magnitude;
  return { x: x * scale, y: y * scale };
}

function parseStickCode(code: string): [xIndex: number, yIndex: number] | null {
  if (code === 'stick0') return [0, 1];
  if (code === 'stick1') return [2, 3];
  return null;
}

/** `binding.code` is expected to be `'stick0'` or `'stick1'`; anything else reads as centred. */
export function readGamepadAxisPair(
  pad: Gamepad,
  code: string,
  deadzone: number,
  saturation: number,
): Vec2 {
  const indices = parseStickCode(code);
  if (!indices) return { x: 0, y: 0 };
  const [xIndex, yIndex] = indices;
  const x = pad.axes[xIndex] ?? 0;
  const y = pad.axes[yIndex] ?? 0;
  return applyRadialDeadzone(x, y, deadzone, saturation);
}

// ─── Buttons & analog triggers (§4.1) ──────────────────────────────────────

function parseButtonCode(code: string): number | null {
  if (!code.startsWith('button')) return null;
  const index = Number(code.slice('button'.length));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

export function readGamepadButtonPressed(pad: Gamepad, code: string): boolean {
  const index = parseButtonCode(code);
  if (index === null) return false;
  return pad.buttons[index]?.pressed ?? false;
}

/** The W3C standard mapping's analog trigger slots. Bumpers (4/5) never carry a meaningful analog value. */
const ANALOG_TRIGGER_INDICES = new Set([6, 7]);

/**
 * Grip strength contributed by one gamepad binding, 0..1.
 *
 * Below `TRIGGER_GRIP_FLOOR` an analog trigger contributes nothing; above it,
 * pull maps linearly onto `TRIGGER_GRIP_MIN_SCALE`..1 (§4.1 / constants.ts —
 * THE CONTRACT). Digital-only buttons (bumpers, or any trigger with
 * `analogTriggers` off) are binary: pressed = full strength, exactly matching
 * the `analogTriggers: false` assist definition in §4.7.
 */
export function readGamepadGripStrength(pad: Gamepad, code: string, analogTriggersEnabled: boolean): number {
  const index = parseButtonCode(code);
  if (index === null) return 0;
  const button = pad.buttons[index];
  if (!button) return 0;

  const isAnalogTrigger = analogTriggersEnabled && ANALOG_TRIGGER_INDICES.has(index);
  if (!isAnalogTrigger) return button.pressed ? 1 : 0;

  return triggerGripStrength(button.value);
}

/** The floor/scale mapping in isolation, for direct testing against the raw pull value. */
export function triggerGripStrength(pullValue: number): number {
  if (pullValue < PHYSICS.TRIGGER_GRIP_FLOOR) return 0;
  const t = (pullValue - PHYSICS.TRIGGER_GRIP_FLOOR) / (1 - PHYSICS.TRIGGER_GRIP_FLOOR);
  return PHYSICS.TRIGGER_GRIP_MIN_SCALE + t * (1 - PHYSICS.TRIGGER_GRIP_MIN_SCALE);
}

// ─── Rumble (§4.1, feature-detected) ───────────────────────────────────────

interface VibrationActuatorLike {
  playEffect?: (type: 'dual-rumble', params: Record<string, number>) => Promise<unknown>;
}

export function supportsGamepadRumble(pad: Gamepad | null): boolean {
  if (!pad) return false;
  const actuator = (pad as Gamepad & { vibrationActuator?: VibrationActuatorLike }).vibrationActuator;
  return typeof actuator?.playEffect === 'function';
}

export interface RumbleEffect {
  durationMs: number;
  /** 0..1 base magnitudes before the intensity slider is applied. */
  weak: number;
  strong: number;
}

/**
 * Fire a rumble effect. `intensity` is the caller's own 0..1 setting (the
 * `BindingSet.rumble` / `GameSettings.rumble` slider) — this function has no
 * settings storage of its own, so the same pad can be driven by whatever
 * intensity the current player/profile has chosen. Silently does nothing on a
 * pad without an actuator, or a rejected `playEffect` call (a bare trigger
 * pull on unsupported hardware must never produce console noise).
 */
export function playGamepadRumble(pad: Gamepad | null, effect: RumbleEffect, intensity: number): void {
  if (!pad || intensity <= 0) return;
  const actuator = (pad as Gamepad & { vibrationActuator?: VibrationActuatorLike }).vibrationActuator;
  if (!actuator?.playEffect) return;

  const clampedIntensity = Math.min(1, Math.max(0, intensity));
  void actuator
    .playEffect('dual-rumble', {
      duration: Math.max(1, Math.round(effect.durationMs)),
      weakMagnitude: Math.min(1, Math.max(0, effect.weak)) * clampedIntensity,
      strongMagnitude: Math.min(1, Math.max(0, effect.strong)) * clampedIntensity,
    })
    .catch(() => {
      // No actuator, or the browser declined — decoration failing is not an error.
    });
}

// ─── Polling & the user-gesture catch (§4.1) ───────────────────────────────

/** SSR-safe: returns `[]` where there is no `navigator.getGamepads`. */
export function pollGamepads(): readonly (Gamepad | null)[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
  return navigator.getGamepads();
}

export function padHasAnyButtonPressed(pad: Gamepad): boolean {
  return pad.buttons.some((button) => button.pressed);
}

/**
 * "Press any button" (§4.1): browsers withhold gamepad state until a user
 * gesture, and Chrome vs. Firefox disagree on whether merely plugging one in
 * fires `gamepadconnected` before that gesture — so the title screen needs
 * BOTH the event and a poll loop to reliably notice a pad exists. Returns a
 * disposer. SSR-safe (no-ops without `window`).
 */
export function watchForGamepadPress(onDetected: (pad: Gamepad) => void, pollIntervalMs = 250): () => void {
  if (typeof window === 'undefined') return () => {};

  let disposed = false;

  const checkAlreadyConnected = () => {
    for (const pad of pollGamepads()) {
      if (pad && padHasAnyButtonPressed(pad)) {
        onDetected(pad);
        return;
      }
    }
  };

  const onConnected = (event: GamepadEvent) => {
    if (!disposed) onDetected(event.gamepad);
  };

  window.addEventListener('gamepadconnected', onConnected);
  const interval = window.setInterval(() => {
    if (!disposed) checkAlreadyConnected();
  }, pollIntervalMs);
  checkAlreadyConnected();

  return () => {
    disposed = true;
    window.removeEventListener('gamepadconnected', onConnected);
    window.clearInterval(interval);
  };
}
