/**
 * Every client-to-server socket event must carry a rate limit.
 *
 * The reason this file exists is that the failure mode is silent and inverted
 * from what the code comments long claimed. `SOCKET_RATE_LIMITS` in
 * `server/socket-server/config.ts` reads like an allowlist, and both
 * `lib/call/events.ts` and (until it was corrected) `lib/groupcall/events.ts`
 * described it as one — "an unlisted event is silently dropped". It is not.
 * `createRateLimiter.check` in `server/shared/rate-limit.ts` returns `true` for
 * a name it does not recognise:
 *
 *     const limit = rules[eventName];
 *     if (!limit) return true;
 *
 * So forgetting to add an event does not disable it. It ships it **unmetered**,
 * with no error, no log line, and a handler that works perfectly in every
 * manual test. Nothing else in the suite catches that.
 *
 * It matters most for the mesh. A 1:1 flood costs one recipient; a `gcall:*`
 * flood is relayed to up to seven, so an unmetered signalling event is an
 * amplifier pointed at the hub.
 *
 * The map is parsed out of the config source rather than imported because
 * `config.ts` reads `process.env` and exits the process when
 * `SOCKET_CORS_ORIGIN` is unset — importing it into a test run would either
 * kill the runner or require faking the hub's whole environment to assert a
 * fact about a literal.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CALL_C2S } from '@/lib/call/events';
import { GCALL_C2S } from '@/lib/groupcall/events';
import { PARTY_C2S } from '@/lib/party/events';
import { SPACE_C2S } from '@/lib/spaces/events';

const CONFIG_PATH = join(process.cwd(), 'server/socket-server/config.ts');

/** The quoted keys of the `SOCKET_RATE_LIMITS` object literal. */
function meteredEvents(): Set<string> {
  const source = readFileSync(CONFIG_PATH, 'utf8');
  const start = source.indexOf('SOCKET_RATE_LIMITS: {');
  expect(start, 'SOCKET_RATE_LIMITS literal not found — did config.ts move?').toBeGreaterThan(-1);

  // Walk braces from the literal's opening `{` so a nested `{ max, windowMs }`
  // does not end the scan early.
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = source.slice(open, end);
  const names = new Set<string>();
  for (const match of body.matchAll(/^\s*'([^']+)'\s*:\s*\{/gm)) names.add(match[1]);
  return names;
}

/**
 * The contracts whose inbound events reach the games hub (port 7001). Hubs with
 * their own process — rmhbox, rmhtube — carry their own limiter and are not in
 * this map.
 */
const CONTRACTS: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> = [
  ['gcall', GCALL_C2S],
  ['call', CALL_C2S],
  ['party', PARTY_C2S],
  ['space', SPACE_C2S],
];

describe('every inbound socket event is rate limited', () => {
  const metered = meteredEvents();

  it('parses the rule map out of config.ts', () => {
    // A guard on the parser itself: if the regex silently stopped matching,
    // every assertion below would pass vacuously.
    expect(metered.size).toBeGreaterThan(20);
    expect(metered.has('call:invite')).toBe(true);
  });

  for (const [name, contract] of CONTRACTS) {
    it(`covers every ${name}:* client-to-server event`, () => {
      const declared = Object.values(contract);
      expect(declared.length).toBeGreaterThan(0);

      const unmetered = declared.filter((event) => !metered.has(event));
      expect(
        unmetered,
        `These events reach the hub with no rate limit. They are not blocked — ` +
          `an unlisted event is unmetered, so this ships a handler anyone can ` +
          `flood. Add a rule to SOCKET_RATE_LIMITS in server/socket-server/config.ts.`,
      ).toEqual([]);
    });
  }

  it('meters the mesh signalling paths above their 1:1 counterparts', () => {
    // The group ceilings are deliberately higher than the 1:1 ones because a
    // mesh multiplies each participant's traffic by the number of legs. If a
    // future edit copies the 1:1 numbers across, an eight-person room starts
    // rate-limiting its own healthy renegotiation, which presents as random
    // peers failing to connect rather than as a limit being hit.
    const source = readFileSync(CONFIG_PATH, 'utf8');
    const ceiling = (event: string): number => {
      const found = source.match(new RegExp(`'${event}'\\s*:\\s*\\{\\s*max:\\s*([0-9_]+)`));
      expect(found, `no rule found for ${event}`).not.toBeNull();
      return Number(found![1].replace(/_/g, ''));
    };

    expect(ceiling('gcall:signal')).toBeGreaterThan(ceiling('call:signal'));
    expect(ceiling('gcall:ice')).toBeGreaterThan(ceiling('call:ice'));
  });
});
