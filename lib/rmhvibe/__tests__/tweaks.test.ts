import { describe, expect, it } from 'vitest';
import { parseTweakSpec, validateTweakValues, type TweakSpec } from '../tweaks';

const color = (i: number) => ({ key: `c${i}`, label: `Colour ${i}`, type: 'color', default: '#112233' });

describe('parseTweakSpec', () => {
  it('keeps at most 8 valid entries', () => {
    const spec = parseTweakSpec(Array.from({ length: 10 }, (_, i) => color(i)));
    expect(spec).toHaveLength(8);
    expect(spec[7]?.key).toBe('c7');
  });

  it('drops a colour whose default is not #rrggbb', () => {
    expect(parseTweakSpec([{ ...color(1), default: 'red' }, color(2)]).map((s) => s.key)).toEqual(['c2']);
  });

  it('clamps a range default into [min, max] and needs min < max', () => {
    const spec = parseTweakSpec([
      { key: 'size', label: 'Size', type: 'range', min: 1, max: 10, default: 99 },
      { key: 'bad', label: 'Bad', type: 'range', min: 5, max: 5, default: 5 },
    ]);
    expect(spec).toHaveLength(1);
    expect(spec[0]?.default).toBe(10);
  });

  it('drops a select whose default is not in its options, and non-arrays', () => {
    expect(
      parseTweakSpec([{ key: 's', label: 'S', type: 'select', options: ['a', 'b'], default: 'c' }]),
    ).toEqual([]);
    expect(parseTweakSpec('nope')).toEqual([]);
  });
});

describe('validateTweakValues', () => {
  const spec: TweakSpec[] = [
    { key: 'size', label: 'Size', type: 'range', min: 1, max: 10, default: 5 },
    { key: 'mode', label: 'Mode', type: 'select', options: ['a', 'b'], default: 'a' },
    { key: 'bg', label: 'Background', type: 'color', default: '#000000' },
  ];

  it('drops unknown keys and options outside the list, and clamps ranges', () => {
    expect(
      validateTweakValues(spec, { size: 50, mode: 'zzz', bg: '#abcdef', extra: 1, __proto__: 1 }),
    ).toEqual({ size: 10, bg: '#abcdef' });
  });
});
