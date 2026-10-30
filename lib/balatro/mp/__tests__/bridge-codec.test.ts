/**
 * bridge-codec.ts (zod-free, generated descriptors) must give the same verdicts
 * as bridge-protocol.ts (zod) — it is what the browser actually runs. Checked on
 * every contract fixture, on structural mutations of the valid ones, and on the
 * mailbox's NDJSON cases.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as codec from '../bridge-codec';
import * as zodProto from '../bridge-protocol';
import { SCHEMA } from '../bridge-schema.gen';
import { loadFixture, type CaseMap } from '../__fixtures__/load';

const bridge = loadFixture<Record<'l2j' | 'j2l', CaseMap>>('bridge.json');
const mailbox = JSON.parse(
  readFileSync(join(import.meta.dirname, '../__fixtures__/mailbox.json'), 'utf8'),
) as { l2j: { name: string; text: string }[] };

type Dir = 'l2j' | 'j2l';

function verdicts(dir: Dir, t: string, d: unknown) {
  const raw = { s: 1, t, d };
  const z = dir === 'l2j' ? zodProto.parseBridgeMessage('l2j', raw) : zodProto.parseBridgeMessage('j2l', raw);
  const c = dir === 'l2j' ? codec.parseBridgeMessage('l2j', raw) : codec.parseBridgeMessage('j2l', raw);
  return { z, c };
}

function expectSame(dir: Dir, t: string, d: unknown) {
  const { z, c } = verdicts(dir, t, d);
  expect({ ok: c.ok, error: c.ok ? null : c.error }, `${dir} ${t} ${JSON.stringify(d)}`).toEqual({
    ok: z.ok,
    error: z.ok ? null : z.error,
  });
  if (z.ok && c.ok) expect(c.msg).toEqual(z.msg);
}

/** Small structural mutations of a valid payload: drop, null, retype each field (depth ≤ 3). */
function* mutations(v: unknown, depth = 0): Generator<unknown> {
  if (depth > 3) return;
  if (Array.isArray(v)) {
    yield [];
    yield [...v, ...v];
    if (v.length) {
      for (const m of mutations(v[0], depth + 1)) yield [m, ...v.slice(1)];
    }
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

describe('bridge-codec agrees with the zod contract', () => {
  for (const dir of ['l2j', 'j2l'] as const) {
    describe(dir, () => {
      it('covers exactly the contract types', () => {
        const types = Object.keys(dir === 'l2j' ? zodProto.L2J : zodProto.J2L).sort();
        expect(Object.keys(SCHEMA[dir]).sort()).toEqual(types);
        expect(codec.parseBridgeMessage(dir as 'l2j', { s: 1, t: 'no_such_type', d: {} })).toMatchObject({
          ok: false,
          error: 'unknown-type',
        });
      });
      for (const [t, cases] of Object.entries(bridge[dir])) {
        it(`${t}: fixtures and mutations`, () => {
          for (const d of cases.valid) {
            expect(verdicts(dir, t, d).c.ok, `valid ${JSON.stringify(d)}`).toBe(true);
            expectSame(dir, t, d);
            for (const m of mutations(d)) expectSame(dir, t, m);
          }
          for (const bad of cases.invalid) {
            expect(verdicts(dir, t, bad.d).c.ok, bad.why).toBe(false);
            expectSame(dir, t, bad.d);
          }
        });
      }
    });
  }

  it('framing: header, empty-array d, bad lines and limits', () => {
    const texts = [
      ...mailbox.l2j.map((c) => c.text),
      '{"h":1,"ack":0,"fr":0}\n{"s":1,"t":"ui_join_clipboard","d":[]}\n',
      '{"s":1,"t":"ui_join_clipboard"}\n',
      '{"s":-1,"t":"ui_ready","d":{"ready":true}}\n{"s":1.5,"t":"ui_ready","d":{"ready":true}}\n',
      '{"s":2,"t":"","d":{}}\n{"s":2,"t":"' + 'x'.repeat(33) + '","d":{}}\nnot json\n[1]\n',
      '\n\n{"h":1,"ack":2,"fr":3}\n{"h":1,"ack":2,"fr":3}\n',
      `{"s":1,"t":"mp_log","d":{"level":"info","msg":"${'y'.repeat(70_000)}"}}\n`,
      'z'.repeat(300_000),
    ];
    for (const text of texts) {
      const z = zodProto.parseLuaBatch(text);
      const c = codec.parseLuaBatch(text);
      expect(c.header).toEqual(z.header);
      expect(c.messages).toEqual(z.messages);
      expect(c.dropped.map(({ line, error, t }) => ({ line, error, t }))).toEqual(
        z.dropped.map(({ line, error, t }) => ({ line, error, t })),
      );
    }
  });

  it('encodeJsLine: same lines, same throws', () => {
    for (const [t, cases] of Object.entries(bridge.j2l)) {
      const type = t as zodProto.J2LType;
      for (const d of cases.valid) {
        expect(codec.encodeJsLine(3, type, d as never)).toBe(zodProto.encodeJsLine(3, type, d as never));
      }
      for (const bad of cases.invalid) {
        expect(() => codec.encodeJsLine(3, type, bad.d as never), bad.why).toThrow();
      }
    }
    expect(() => codec.encodeJsLine(1, 'mp_pack', { status: 'loading', progress: Infinity })).toThrow();
    expect(() => codec.encodeJsLine(1, 'mp_pack', { status: 'loading', progress: NaN })).toThrow();
  });

  it('re-exports the contract constants unchanged', () => {
    expect(codec.BRIDGE_PATHS).toEqual(zodProto.BRIDGE_PATHS);
    expect(codec.BRIDGE_LIMITS).toEqual(zodProto.BRIDGE_LIMITS);
    expect(codec.utf8Length('aé€😀')).toBe(zodProto.utf8Length('aé€😀'));
  });
});
