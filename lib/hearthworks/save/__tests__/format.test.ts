import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld } from '../../world';
import { SaveFormatError, SAVE_VERSION, decodeWorld, encodeWorld } from '..';

function sample() {
  const w = createWorld(9, 16);
  stepWorld(w, 0, [
    { type: 'join', playerId: 'a' },
    { type: 'place', playerId: 'a', kind: 'plot', x: 8, z: 8 },
    { type: 'plant', playerId: 'a', crop: 'corn', x: 8, z: 8 },
  ]);
  stepWorld(w, 1234);
  return w;
}

describe('world save format', () => {
  it('round-trips a world exactly', () => {
    const w = sample();
    expect(decodeWorld(encodeWorld(w))).toEqual(w);
  });

  it('refuses garbage, truncation, a future version and bad bodies with a typed error', () => {
    const good = encodeWorld(sample());
    expect(() => decodeWorld(new Uint8Array([1, 2, 3]))).toThrow(SaveFormatError);
    expect(() => decodeWorld(good.subarray(0, 12))).toThrow(SaveFormatError);
    const future = good.slice();
    future[4] = SAVE_VERSION + 1;
    expect(() => decodeWorld(future)).toThrow(/version/);
    const corrupt = good.slice();
    corrupt[10] = 0x00;
    expect(() => decodeWorld(corrupt)).toThrow(SaveFormatError);
  });

  it('refuses a structurally valid world that lies (terrain length, negative money, unknown ids)', () => {
    const lie = (mutate: (w: Record<string, unknown>) => void) => {
      const w = JSON.parse(JSON.stringify(sample()));
      mutate(w);
      const body = new TextEncoder().encode(JSON.stringify(w));
      const bytes = new Uint8Array(5 + body.length);
      bytes.set([0x48, 0x57, 0x4c, 0x44, SAVE_VERSION]);
      bytes.set(body, 5);
      return bytes;
    };
    expect(() => decodeWorld(lie((w) => ((w.terrain as unknown[]).length = 3)))).toThrow(SaveFormatError);
    expect(() =>
      decodeWorld(lie((w) => ((w.players as Record<string, { money: number }>).a.money = -1))),
    ).toThrow(SaveFormatError);
    expect(() =>
      decodeWorld(lie((w) => ((w.buildings as { kind: string }[])[0].kind = 'nuke'))),
    ).toThrow(SaveFormatError);
  });
});
