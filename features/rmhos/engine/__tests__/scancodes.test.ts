import { describe, expect, it } from 'vitest';
import { MODIFIER_BREAK_CODES } from '../scancodes';

/** Splits the byte stream into key events: 0xE0 introduces a two-byte code. */
function events(bytes: readonly number[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b === 0xe0) out.push(`E0 ${bytes[++i]!.toString(16)}`);
    else out.push(b.toString(16));
  }
  return out;
}

describe('MODIFIER_BREAK_CODES', () => {
  it('releases left and right Ctrl, Alt, Shift and Meta', () => {
    expect(events(MODIFIER_BREAK_CODES).sort()).toEqual(
      ['9d', 'E0 9d', 'b8', 'E0 b8', 'aa', 'b6', 'E0 db', 'E0 dc'].sort(),
    );
  });
  it('sends only break codes (high bit set)', () => {
    for (const b of MODIFIER_BREAK_CODES) expect(b >= 0x80).toBe(true);
  });
});
