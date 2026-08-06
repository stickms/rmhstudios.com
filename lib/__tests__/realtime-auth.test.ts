/**
 * Every realtime client must hand the server a session **token**.
 *
 * This is a source-shape test rather than a behavioural one because the failure
 * it guards against is invisible at every layer that could otherwise catch it.
 * The hubs use *soft* auth: an unrecognised handshake connects anyway, just
 * without `socket.data.userId`. So a client that sends the wrong field
 * typechecks (the resolver returns `Record<string, unknown>`), connects, shows
 * "connected" in the UI, and then has every authenticated handler silently
 * ignore it — which is exactly how voice calls shipped unable to place a call.
 *
 * `token` is the only field the socket-server, rmhtube and rmhbox middlewares
 * read (rmhbox also accepts a Discord Activity token). Sending a user id in its
 * place cannot work by design: an id asserted by the client would be an
 * impersonation hole, so the server does not look at one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

/** Every module that opens a socket through the shared factory. */
const CLIENTS = [
  'lib/call/store.ts',
  'lib/groupcall/store.ts',
  'lib/rmhtype/socket.ts',
  'lib/rmhstudy/socket.ts',
  'lib/rmhtube/socket.ts',
  'lib/rmhmusic/socket.ts',
  'lib/rmhbox/socket.ts',
  'lib/gabriels-horn/net/client.ts',
  'lib/laundry-sort/net/client.ts',
  'lib/massive-march/net/client.ts',
];

/**
 * The `auth:` property of a `createRealtimeClient({ … })` call, up to the next
 * top-level option. Crude, but the call sites are all written the same way and
 * a regex that misses would fail loudly below rather than pass quietly.
 */
function authResolvers(source: string): string[] {
  return [...source.matchAll(/\bauth:\s*(?:async\s*)?\(\)\s*=>\s*\{([\s\S]*?)\n {4}\},/g)].map(
    (m) => m[1],
  );
}

describe('realtime handshake credentials', () => {
  for (const file of CLIENTS) {
    it(`${file} sends a session token`, () => {
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      expect(source).toContain('createRealtimeClient(');

      const resolvers = authResolvers(source);
      expect(resolvers.length).toBeGreaterThan(0);

      for (const body of resolvers) {
        // The returned object must carry `token` (or, for the Discord Activity
        // path, `discordToken`) — those are the only keys any hub reads.
        expect(body).toMatch(/\b(token|discordToken)\b\s*[:,}]/);
        // A user id is never a credential. Guard the specific mistake, not the
        // presence of the word: some resolvers legitimately mention ids nearby.
        expect(body).not.toMatch(/^\s*(return\s*\{[^}]*\buserId\s*:)/m);
      }
    });
  }
});
