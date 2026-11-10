/**
 * No browser code calls socket.io's `io()` directly (redesign audit A4).
 *
 * Every browser socket goes through `createRealtimeClient`
 * (`lib/shared/realtime/client.ts`): the fast-recovery wake signals, the honest
 * `connecting` / `reconnecting` status, per-attempt credentials, the protocol
 * version stamp (E2) and the opt-in outbox. A bare `io()` gets none of that —
 * it reconnects on socket.io's 1s-to-10s backoff, reports nothing the UI can
 * tell apart, and leaks its own `visibilitychange` listener. Seven game clients
 * used to hand-roll it; this keeps the count at zero.
 *
 * Type-only imports (`import type { Socket } from 'socket.io-client'`, or an
 * inline `type Socket` specifier) are fine: they erase at build time.
 *
 * Tests are not scanned (they mock the module or drive a real hub with it).
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The one module allowed to call `io()`. */
const WRAPPER = 'lib/shared/realtime/client.ts';

const IMPORT = /import\s+(type\s+)?([^'";]*?)\s*from\s*['"]socket\.io-client['"]/g;

/** True when an import clause binds anything that exists at runtime. */
function bindsValue(clause: string): boolean {
  // `* as sio`, `io`, or `io, { type Socket }` bind a value outright.
  const named = /\{([^}]*)\}/.exec(clause);
  const outsideBraces = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim();
  if (outsideBraces) return true;
  if (!named) return false;
  return named[1]
    .split(',')
    .map((spec) => spec.trim())
    .filter(Boolean)
    .some((spec) => !/^type\s/.test(spec));
}

function offenders(): string[] {
  const files = globSync('{app,components,lib,features,stores,hooks}/**/*.{ts,tsx}', {
    exclude: (f) => /node_modules|\.test\.|routeTree\.gen/.test(String(f)),
  });
  const bad: string[] = [];
  for (const file of files.map(String)) {
    if (file === WRAPPER) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT)) {
      const [, typeOnly, clause] = match;
      if (!typeOnly && bindsValue(clause)) {
        bad.push(file);
        break;
      }
    }
  }
  return bad.sort();
}

describe('bare socket.io ratchet', () => {
  it('only the shared realtime client imports a value from socket.io-client', () => {
    expect(
      offenders(),
      `These files import a value from 'socket.io-client'. Open the socket with createRealtimeClient from '@/lib/shared/realtime/client' instead (see lib/rmhtype/socket.ts for the shape); use 'import type { Socket }' for types.`,
    ).toEqual([]);
  });

  it('recognises value and type-only imports', () => {
    expect(bindsValue('{ io }')).toBe(true);
    expect(bindsValue('{ io, type Socket }')).toBe(true);
    expect(bindsValue('{ io as connect }')).toBe(true);
    expect(bindsValue('* as sio')).toBe(true);
    expect(bindsValue('io')).toBe(true);
    expect(bindsValue('{ type Socket }')).toBe(false);
    expect(bindsValue('{ type Socket, type ManagerOptions }')).toBe(false);
  });
});
