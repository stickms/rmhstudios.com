import { describe, expect, it } from 'vitest';
import { entropyBits, inspectId, nanoid, ulid, uuidV4, uuidV7 } from '@/lib/toolbox/ids';

const zeros = (n: number) => new Uint8Array(n);
const ones = (n: number) => new Uint8Array(n).fill(0xff);

describe('UUIDs', () => {
  it('sets the version and variant bits', () => {
    expect(uuidV4(zeros)).toBe('00000000-0000-4000-8000-000000000000');
    expect(uuidV4(ones)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(uuidV4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('puts the time first in v7, so v7 IDs sort by time', () => {
    const t = Date.UTC(2026, 10, 20, 12, 0, 0);
    const id = uuidV7(t, zeros);
    expect(id).toBe('01a1f8d3-ea00-7000-8000-000000000000');
    expect(uuidV7(t + 1) > uuidV7(t)).toBe(true);
    const info = inspectId(id);
    expect(info).toEqual({ kind: 'uuid', version: 7, variant: 'rfc', time: new Date(t) });
  });
});

describe('ULID', () => {
  it('encodes the time in ten Crockford characters and 80 random bits in sixteen', () => {
    expect(ulid(0, zeros)).toBe('00000000000000000000000000');
    expect(ulid(1469918176385, ones)).toBe('01ARYZ6S41ZZZZZZZZZZZZZZZZ');
    const info = inspectId('01aryz6s41zzzzzzzzzzzzzzzz');
    expect(info).toEqual({ kind: 'ulid', time: new Date(1469918176385) });
  });
});

describe('nanoid', () => {
  it('has the requested size and alphabet', () => {
    expect(nanoid()).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(nanoid(8, 'ab')).toMatch(/^[ab]{8}$/);
    expect(() => nanoid(5, 'a')).toThrow(RangeError);
  });

  it('rejects bytes outside the alphabet rather than wrapping them', () => {
    // Alphabet of 3: mask 3, so byte value 3 must be skipped, never mapped.
    let calls = 0;
    const source = (n: number) => {
      calls++;
      return new Uint8Array(n).fill(calls === 1 ? 3 : 1);
    };
    expect(nanoid(4, 'xyz', source)).toBe('yyyy');
  });
});

describe('inspectId', () => {
  it('reads v1 timestamps, nil and max UUIDs, and rejects junk', () => {
    // RFC 9562 appendix A.1 example.
    expect(inspectId('C232AB00-9414-11EC-B3C8-9F6BDECED846')).toEqual({
      kind: 'uuid',
      version: 1,
      variant: 'rfc',
      time: new Date('2022-02-22T19:22:22.000Z'),
    });
    expect(inspectId('00000000-0000-0000-0000-000000000000')).toMatchObject({ nil: true });
    expect(inspectId('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF')).toMatchObject({ max: true });
    expect(inspectId('{f81d4fae-7dec-41d0-a765-00a0c91e6bf6}')).toEqual({ kind: 'uuid', version: 4, variant: 'rfc' });
    expect(inspectId('hello')).toEqual({ kind: 'unknown' });
  });
});

describe('entropyBits', () => {
  it('reports the randomness of each kind', () => {
    expect(entropyBits('uuid-v4')).toBe(122);
    expect(entropyBits('nanoid')).toBe(126);
    expect(entropyBits('nanoid', 10, 16)).toBe(40);
  });
});
