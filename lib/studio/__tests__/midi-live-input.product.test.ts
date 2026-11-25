import { describe, expect, it } from 'vitest';
import { parseMidiMessages } from '@/lib/studio/midi/live-input';

describe('parseMidiMessages', () => {
  it('reads a note-on', () => {
    expect(parseMidiMessages([0x90, 60, 100])).toEqual([{ kind: 'on', pitch: 60, velocity: 100, channel: 0 }]);
  });
  it('reads a note-off', () => {
    expect(parseMidiMessages([0x80, 60, 64])).toEqual([{ kind: 'off', pitch: 60, velocity: 64, channel: 0 }]);
  });
  it('reads note-on with velocity 0 as a note-off', () => {
    expect(parseMidiMessages([0x90, 60, 0])[0]).toMatchObject({ kind: 'off', pitch: 60 });
  });
  it('follows running status', () => {
    const running = { status: 0 };
    expect(parseMidiMessages([0x90, 60, 100, 62, 90, 60, 0], running).map((e) => [e.kind, e.pitch])).toEqual([
      ['on', 60],
      ['on', 62],
      ['off', 60],
    ]);
    // The status carries into the next message too.
    expect(parseMidiMessages([64, 80], running)[0]).toMatchObject({ kind: 'on', pitch: 64 });
  });
  it('keeps notes from every channel', () => {
    expect(parseMidiMessages([0x93, 40, 50, 0x8f, 41, 0]).map((e) => e.channel)).toEqual([3, 15]);
  });
  it('ignores other channel messages and does not mistake their data for notes', () => {
    expect(parseMidiMessages([0xb0, 7, 100, 0xc0, 5, 0xe0, 0, 64, 0x90, 60, 100])).toHaveLength(1);
  });
  it('ignores system messages and real-time bytes', () => {
    expect(parseMidiMessages([0xf8, 0xfe, 0xf0, 1, 2, 3, 0xf7, 0x90, 60, 100, 0xf8])).toEqual([
      { kind: 'on', pitch: 60, velocity: 100, channel: 0 },
    ]);
  });
  it('real-time bytes in the middle of running status do not break it', () => {
    const running = { status: 0 };
    parseMidiMessages([0x90, 60, 100], running);
    expect(parseMidiMessages([0xf8, 62, 80], running)[0]).toMatchObject({ kind: 'on', pitch: 62 });
  });
  it('drops stray data bytes with no status, and a truncated message', () => {
    expect(parseMidiMessages([60, 100])).toEqual([]);
    expect(parseMidiMessages([0x90, 60])).toEqual([]);
  });
});
