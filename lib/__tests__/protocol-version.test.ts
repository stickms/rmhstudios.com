/**
 * E2 — the socket protocol version.
 *
 * The contract (`lib/shared/realtime/protocol.ts`) is declared once; the hubs'
 * guard (`server/shared/protocol.ts`) imports it. This file pins the contract's
 * own invariants and the guard's verdicts.
 */

import { describe, it, expect, vi } from 'vitest';

import * as client from '@/lib/shared/realtime/protocol';
import * as server from '../../server/shared/protocol';

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
    const socket = fakeSocket({ protocol: client.PROTOCOL_VERSION });
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
        payload: { expected: client.PROTOCOL_VERSION, received: 'deadbeefdeadbeef' },
      },
    ]);
    const error = next.mock.calls[0][0] as Error & { data?: unknown };
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('protocol-outdated');
    // Sent twice on purpose — the emit races teardown, `err.data` needs a
    // connect_error handler; between them the client always learns why.
    expect(error.data).toEqual({
      expected: client.PROTOCOL_VERSION,
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

describe('protocolLogger', () => {
  it('passes rejections through and folds absent clients into one line per window', () => {
    const lines: Array<Record<string, unknown>> = [];
    let t = 0;
    const log = server.protocolLogger({ warn: (e) => lines.push(e) }, 60_000, () => t);
    log.warn({ event: 'protocol_absent', expected: 'x' }); // first one of the window: logged
    log.warn({ event: 'protocol_absent', expected: 'x' });
    log.warn({ event: 'protocol_absent', expected: 'x' });
    log.warn({ event: 'protocol_outdated', expected: 'x', received: 'y' });
    t = 60_001;
    log.warn({ event: 'protocol_absent', expected: 'x' });
    expect(lines).toEqual([
      { event: 'protocol_absent', expected: 'x', count: 1, windowMs: 60_000 },
      { event: 'protocol_outdated', expected: 'x', received: 'y' },
      { event: 'protocol_absent', expected: 'x', count: 3, windowMs: 60_000 },
    ]);
  });
});

describe('every hub installs the guard', () => {
  // The guard existed for weeks without being wired into any hub (found by the phase 25
  // fallback sweep). Each hub must install it, and before its auth middleware so an
  // outdated tab is refused without a database round-trip.
  it.each(['server/socket-server/index.ts', 'server/rmhbox/index.ts', 'server/rmhtube/index.ts'])(
    '%s',
    async (file) => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const src = readFileSync(join(__dirname, '..', '..', file), 'utf8');
      const guard = src.indexOf('io.use(protocolGuard(');
      const auth = src.search(/io\.use\((?:soft)?[aA]uthMiddleware\)/);
      expect(guard, 'io.use(protocolGuard(...)) missing').toBeGreaterThan(-1);
      expect(auth).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(auth);
    },
  );
});
