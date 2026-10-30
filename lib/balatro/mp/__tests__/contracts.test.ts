/**
 * Interface conformance for the frozen contracts (PLAN §3, WS0 task 6).
 *
 * Every schema accepts its valid fixtures and survives a JSON round trip
 * unchanged, rejects its invalid fixtures, and every event / kind / message
 * type has at least one valid fixture — so a contract change without a
 * fixture change fails here. The Lua side runs the same bridge fixtures
 * through protocol.lua (lib/balatro/lua/spec/protocol_spec.lua).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  BALATRO_C2S,
  BALATRO_C2S_EVENTS,
  BALATRO_EVENTS,
  BALATRO_S2C,
  BALATRO_S2C_EVENTS,
} from '../../net/events';
import { BALATRO_LIMITS, BALATRO_RELAY_LIMITS, MP_PROTOCOL_VERSION } from '../../net/limits';
import {
  zRefCheckpoint,
  zGameEvent,
  zHandResult,
  zLobbyOptions,
  zLobbyState,
  zPlayerResult,
  zRefInput,
  zRefMsg,
  zReplayEvent,
  zResolvedRuleset,
  zSafeCard,
  zSetupView,
  zStartedMatch,
} from '../types';
import {
  WIRE_D,
  WIRE_KINDS,
  WIRE_META,
  PEER_KINDS,
  LOCAL_ONLY_KINDS,
  decodeEnvelope,
  encodeEnvelope,
  isHostOnly,
  makeEnvelope,
  validateEnvelope,
  type WireKind,
} from '../wire';
import {
  J2L,
  J2L_TYPES,
  L2J,
  L2J_TYPES,
  BRIDGE_LIMITS,
  encodeJsLine,
  parseBridgeMessage,
  parseLuaBatch,
  type J2LType,
} from '../bridge-protocol';
import { loadFixture, type CaseMap } from '../__fixtures__/load';

const ROOT = join(import.meta.dirname, '../../../..');

function roundTrips(schema: z.ZodType, value: unknown): void {
  const first = schema.safeParse(value);
  expect(first.success, first.success ? '' : JSON.stringify(first.error.issues[0])).toBe(true);
  if (!first.success) return;
  const again = schema.safeParse(JSON.parse(JSON.stringify(first.data)));
  expect(again.success).toBe(true);
  if (again.success) expect(again.data).toEqual(first.data);
}

function runCases(
  label: string,
  schemas: Record<string, z.ZodType>,
  cases: CaseMap,
  skip: string[] = [],
): void {
  describe(label, () => {
    it('has a valid fixture for every entry, and no fixture without an entry', () => {
      const names = Object.keys(schemas)
        .filter((n) => !skip.includes(n))
        .sort();
      const missing = names.filter((n) => !(cases[n]?.valid.length > 0));
      expect(missing, 'add a valid fixture for each').toEqual([]);
      const orphan = Object.keys(cases).filter((n) => !(n in schemas));
      expect(orphan).toEqual([]);
    });
    for (const [name, set] of Object.entries(cases)) {
      it(`${name}: accepts and round-trips its valid fixtures`, () => {
        for (const v of set.valid) roundTrips(schemas[name], v);
      });
      if (set.invalid.length > 0) {
        it(`${name}: rejects its invalid fixtures`, () => {
          for (const bad of set.invalid) {
            expect(schemas[name].safeParse(bad.d).success, `${name}: ${bad.why}`).toBe(false);
          }
        });
      }
    }
  });
}

/* ─── §3.a ───────────────────────────────────────────────────────────────── */

describe('§3.a signalling contract', () => {
  const fx = loadFixture<{ c2s: CaseMap; s2c: CaseMap }>('events.json');
  runCases('C2S', BALATRO_C2S, fx.c2s, ['balatro:p2p:relay']);
  runCases('S2C', BALATRO_S2C, fx.s2c, ['balatro:p2p:relay']);

  it('limits match the PLAN numbers', () => {
    expect(MP_PROTOCOL_VERSION).toBe(1);
    expect(BALATRO_LIMITS.MAX_PLAYERS).toBe(16);
    expect(BALATRO_LIMITS.CODE_RE.test('ABC234')).toBe(true);
    expect(BALATRO_LIMITS.CODE_RE.test('ABCDE0')).toBe(false);
    expect(BALATRO_RELAY_LIMITS.MAX_PACKET_BYTES).toBe(16 * 1024 + 64);
  });

  it('relay frames are bytes, capped at MAX_PACKET_BYTES', () => {
    const c2s = BALATRO_C2S['balatro:p2p:relay'];
    expect(c2s.safeParse(new Uint8Array(10)).success).toBe(true);
    expect(c2s.safeParse(new Uint8Array(BALATRO_RELAY_LIMITS.MAX_PACKET_BYTES + 1)).success).toBe(
      false,
    );
    expect(c2s.safeParse('bytes').success).toBe(false);
    const s2c = BALATRO_S2C['balatro:p2p:relay'];
    const fromBuffer = s2c.safeParse(new Uint8Array([1, 2, 3]).buffer);
    expect(fromBuffer.success).toBe(true);
    if (fromBuffer.success) expect(fromBuffer.data).toBeInstanceOf(Uint8Array);
  });

  it('the derived maps cover every event exactly once', () => {
    const all = new Set([...Object.keys(BALATRO_C2S), ...Object.keys(BALATRO_S2C)]);
    expect(Object.keys(BALATRO_EVENTS).sort()).toEqual([...all].sort());
    for (const name of Object.keys(BALATRO_C2S)) {
      expect((BALATRO_EVENTS as Record<string, { c2s?: unknown }>)[name].c2s).toBe(
        BALATRO_C2S[name as keyof typeof BALATRO_C2S],
      );
    }
    expect(Object.entries(BALATRO_C2S_EVENTS).every(([k, v]) => k === v)).toBe(true);
    expect(Object.keys(BALATRO_C2S_EVENTS).sort()).toEqual(Object.keys(BALATRO_C2S).sort());
    expect(Object.keys(BALATRO_S2C_EVENTS).sort()).toEqual(Object.keys(BALATRO_S2C).sort());
  });

  it('defaults role to player on join', () => {
    const parsed = BALATRO_C2S['balatro:p2p:join'].parse({
      code: 'ABC234',
      contentHash: '0123456789abcdef01234567-v1',
    });
    expect(parsed.role).toBe('player');
  });
});

/* ─── §3.f / domain types ────────────────────────────────────────────────── */

describe('§3.f domain types', () => {
  const fx = loadFixture<CaseMap>('types.json');
  const { objects: _objects, ...cases } = fx as CaseMap & { objects: unknown };
  void _objects;
  runCases(
    'types',
    {
      gameEvent: zGameEvent,
      refMsg: zRefMsg,
      refInput: zRefInput,
      startedMatch: zStartedMatch,
      lobbyState: zLobbyState,
      lobbyOptions: zLobbyOptions,
      resolvedRuleset: zResolvedRuleset,
      checkpoint: zRefCheckpoint,
      setupView: zSetupView,
      safeCard: zSafeCard,
      replayEvent: zReplayEvent,
      handResult: zHandResult,
      playerResult: zPlayerResult,
    },
    cases,
  );

  it('covers every GameEvent and RefMsg variant', () => {
    const variants = (schema: { options: readonly { shape: { t: { value: string } } }[] }) =>
      schema.options.map((o) => o.shape.t.value).sort();
    const seen = (set: { valid: unknown[] }) =>
      [...new Set(set.valid.map((v) => (v as { t: string }).t))].sort();
    expect(seen(cases.gameEvent)).toEqual(variants(zGameEvent as never));
    expect(seen(cases.refMsg)).toEqual(variants(zRefMsg as never));
    expect(seen(cases.refInput)).toEqual(variants(zRefInput as never));
  });
});

/* ─── §3.b ───────────────────────────────────────────────────────────────── */

describe('§3.b wire catalogue', () => {
  const fx = loadFixture<{
    kinds: CaseMap;
    envelopes: { valid: unknown[]; invalid: { why: string; d: unknown }[] };
  }>('wire.json');
  runCases('kinds', WIRE_D, fx.kinds);

  it('every kind has direction metadata, and the host-only set is the PLAN set', () => {
    expect(Object.keys(WIRE_META).sort()).toEqual([...WIRE_KINDS].sort());
    const hostOnly = WIRE_KINDS.filter(isHostOnly).sort();
    expect(hostOnly).toEqual(
      [
        'checkpoint',
        'host_changed',
        'lobby',
        'outcome',
        'presence',
        'reseed',
        'setup',
        'start_game',
        'welcome',
      ].sort(),
    );
    expect([...LOCAL_ONLY_KINDS]).toEqual(['kick']);
    for (const k of PEER_KINDS) expect(isHostOnly(k)).toBe(false);
  });

  it('encode → decode round-trips every valid kind fixture', () => {
    let seq = 0;
    for (const [kind, set] of Object.entries(fx.kinds)) {
      for (const d of set.valid) {
        const env = makeEnvelope(kind as WireKind, seq++, d as never, { to: '*' });
        const back = decodeEnvelope(encodeEnvelope(env));
        expect(back.ok, `${kind}`).toBe(true);
        if (back.ok) expect(back.env).toEqual(env);
      }
    }
  });

  it('accepts valid envelopes and rejects invalid ones', () => {
    for (const env of fx.envelopes.valid) expect(validateEnvelope(env).ok).toBe(true);
    for (const bad of fx.envelopes.invalid) expect(validateEnvelope(bad.d).ok, bad.why).toBe(false);
    expect(decodeEnvelope('{not json').ok).toBe(false);
  });
});

/* ─── §3.c ───────────────────────────────────────────────────────────────── */

describe('§3.c bridge protocol', () => {
  const fx = loadFixture<{ l2j: CaseMap; j2l: CaseMap }>('bridge.json');

  for (const [dir, schemas, cases] of [
    ['l2j', L2J, fx.l2j],
    ['j2l', J2L, fx.j2l],
  ] as const) {
    describe(dir, () => {
      it('has a valid fixture for every type, and no fixture without a type', () => {
        const missing = Object.keys(schemas).filter((t) => !(cases[t]?.valid.length > 0));
        expect(missing).toEqual([]);
        expect(Object.keys(cases).filter((t) => !(t in schemas))).toEqual([]);
      });
      it('accepts valid and rejects invalid fixtures (through parseBridgeMessage)', () => {
        for (const [t, set] of Object.entries(cases)) {
          set.valid.forEach((d, i) => {
            const r = parseBridgeMessage(dir as 'l2j', { s: i, t, d });
            expect(r.ok, `${t} valid #${i}: ${r.ok ? '' : `${r.error} ${r.detail ?? ''}`}`).toBe(
              true,
            );
          });
          for (const bad of set.invalid) {
            expect(
              parseBridgeMessage(dir as 'l2j', { s: 1, t, d: bad.d }).ok,
              `${t}: ${bad.why}`,
            ).toBe(false);
          }
        }
      });
    });
  }

  it('type lists match the schema maps', () => {
    expect([...L2J_TYPES].sort()).toEqual(Object.keys(L2J).sort());
    expect([...J2L_TYPES].sort()).toEqual(Object.keys(J2L).sort());
  });

  it('parses a Lua batch: header, messages in order, malformed lines dropped', () => {
    const lines = [JSON.stringify({ h: 1, ack: 7, fr: 120 })];
    let s = 1;
    const expected: string[] = [];
    for (const [t, set] of Object.entries(fx.l2j)) {
      lines.push(JSON.stringify({ s: s++, t, d: set.valid[0] }));
      expected.push(t);
    }
    lines.push(
      '{oops',
      JSON.stringify({ s: s++, t: 'no_such_type', d: {} }),
      JSON.stringify({ s, t: 'ui_ready', d: { ready: 1 } }),
    );
    const batch = parseLuaBatch(lines.join('\n') + '\n');
    expect(batch.header).toEqual({ h: 1, ack: 7, fr: 120 });
    expect(batch.messages.map((m) => m.t)).toEqual(expected);
    expect(batch.messages.map((m) => m.s)).toEqual(expected.map((_, i) => i + 1));
    expect(batch.dropped.map((d) => d.error)).toEqual(['json', 'unknown-type', 'data']);
  });

  it('rejects oversized lines and batches', () => {
    const big = JSON.stringify({
      s: 1,
      t: 'mp_log',
      d: { level: 'info', msg: 'x'.repeat(BRIDGE_LIMITS.LINE_MAX_BYTES) },
    });
    expect(parseLuaBatch(big).dropped[0]?.error).toBe('too-large');
    expect(parseLuaBatch('x'.repeat(BRIDGE_LIMITS.BATCH_MAX_BYTES + 1)).dropped[0]?.error).toBe(
      'too-large',
    );
  });

  it('encodes JS→Lua lines that parse back identically', () => {
    let s = 0;
    for (const [t, set] of Object.entries(fx.j2l)) {
      for (const d of set.valid) {
        const line = encodeJsLine(s, t as J2LType, d as never);
        const back = parseBridgeMessage('j2l', JSON.parse(line));
        expect(back.ok, t).toBe(true);
        if (back.ok) expect(back.msg).toEqual({ s, t, d: J2L[t as J2LType].parse(d) });
        s += 1;
      }
    }
  });
});

/* ─── Bundling rule ──────────────────────────────────────────────────────── */

describe('contract files stay bundle-safe', () => {
  const FILES = [
    'lib/balatro/net/limits.ts',
    'lib/balatro/net/events.ts',
    'lib/balatro/mp/types.ts',
    'lib/balatro/mp/wire.ts',
    'lib/balatro/mp/bridge-protocol.ts',
  ];
  it.each(FILES)(
    '%s imports only zod and relative modules (no @/, no node:, no browser globals)',
    (file) => {
      const src = readFileSync(join(ROOT, file), 'utf8');
      const specifiers = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const spec of specifiers)
        expect(spec === 'zod' || spec.startsWith('./') || spec.startsWith('../'), spec).toBe(true);
      expect(src).not.toMatch(/\b(window|document|localStorage|navigator)\./);
    },
  );
});
