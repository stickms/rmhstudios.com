/**
 * E2 — the socket protocol version.
 *
 * The load-bearing assertion in this file is the FIRST one: the client half
 * (`lib/shared/realtime/protocol.ts`) and the server half
 * (`server/shared/protocol.ts`) declare the same contract.
 *
 * They are duplicated rather than shared because the Dockerfile's
 * `server-builder` stage copies a curated subset of `lib/` and the client
 * module is not in it — a `server/` bundle importing an uncopied `lib/` module
 * either fails the image build or ships a bundle that throws MODULE_NOT_FOUND
 * on boot (`server/CLAUDE.md` gotchas 7 and 8). Adding
 * `COPY lib/shared/realtime/protocol.ts ./lib/shared/realtime/protocol.ts`
 * to that stage lets the server half re-export from the client half and deletes
 * the duplication; until then, this test is what stands between a stray edit
 * and a hub that rejects every client on earth.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as client from '@/lib/shared/realtime/protocol';
import * as server from '../../server/shared/protocol';

const ROOT = resolve(__dirname, '../..');
const CLIENT_SRC = readFileSync(resolve(ROOT, 'lib/shared/realtime/protocol.ts'), 'utf-8');
const SERVER_SRC = readFileSync(resolve(ROOT, 'server/shared/protocol.ts'), 'utf-8');

/** The body of the `fnv1a` helper, stripped of comments and whitespace. */
function fnv1aBody(source: string): string {
  const start = source.indexOf('function fnv1a(');
  expect(start, 'no fnv1a helper found').toBeGreaterThan(-1);
  return source
    .slice(start, source.indexOf('\n}', start))
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, '');
}

describe('the two halves agree', () => {
  it('declares the same event list', () => {
    expect(server.PROTOCOL_EVENTS).toEqual(client.PROTOCOL_EVENTS);
  });

  it('declares the same revision', () => {
    expect(server.PROTOCOL_REVISION).toBe(client.PROTOCOL_REVISION);
  });

  it('computes the same version', () => {
    expect(server.PROTOCOL_VERSION).toBe(client.PROTOCOL_VERSION);
  });

  it('uses a byte-identical hash implementation', () => {
    // Equal inputs producing equal outputs above is necessary but not
    // sufficient: two different implementations can agree on one input and
    // diverge on the next revision. Compare the code, not just the result.
    expect(fnv1aBody(SERVER_SRC)).toBe(fnv1aBody(CLIENT_SRC));
  });

  it('agrees on the wire constants', () => {
    expect(server.PROTOCOL_AUTH_KEY).toBe(client.PROTOCOL_AUTH_KEY);
    expect(server.PROTOCOL_OUTDATED_EVENT).toBe(client.PROTOCOL_OUTDATED_EVENT);
    expect(server.PROTOCOL_OUTDATED_REASON).toBe(client.PROTOCOL_OUTDATED_REASON);
  });
});

describe('the declared contract', () => {
  it('is sorted, so two people adding an event cannot produce two versions', () => {
    expect([...client.PROTOCOL_EVENTS]).toEqual([...client.PROTOCOL_EVENTS].sort());
  });

  it('has no duplicates', () => {
    expect(new Set(client.PROTOCOL_EVENTS).size).toBe(client.PROTOCOL_EVENTS.length);
  });

  it('includes the event the guard itself sends', () => {
    expect(client.PROTOCOL_EVENTS).toContain(client.PROTOCOL_OUTDATED_EVENT);
  });
});

describe('hashEvents', () => {
  it('is stable across platforms and runs', () => {
    // A golden value. FNV-1a is implemented with shifts precisely because
    // `hash * 16777619` overflows the float53 mantissa and would make the hash
    // engine-dependent — this asserts the shift form is still in use.
    expect(client.hashEvents(['a', 'b'], 1)).toBe(server.hashEvents(['a', 'b'], 1));
    expect(client.hashEvents(['a', 'b'], 1)).toMatch(/^[0-9a-f]{16}$/);
    expect(client.hashEvents(['a', 'b'], 1)).toBe(client.hashEvents(['a', 'b'], 1));
  });

  it('changes when an event is added, removed or renamed', () => {
    const base = client.hashEvents(['a', 'b'], 1);
    expect(client.hashEvents(['a', 'b', 'c'], 1)).not.toBe(base);
    expect(client.hashEvents(['a'], 1)).not.toBe(base);
    expect(client.hashEvents(['a', 'z'], 1)).not.toBe(base);
  });

  it('changes when only the revision is bumped', () => {
    // The escape hatch for a payload-shape change that no event name reflects
    // — which is exactly the mismatch that produces the silent mid-match no-op.
    expect(client.hashEvents(['a', 'b'], 2)).not.toBe(client.hashEvents(['a', 'b'], 1));
  });

  it('is order-sensitive, which is why the list must stay sorted', () => {
    expect(client.hashEvents(['b', 'a'], 1)).not.toBe(client.hashEvents(['a', 'b'], 1));
  });
});

/* ─── The guard ─────────────────────────────────────────────────────────── */

function fakeSocket(auth: Record<string, unknown> | undefined) {
  const emitted: { event: string; payload: unknown }[] = [];
  return {
    handshake: { auth },
    emit(event: string, payload: unknown) {
      emitted.push({ event, payload });
      return true;
    },
    emitted,
  };
}

describe('protocolGuard', () => {
  it('admits a matching client', () => {
    const socket = fakeSocket({ protocol: server.PROTOCOL_VERSION });
    const next = vi.fn();
    server.protocolGuard()(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.emitted).toHaveLength(0);
  });

  it('admits a versionless client by default', () => {
    // Not timidity: most of this hub's clients are bare `io()` calls that have
    // never sent a handshake field, and every tab open when the guard first
    // deploys is one of them. Rejecting "absent" would take every game on the
    // site down at the instant this shipped.
    const socket = fakeSocket({ token: 'abc' });
    const next = vi.fn();
    const logger = { warn: vi.fn() };
    server.protocolGuard(logger)(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.emitted).toHaveLength(0);
    // Counted, so "is strict mode safe yet?" is a log query.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'protocol_absent' }),
    );
  });

  it('refuses a client declaring a different version', () => {
    const socket = fakeSocket({ protocol: 'deadbeefdeadbeef' });
    const next = vi.fn();
    server.protocolGuard()(socket, next);

    // The emit must land BEFORE the error: socket.io tears the connection down
    // on `next(err)`, and a payload sent afterwards goes nowhere.
    expect(socket.emitted).toEqual([
      {
        event: 'protocol:outdated',
        payload: { expected: server.PROTOCOL_VERSION, received: 'deadbeefdeadbeef' },
      },
    ]);
    const error = next.mock.calls[0][0] as Error & { data?: unknown };
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('protocol-outdated');
    // Sent twice on purpose — the emit races teardown, `err.data` needs a
    // connect_error handler; between them the client always learns why.
    expect(error.data).toEqual({
      expected: server.PROTOCOL_VERSION,
      received: 'deadbeefdeadbeef',
    });
  });

  it('refuses a versionless client under SOCKET_PROTOCOL_STRICT', () => {
    const previous = process.env.SOCKET_PROTOCOL_STRICT;
    process.env.SOCKET_PROTOCOL_STRICT = '1';
    try {
      const socket = fakeSocket({});
      const next = vi.fn();
      server.protocolGuard()(socket, next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(socket.emitted[0].event).toBe('protocol:outdated');
    } finally {
      if (previous === undefined) delete process.env.SOCKET_PROTOCOL_STRICT;
      else process.env.SOCKET_PROTOCOL_STRICT = previous;
    }
  });

  it('treats a missing auth object as absent, not as a mismatch', () => {
    const socket = fakeSocket(undefined);
    const next = vi.fn();
    server.protocolGuard()(socket, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('checkProtocol', () => {
  it('classifies the three cases', () => {
    expect(server.checkProtocol('v1', 'v1')).toBe('match');
    expect(server.checkProtocol('v0', 'v1')).toBe('mismatch');
    expect(server.checkProtocol(undefined, 'v1')).toBe('absent');
    expect(server.checkProtocol('', 'v1')).toBe('absent');
    // A non-string is a broken client, not a stale one — treating it as absent
    // keeps the strict switch as the single place that decides their fate.
    expect(server.checkProtocol(42, 'v1')).toBe('absent');
  });
});
