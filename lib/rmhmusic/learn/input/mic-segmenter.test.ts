import { describe, expect, it } from 'vitest';
import { createSegmenter } from './mic-segmenter';

const f = (midi: number) => ({ midi, cents: 0 });

describe('createSegmenter', () => {
  it('emits on after 3 consecutive frames of the same note, not before', () => {
    const s = createSegmenter();
    expect(s.push(f(60), 0)).toEqual([]);
    expect(s.push(f(60), 1)).toEqual([]);
    expect(s.push(f(60), 2)).toEqual([
      { type: 'on', midi: 60, velocity: 0.8, time: 2, source: 'mic', cents: 0 },
    ]);
    // Staying on the note emits nothing further.
    expect(s.push(f(60), 3)).toEqual([]);
  });

  it('emits one off after 4 consecutive null frames', () => {
    const s = createSegmenter();
    for (let i = 0; i < 3; i++) s.push(f(60), i);
    expect(s.push(null, 3)).toEqual([]);
    expect(s.push(null, 4)).toEqual([]);
    expect(s.push(null, 5)).toEqual([]);
    expect(s.push(null, 6)).toEqual([
      { type: 'off', midi: 60, velocity: 0.8, time: 6, source: 'mic' },
    ]);
    expect(s.push(null, 7)).toEqual([]);
  });

  it('replaces the active note only after the new one is stable for 3 frames', () => {
    const s = createSegmenter();
    for (let i = 0; i < 3; i++) s.push(f(60), i);
    expect(s.push(f(62), 3)).toEqual([]);
    expect(s.push(f(62), 4)).toEqual([]);
    const out = s.push(f(62), 5);
    expect(out.map((e) => [e.type, e.midi])).toEqual([
      ['off', 60],
      ['on', 62],
    ]);
  });

  it('ignores a single stray frame of another note', () => {
    const s = createSegmenter();
    for (let i = 0; i < 3; i++) s.push(f(60), i);
    expect(s.push(f(61), 3)).toEqual([]);
    expect(s.push(f(60), 4)).toEqual([]);
    expect(s.push(f(60), 5)).toEqual([]);
    expect(s.push(f(60), 6)).toEqual([]);
  });

  it('a stray frame does not defeat the release counter for the active note', () => {
    const s = createSegmenter();
    for (let i = 0; i < 3; i++) s.push(f(60), i);
    // A null run interrupted by the active note starts over.
    s.push(null, 3);
    s.push(null, 4);
    s.push(f(60), 5);
    expect(s.push(null, 6)).toEqual([]);
    expect(s.push(null, 7)).toEqual([]);
    expect(s.push(null, 8)).toEqual([]);
    expect(s.push(null, 9)).toHaveLength(1);
  });
});

describe('createSegmenter flush', () => {
  it('releases the sounding note once, and nothing when silent', () => {
    const s = createSegmenter();
    expect(s.flush(0)).toEqual([]);
    for (let i = 0; i < 3; i++) s.push(f(60), i);
    expect(s.flush(9).map((e) => [e.type, e.midi, e.time])).toEqual([['off', 60, 9]]);
    expect(s.flush(10)).toEqual([]);
  });
});
