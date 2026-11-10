/**
 * Raw `fetch('/api/…')` calls only go DOWN (redesign audit C1).
 *
 * A site endpoint is called through its typed contract —
 * `api(contract, input)` from `@/lib/contract/client` — so the URL, the body
 * and the response type come from one declaration that the route
 * (`implement()` in `lib/api/implement.server.ts`) is checked against. Each raw
 * string fetch is a call site whose shape nobody checks.
 *
 * This is a one-directional ratchet, like the other backlogs in this folder:
 *  - a NEW raw fetch fails (count above the baseline) — write a contract;
 *  - migrating some fails too until BASELINE is lowered to the new count, so
 *    the backlog cannot quietly grow back into the space you freed.
 *
 * Tests and `__tests__` are not counted.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Lower this when you migrate call sites. Never raise it. */
const BASELINE = 81;

const RAW = /fetch\(\s*['"`]\/api\//g;

function count(): { total: number; top: [string, number][] } {
  const files = globSync('{app,components,lib,hooks,stores,features}/**/*.{ts,tsx}', {
    exclude: (f) => /node_modules|__tests__|\.test\.|routeTree\.gen/.test(String(f)),
  });
  let total = 0;
  const per: [string, number][] = [];
  for (const f of files) {
    const n = (readFileSync(f, 'utf8').match(RAW) ?? []).length;
    if (n) {
      total += n;
      per.push([String(f), n]);
    }
  }
  per.sort((a, b) => b[1] - a[1]);
  return { total, top: per.slice(0, 10) };
}

describe('raw /api fetch ratchet', () => {
  it('does not grow and is lowered as it shrinks', () => {
    const { total, top } = count();
    expect(
      total,
      `raw fetch('/api/…') count is ${total}, baseline ${BASELINE}.\n` +
        (total > BASELINE
          ? "  New raw fetches: call the endpoint through a contract — api(contract) from '@/lib/contract/client' (see lib/contract/endpoint.ts).\n"
          : `  You migrated some: lower BASELINE in this file to ${total}.\n`) +
        `  Biggest remaining: ${top.map(([f, n]) => `${f} (${n})`).join(', ')}`,
    ).toBe(BASELINE);
  });
});
