/**
 * The wire contract.
 *
 * Two things worth asserting mechanically, both of which used to be discipline:
 * that the `C2S`/`S2C` name maps and the `EVENTS` schema map agree (they are
 * written out separately because a computed key erases the literal types the
 * contract is built on), and that every inbound event is declared in the hub's
 * rate-limit map — which per `server/CLAUDE.md` §Gotchas 5 doubles as the hub's
 * event allowlist, and which the previous protocol was entirely missing from.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { C2S, EVENTS, S2C, ScoreReportZ, lobbyRoom } from '../net/events';
import { eventNames, inboundNames } from '../../shared/realtime/contract';

describe('event names', () => {
  it('declares every C2S name in the schema map', () => {
    for (const name of Object.values(C2S)) {
      expect(eventNames(EVENTS)).toContain(name);
    }
  });

  it('declares every S2C name in the schema map', () => {
    for (const name of Object.values(S2C)) {
      expect(eventNames(EVENTS)).toContain(name);
    }
  });

  it('declares nothing in the schema map that is not a named event', () => {
    const named = new Set<string>([...Object.values(C2S), ...Object.values(S2C)]);
    for (const name of eventNames(EVENTS)) {
      expect(named.has(name)).toBe(true);
    }
  });

  it('namespaces every event under slice:', () => {
    for (const name of eventNames(EVENTS)) {
      expect(name.startsWith('slice:')).toBe(true);
    }
  });

  it('gives every C2S name a c2s schema', () => {
    for (const name of Object.values(C2S)) {
      expect(inboundNames(EVENTS)).toContain(name);
    }
  });

  it('rooms a lobby by its code', () => {
    expect(lobbyRoom('ABC123')).toBe('slice:ABC123');
  });
});

describe('rate-limit coverage', () => {
  /**
   * Read the hub config as text rather than importing it: `server/` is compiled
   * under a different tsconfig and importing it here would drag in `dotenv` and
   * the whole config module for a string search.
   */
  const config = readFileSync(
    path.resolve(__dirname, '../../../server/socket-server/config.ts'),
    'utf8',
  );

  it('declares a limit for every inbound event', () => {
    const missing = inboundNames(EVENTS).filter((name) => !config.includes(`'${name}':`));
    expect(missing).toEqual([]);
  });
});

describe('ScoreReportZ', () => {
  const valid = { score: 1000, combo: 12, maxCombo: 30, accuracy: 0.95, health: 100 };

  it('accepts a well-formed report', () => {
    expect(ScoreReportZ.parse(valid)).toEqual(valid);
  });

  it('clamps rather than rejects — a mid-match disconnect is the worse outcome', () => {
    const parsed = ScoreReportZ.parse({
      score: -5,
      combo: 1e9,
      maxCombo: 1e9,
      accuracy: 4,
      health: 900,
    });
    expect(parsed.score).toBe(0);
    expect(parsed.combo).toBe(1_000_000);
    expect(parsed.accuracy).toBe(1);
    expect(parsed.health).toBe(100);
  });

  it('turns JSON-transited NaN (which arrives as null) into zero', () => {
    // A client-side arithmetic slip serialises as null. Under a strict schema
    // that is a protocol error and a disconnect *during a song*.
    const parsed = ScoreReportZ.parse({
      score: null,
      combo: null,
      maxCombo: null,
      accuracy: null,
      health: null,
    });
    expect(parsed).toEqual({ score: 0, combo: 0, maxCombo: 0, accuracy: 0, health: 0 });
  });

  it('floors fractional scores', () => {
    expect(ScoreReportZ.parse({ ...valid, score: 10.9 }).score).toBe(10);
  });

  it('accepts a partial report rather than hanging up on an older client', () => {
    // A field added after a client shipped arrives absent, not wrong. Failing
    // the parse would disconnect that player in the middle of a song.
    const parsed = ScoreReportZ.parse({ score: 500, combo: 3 });
    expect(parsed.score).toBe(500);
    expect(parsed.combo).toBe(3);
    expect(parsed.accuracy).toBe(0);
    expect(parsed.health).toBe(0);
  });

  it('rejects a payload that is not an object at all', () => {
    expect(ScoreReportZ.safeParse('nope').success).toBe(false);
  });
});

describe('lobby join payload', () => {
  const schema = EVENTS['slice:join'].c2s;

  it('upper-cases and strips a code', () => {
    expect(schema.parse({ code: ' ab-c1!2 ' })).toEqual({ code: 'ABC12' });
  });

  it('truncates an over-long code rather than failing the join', () => {
    expect(schema.parse({ code: 'ABCDEFGHIJ' })).toEqual({ code: 'ABCDEF' });
  });

  it('yields an empty code for a non-string, which the handler treats as not-found', () => {
    expect(schema.parse({ code: 42 })).toEqual({ code: '' });
  });
});
