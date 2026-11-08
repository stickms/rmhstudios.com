import { describe, expect, it } from 'vitest';
import { parseMidiMessage } from './midi-parse';

describe('parseMidiMessage', () => {
  it('parses note-on with full velocity', () => {
    expect(parseMidiMessage([0x90, 60, 127], 1234)).toEqual({
      type: 'on',
      midi: 60,
      velocity: 1,
      time: 1234,
      source: 'midi',
    });
  });

  it('scales velocity to 0..1', () => {
    const e = parseMidiMessage([0x90, 60, 64], 0);
    expect(e?.velocity).toBeCloseTo(64 / 127, 10);
  });

  it('treats note-on with velocity 0 as note-off', () => {
    const e = parseMidiMessage([0x90, 60, 0], 5);
    expect(e?.type).toBe('off');
    expect(e?.midi).toBe(60);
    expect(e?.velocity).toBe(0);
  });

  it('parses note-off', () => {
    const e = parseMidiMessage([0x80, 60, 64], 5);
    expect(e?.type).toBe('off');
    expect(e?.midi).toBe(60);
    expect(e?.source).toBe('midi');
  });

  it('ignores the channel (accepts all 16)', () => {
    expect(parseMidiMessage([0x91, 61, 64], 0)).toMatchObject({ type: 'on', midi: 61 });
    expect(parseMidiMessage([0x9f, 62, 64], 0)).toMatchObject({ type: 'on', midi: 62 });
    expect(parseMidiMessage([0x8f, 62, 64], 0)).toMatchObject({ type: 'off', midi: 62 });
  });

  it('accepts typed arrays', () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 72, 100]), 0)).toMatchObject({
      type: 'on',
      midi: 72,
    });
  });

  it('returns null for non-note messages', () => {
    expect(parseMidiMessage([0xb0, 64, 127], 0)).toBeNull();
    expect(parseMidiMessage([0xe0, 0, 64], 0)).toBeNull();
  });

  it('returns null for realtime, sysex and empty input without throwing', () => {
    expect(parseMidiMessage([0xf8], 0)).toBeNull();
    expect(parseMidiMessage([0xf0, 0x7e, 0x7f, 0xf7], 0)).toBeNull();
    expect(parseMidiMessage([], 0)).toBeNull();
  });

  it('returns null for truncated note messages', () => {
    expect(parseMidiMessage([0x90], 0)).toBeNull();
    expect(parseMidiMessage([0x90, 60], 0)).toBeNull();
    expect(parseMidiMessage([0x80, 60], 0)).toBeNull();
  });
});
