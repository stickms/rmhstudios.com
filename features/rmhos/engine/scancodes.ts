/**
 * Set-1 break (key-up) codes for every modifier. Sent when focus leaves the screen, so a chord
 * that was half pressed does not leave a key held down in the guest. The extended keys (right
 * Ctrl, right Alt/AltGr, both Meta keys) are two bytes: 0xE0 then the code.
 */
export const MODIFIER_BREAK_CODES: readonly number[] = [
  0x9d, // left Ctrl
  0xe0, 0x9d, // right Ctrl
  0xb8, // left Alt
  0xe0, 0xb8, // right Alt / AltGr
  0xaa, // left Shift
  0xb6, // right Shift
  0xe0, 0xdb, // left Meta
  0xe0, 0xdc, // right Meta
];
