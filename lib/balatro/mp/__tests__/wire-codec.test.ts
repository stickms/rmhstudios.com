/**
 * wire-codec.ts (zod-free, generated descriptors) must give the same verdicts
 * as the zod contract it replaces in the MP chunk: wire.ts `validateEnvelope`,
 * events.ts `BALATRO_S2C`, types.ts `zRefCheckpoint`/`zResolvedRuleset`/
 * `zLobbyOptions` fields and shared/p2p `zIceServers`. Checked on every
 * contract fixture and on structural mutations of the valid ones.
 */
import { describe, expect, it } from 'vitest';
import * as codec from '../wire-codec';
import { LOCAL_ONLY_KINDS, PEER_KINDS, WIRE_D, WIRE_KINDS, WIRE_LIMITS, WIRE_META, WIRE_PROTOCOL, validateEnvelope } from '../wire';
import { BALATRO_S2C, type BalatroS2CEvent } from '../../net/events';
import { zLobbyOptions, zRefCheckpoint, zResolvedRuleset, LOBBY_OPTION_KEYS, type LobbyOptionKey } from '../types';
import { zIceServers } from '../../../shared/p2p/ice';
import { S2C, WIRE } from '../bridge-schema.gen';
import { loadFixture, type CaseMap } from '../__fixtures__/load';

const wire = loadFixture<{ kinds: CaseMap; envelopes: { valid: unknown[]; invalid: { why: string; d: unknown }[] } }>('wire.json');
const events = loadFixture<{ s2c: CaseMap }>('events.json');
const types = loadFixture<Record<string, { valid: unknown[]; invalid: { d: unknown }[] }>>('types.json');

function* mutations(v: unknown, depth = 0): Generator<unknown> {
  if (depth > 3) return;
  if (Array.isArray(v)) {
    yield [];
    yield [...v, ...v];
    if (v.length) for (const m of mutations(v[0], depth + 1)) yield [m, ...v.slice(1)];
    return;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    yield [o];
    yield { ...o, __extra: 1 };
    for (const k of Object.keys(o)) {
      const { [k]: _drop, ...rest } = o;
      yield rest;
      yield { ...o, [k]: null };
      yield { ...o, [k]: 'x'.repeat(600) };
      yield { ...o, [k]: -1.5 };
      yield { ...o, [k]: true };
      for (const m of mutations(o[k], depth + 1)) yield { ...o, [k]: m };
    }
  }
}

function sameEnvelope(raw: unknown) {
  const z = validateEnvelope(raw);
  const c = codec.validateEnvelope(raw);
  expect({ ok: c.ok, error: c.ok ? null : c.error }, JSON.stringify(raw).slice(0, 300)).toEqual({ ok: z.ok, error: z.ok ? null : z.error });
  if (z.ok && c.ok) expect(c.env).toEqual(z.env);
}

describe('wire-codec agrees with wire.ts', () => {
  it('carries the same constants', () => {
    expect(codec.WIRE_PROTOCOL).toBe(WIRE_PROTOCOL);
    expect(codec.WIRE_LIMITS).toEqual(WIRE_LIMITS);
    expect(codec.WIRE_META).toEqual(WIRE_META);
    expect([...codec.PEER_KINDS]).toEqual([...PEER_KINDS]);
    expect(Object.keys(WIRE).sort()).toEqual([...WIRE_KINDS].sort());
    for (const k of WIRE_KINDS) {
      expect(codec.isHostOnly(k)).toBe(WIRE_META[k].hostOnly);
      expect(codec.isLocalOnly(k)).toBe(LOCAL_ONLY_KINDS.has(k));
    }
  });

  for (const [k, cases] of Object.entries(wire.kinds)) {
    it(`${k}: fixtures and mutations`, () => {
      expect(Object.keys(WIRE_D)).toContain(k);
      for (const d of [...cases.valid, ...cases.invalid.map((c) => c.d)]) {
        sameEnvelope({ v: 1, k, s: 1, d });
        for (const m of mutations(d)) sameEnvelope({ v: 1, k, s: 1, d: m });
      }
    });
  }

  it('envelopes: fixtures and mutations', () => {
    for (const e of [...wire.envelopes.valid, ...wire.envelopes.invalid.map((c) => c.d)]) {
      sameEnvelope(e);
      for (const m of mutations(e, 2)) sameEnvelope(m);
    }
    expect(codec.decodeEnvelope('{nope').ok).toBe(false);
    expect(codec.decodeEnvelope('x'.repeat(WIRE_LIMITS.MAX_MESSAGE_BYTES + 1))).toEqual({ ok: false, error: 'too-large' });
  });
});

describe('wire-codec agrees with the hub S2C contract', () => {
  it('knows every S2C event', () => {
    expect([...Object.keys(S2C), 'balatro:p2p:relay'].sort()).toEqual(Object.keys(BALATRO_S2C).sort());
  });
  for (const [event, cases] of Object.entries(events.s2c)) {
    it(`${event}: fixtures and mutations`, () => {
      const schema = BALATRO_S2C[event as BalatroS2CEvent] as { safeParse(v: unknown): { success: boolean; data?: unknown } };
      for (const d of [...cases.valid, ...cases.invalid.map((c) => c.d)]) {
        for (const v of [d, ...mutations(d)]) {
          const z = schema.safeParse(v);
          const c = codec.parseS2C(event as BalatroS2CEvent, v);
          expect(c !== null, `${event} ${JSON.stringify(v).slice(0, 200)}`).toBe(z.success);
          if (z.success) expect(c).toEqual(z.data);
        }
      }
    });
  }
  it('relay frames are bytes under the packet cap', () => {
    expect(codec.parseS2C('balatro:p2p:relay', new Uint8Array([1, 2, 3]))).toEqual(new Uint8Array([1, 2, 3]));
    expect(codec.parseS2C('balatro:p2p:relay', new Uint8Array([1, 2]).buffer)).toEqual(new Uint8Array([1, 2]));
    expect(codec.parseS2C('balatro:p2p:relay', new Uint8Array(17_000))).toBeNull();
    expect(codec.parseS2C('balatro:p2p:relay', 'bytes')).toBeNull();
  });
});

describe('wire-codec agrees with the domain schemas', () => {
  const pairs: [string, { safeParse(v: unknown): { success: boolean; data?: unknown } }, (v: unknown) => unknown][] = [
    ['checkpoint', zRefCheckpoint, codec.parseRefCheckpoint],
    ['resolvedRuleset', zResolvedRuleset, (v) => {
      try {
        return codec.requireResolvedRuleset(v);
      } catch {
        return null;
      }
    }],
  ];
  for (const [name, schema, parse] of pairs) {
    it(`${name}: fixtures and mutations`, () => {
      const set = types[name];
      expect(set, name).toBeDefined();
      for (const d of [...set.valid, ...set.invalid.map((c) => c.d)]) {
        for (const v of [d, ...mutations(d, 1)]) {
          const z = schema.safeParse(v);
          const c = parse(v);
          expect(c !== null, `${name} ${JSON.stringify(v).slice(0, 200)}`).toBe(z.success);
          if (z.success) expect(c).toEqual(z.data);
        }
      }
    });
  }

  it('lobby options field by field', () => {
    expect(codec.LOBBY_OPTION_KEYS).toEqual(LOBBY_OPTION_KEYS);
    const probes: unknown[] = [true, false, 0, 1, 7, 16, 999, -1, 1.5, 'random', 'ABC123', 'abc', 'ruleset_mp_balanced', [], ['pvp_timer'], null, 120_000];
    for (const key of LOBBY_OPTION_KEYS) {
      for (const v of probes) {
        const z = zLobbyOptions.shape[key as LobbyOptionKey].safeParse(v);
        const c = codec.checkLobbyOption(key, v);
        expect(c.ok, `${key}=${JSON.stringify(v)}`).toBe(z.success);
        if (z.success && c.ok) expect(c.v).toEqual(z.data);
      }
    }
  });

  it('ICE servers', () => {
    const probes: unknown[] = [
      [],
      [{ urls: 'stun:stun.example.com:3478' }],
      [{ urls: ['turn:t.example.com:3478?transport=udp'], username: 'u', credential: 'c' }],
      [{ urls: 'http://nope' }],
      [{ urls: [] }],
      Array.from({ length: 9 }, () => ({ urls: 'stun:a' })),
      [{ urls: 'stun:a', username: 'x'.repeat(300) }],
      'stun:a',
      null,
    ];
    for (const v of probes) {
      const z = zIceServers.safeParse(v);
      const c = codec.parseIceServers(v);
      expect(c !== null, JSON.stringify(v)).toBe(z.success);
      if (z.success) expect(c).toEqual(z.data);
    }
    expect(codec.resolveHubIce(undefined)[0]?.urls).toContain('stun:stun.l.google.com:19302');
    expect(codec.resolveHubIce([])[0]?.urls).toContain('stun:stun.l.google.com:19302');
    expect(codec.resolveHubIce([{ urls: 'stun:x.example' }])).toEqual([{ urls: 'stun:x.example' }]);
  });
});
