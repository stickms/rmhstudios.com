/**
 * The input layer: one `InputState` written by every device, read once per
 * tick by `buildUserCmd`.
 *
 *   const input = createInputState();
 *   const km = new KeyboardMouseInput({ target: canvasWrap, state: input, getSettings });
 *   const pad = new GamepadInput(input, 'tf2', getSettings);
 *   km.attach();
 *   // each frame:   pad.poll(dt); hud.handleImpulses(drainImpulses(input));
 *   // each tick:    const cmd = sender.createCommand(tick, (c) =>
 *   //                 Object.assign(c, buildUserCmd(input, viewAngles, settings, weapons)));
 *
 * The touch overlay (`components/tf2-game/touch/TouchOverlay`) writes the
 * same state through `setHeld(state, 'touch', …)`, `state.analog.touch` and
 * `state.lookYaw/lookPitch`.
 */

export * from './actions';
export * from './input-state';
export * from './gamepad';
export * from './touch';
export { KeyboardMouseInput, keyLabel, type KeyboardMouseOptions } from './keyboard-mouse';
