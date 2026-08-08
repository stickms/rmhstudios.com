/**
 * Bum's Rush — input layer barrel (§4, §12.2).
 *
 * Client-side only: every module behind this barrel reads keyboard/mouse/
 * gamepad/touch APIs (feature-detected, SSR-guarded) and none of it is
 * imported by the socket hub — that boundary is `net/`, which turns the
 * `InputFrame`s this layer produces into wire packets.
 */

export {
  ACTION_IDS,
  CURRENT_BINDING_VERSION,
  DEADZONE_DEFAULT,
  DEADZONE_MAX,
  DEADZONE_MIN,
  RUMBLE_DEFAULT,
  SATURATION_DEFAULT,
  SATURATION_MAX,
  SATURATION_MIN,
  bindAction,
  clampDeadzone,
  clampRumble,
  clampSaturation,
  cloneBindingSet,
  defaultBindingSetFor,
  deserialiseBindingSet,
  findConflicts,
  migrateBindingSet,
  resetBindingsToDefault,
  serialiseBindingSet,
  unbindAction,
} from './bindings';
export type {
  ActionId,
  BindActionResult,
  Binding,
  BindingConflict,
  BindingSet,
  BindingSource,
  DeviceProfileKind,
} from './bindings';

export {
  detectPadBrand,
  hashPadId,
  padHasAnyButtonPressed,
  playGamepadRumble,
  pollGamepads,
  applyRadialDeadzone,
  readGamepadAxisPair,
  readGamepadButtonPressed,
  readGamepadGripStrength,
  resolvePadBrand,
  supportsGamepadRumble,
  triggerGripStrength,
  watchForGamepadPress,
} from './gamepad';
export type { PadBrand, RumbleEffect } from './gamepad';

export {
  AIM_SMOOTH_RATE_RAD_S,
  aimVectorFromSmoother,
  createAimSmoother,
  createKeyboardState,
  isKeyboardActionPressed,
  resolveDigitalAimTarget,
  smoothDigitalAim,
} from './keyboard';
export type { AimSmoother, KeyboardState } from './keyboard';

export {
  MOUSE_AIM_DEAD_RADIUS_PX,
  MOUSE_AIM_FULL_DEFLECTION_PX,
  createMouseTracker,
  isMouseActionPressed,
  resolveMouseAim,
} from './mouse';
export type { MouseState, MouseTracker } from './mouse';

export {
  TOUCH_GRIP_BREAK_PX,
  TOUCH_STICK_DEAD_RADIUS_PX,
  TOUCH_STICK_FULL_DEFLECTION_PX,
  applyTiltToAim,
  armForTouchX,
  createTouchArmState,
  hasDraggedPastGripBreak,
  onTouchDown,
  onTouchMove,
  onTouchUp,
  resolveTouchArmFrame,
  resolveTouchFrame,
  resolveVirtualStick,
} from './touch';
export type {
  ActiveTouch,
  ArmSide,
  TouchArmFrame,
  TouchArmState,
  TouchFrame,
  TouchScheme,
  TouchStickOptions,
} from './touch';

export {
  DeviceSeatRegistry,
  gamepadDeviceIdentity,
  isWithinRejoinGrace,
  keyboardDeviceIdentity,
  nextFreeSeat,
  touchDeviceIdentity,
} from './devices';
export type { DeviceIdentity, DeviceJoinResult, DeviceKind } from './devices';

export { INPUT_TICK_SECONDS, createSeatInputState, lowPassAim, maxMagnitude, produceInputFrame } from './sources';
export type {
  DeviceSnapshot,
  GamepadSnapshot,
  KeyboardSnapshot,
  MouseSnapshot,
  ProduceFrameInput,
  ProduceFrameResult,
  SeatInputState,
} from './sources';

export {
  glyphForBinding,
  glyphForGamepadAction,
  glyphForGamepadCode,
  glyphForKeyboardCode,
  glyphForMouseCode,
  glyphForTouchCode,
} from './glyphs';
export type { ButtonGlyph, GamepadGlyphAction } from './glyphs';
