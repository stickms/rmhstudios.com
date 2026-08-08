/**
 * Bum's Rush — button glyphs & labels (§4.1).
 *
 * "A PlayStation player must never be told to press 'A'." Every prompt in the
 * game — tutorial sticky notes, the remap UI, the join card — routes through
 * here instead of hardcoding a glyph, keyed by the brand `gamepad.ts` detects
 * (or `GameSettings.padBrand` overrides).
 *
 * `label`/`labelKey`/`ns` travel together the same way `lib/shortcuts/
 * registry.ts`'s `Shortcut` does: the i18n contract requires a `defaultValue`
 * at the `t()` call site, and a lookup table like this one is exactly the
 * place that cannot invent one for a component it doesn't render — so the
 * English default travels WITH the key rather than living only in a
 * `locales/en/*.json` file the caller has to know to reach for. `glyph` is a
 * short iconographic symbol (a letter or a Unicode shape), not language, and
 * is never translated.
 */

import type { Binding } from './bindings';
import type { PadBrand } from './gamepad';

export interface ButtonGlyph {
  glyph: string;
  ns: string;
  labelKey: string;
  label: string;
}

const NS = 'c-bums-rush';

export type GamepadGlyphAction =
  | 'stickL'
  | 'stickR'
  | 'triggerL'
  | 'triggerR'
  | 'bumperL'
  | 'bumperR'
  | 'faceDown'
  | 'faceRight'
  | 'faceLeft'
  | 'faceUp'
  | 'start'
  | 'select'
  | 'dpadUp'
  | 'dpadDown'
  | 'dpadLeft'
  | 'dpadRight';

type GlyphTable = Record<GamepadGlyphAction, ButtonGlyph>;

function g(glyph: string, labelKey: string, label: string): ButtonGlyph {
  return { glyph, ns: NS, labelKey: `glyph.${labelKey}`, label };
}

// Column values straight out of §4.1's table.
const XBOX_GLYPHS: GlyphTable = {
  stickL: g('LS', 'stick-l', 'Left Stick'),
  stickR: g('RS', 'stick-r', 'Right Stick'),
  triggerL: g('LT', 'trigger-l', 'Left Trigger'),
  triggerR: g('RT', 'trigger-r', 'Right Trigger'),
  bumperL: g('LB', 'bumper-l', 'Left Bumper'),
  bumperR: g('RB', 'bumper-r', 'Right Bumper'),
  faceDown: g('A', 'face-down', 'A Button'),
  faceRight: g('B', 'face-right', 'B Button'),
  faceLeft: g('X', 'face-left', 'X Button'),
  faceUp: g('Y', 'face-up', 'Y Button'),
  start: g('Start', 'start', 'Start'),
  select: g('Select', 'select', 'Select'),
  dpadUp: g('D-Pad ▲', 'dpad-up', 'D-Pad Up'),
  dpadDown: g('D-Pad ▼', 'dpad-down', 'D-Pad Down'),
  dpadLeft: g('D-Pad ◀', 'dpad-left', 'D-Pad Left'),
  dpadRight: g('D-Pad ▶', 'dpad-right', 'D-Pad Right'),
};

const PLAYSTATION_GLYPHS: GlyphTable = {
  stickL: g('L3', 'stick-l', 'Left Stick'),
  stickR: g('R3', 'stick-r', 'Right Stick'),
  triggerL: g('L2', 'trigger-l', 'Left Trigger'),
  triggerR: g('R2', 'trigger-r', 'Right Trigger'),
  bumperL: g('L1', 'bumper-l', 'Left Bumper'),
  bumperR: g('R1', 'bumper-r', 'Right Bumper'),
  faceDown: g('✕', 'face-down', 'Cross'),
  faceRight: g('○', 'face-right', 'Circle'),
  faceLeft: g('□', 'face-left', 'Square'),
  faceUp: g('△', 'face-up', 'Triangle'),
  start: g('Options', 'start', 'Options'),
  select: g('Share', 'select', 'Share'),
  dpadUp: g('D-Pad ▲', 'dpad-up', 'D-Pad Up'),
  dpadDown: g('D-Pad ▼', 'dpad-down', 'D-Pad Down'),
  dpadLeft: g('D-Pad ◀', 'dpad-left', 'D-Pad Left'),
  dpadRight: g('D-Pad ▶', 'dpad-right', 'D-Pad Right'),
};

const NINTENDO_GLYPHS: GlyphTable = {
  stickL: g('L Stick', 'stick-l', 'Left Stick'),
  stickR: g('R Stick', 'stick-r', 'Right Stick'),
  triggerL: g('ZL', 'trigger-l', 'ZL'),
  triggerR: g('ZR', 'trigger-r', 'ZR'),
  bumperL: g('L', 'bumper-l', 'L Button'),
  bumperR: g('R', 'bumper-r', 'R Button'),
  faceDown: g('B', 'face-down', 'B Button'),
  faceRight: g('A', 'face-right', 'A Button'),
  faceLeft: g('Y', 'face-left', 'Y Button'),
  faceUp: g('X', 'face-up', 'X Button'),
  start: g('+', 'start', '+'),
  select: g('−', 'select', '−'),
  dpadUp: g('D-Pad ▲', 'dpad-up', 'D-Pad Up'),
  dpadDown: g('D-Pad ▼', 'dpad-down', 'D-Pad Down'),
  dpadLeft: g('D-Pad ◀', 'dpad-left', 'D-Pad Left'),
  dpadRight: g('D-Pad ▶', 'dpad-right', 'D-Pad Right'),
};

/** "else generic ABXY" (§4.1) — the same lowest-common-denominator shape as Xbox. */
const GENERIC_GLYPHS: GlyphTable = XBOX_GLYPHS;

const GLYPH_TABLES: Record<PadBrand, GlyphTable> = {
  xbox: XBOX_GLYPHS,
  playstation: PLAYSTATION_GLYPHS,
  nintendo: NINTENDO_GLYPHS,
  generic: GENERIC_GLYPHS,
};

export function glyphForGamepadAction(brand: PadBrand, action: GamepadGlyphAction): ButtonGlyph {
  return GLYPH_TABLES[brand][action];
}

/** Maps `gamepad.ts`'s `Binding.code` scheme onto a glyph action, for the remap UI showing whatever is CURRENTLY bound rather than only the defaults. */
const GAMEPAD_CODE_TO_ACTION: Record<string, GamepadGlyphAction> = {
  stick0: 'stickL',
  stick1: 'stickR',
  button4: 'bumperL',
  button5: 'bumperR',
  button6: 'triggerL',
  button7: 'triggerR',
  button0: 'faceDown',
  button1: 'faceRight',
  button2: 'faceLeft',
  button3: 'faceUp',
  button8: 'select',
  button9: 'start',
  button12: 'dpadUp',
  button13: 'dpadDown',
  button14: 'dpadLeft',
  button15: 'dpadRight',
};

export function glyphForGamepadCode(brand: PadBrand, code: string): ButtonGlyph | null {
  const action = GAMEPAD_CODE_TO_ACTION[code];
  return action ? glyphForGamepadAction(brand, action) : null;
}

// ─── Keyboard / mouse / touch — brand-independent, still remap-UI-ready ────

const KEYBOARD_CODE_OVERRIDES: Record<string, string> = {
  Space: 'Space',
  Escape: 'Esc',
  Tab: 'Tab',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  Slash: '/',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

function humaniseKeyboardCode(code: string): string {
  if (code in KEYBOARD_CODE_OVERRIDES) return KEYBOARD_CODE_OVERRIDES[code];
  if (code.startsWith('Key')) return code.slice('Key'.length);
  if (code.startsWith('Digit')) return code.slice('Digit'.length);
  return code;
}

export function glyphForKeyboardCode(code: string): ButtonGlyph {
  const text = humaniseKeyboardCode(code);
  return { glyph: text, ns: NS, labelKey: `glyph.key-${code}`, label: text };
}

const MOUSE_CODE_LABELS: Record<string, string> = {
  move: 'Mouse',
  button0: 'Left Click',
  button1: 'Right Click',
  button2: 'Middle Click',
};

export function glyphForMouseCode(code: string): ButtonGlyph {
  const label = MOUSE_CODE_LABELS[code] ?? 'Mouse';
  return { glyph: label, ns: NS, labelKey: `glyph.mouse-${code}`, label };
}

const TOUCH_CODE_LABELS: Record<string, string> = {
  'half-left': 'Left Half',
  'half-right': 'Right Half',
  'grab-left-button': 'Grab (Left)',
  'grab-right-button': 'Grab (Right)',
  'btn-emote': 'Emote Button',
  'btn-use': 'Use Button',
  'btn-drop': 'Drop Button',
  'btn-tags': 'Tags Button',
  'btn-pause': 'Pause Button',
  'btn-objectives': 'Objectives Button',
};

export function glyphForTouchCode(code: string): ButtonGlyph {
  const label = TOUCH_CODE_LABELS[code] ?? 'Touch';
  return { glyph: label, ns: NS, labelKey: `glyph.touch-${code}`, label };
}

/** One entry point for the remap UI: whatever `binding.source` is, produce a glyph — brand-aware only where brand applies (gamepad). */
export function glyphForBinding(binding: Binding, padBrand: PadBrand): ButtonGlyph {
  switch (binding.source) {
    case 'gamepad':
      return glyphForGamepadCode(padBrand, binding.code) ?? { glyph: binding.code, ns: NS, labelKey: `glyph.gamepad-${binding.code}`, label: binding.code };
    case 'keyboard':
      return glyphForKeyboardCode(binding.code);
    case 'mouse':
      return glyphForMouseCode(binding.code);
    case 'touch':
      return glyphForTouchCode(binding.code);
    default:
      return { glyph: binding.code, ns: NS, labelKey: `glyph.unknown-${binding.code}`, label: binding.code };
  }
}
