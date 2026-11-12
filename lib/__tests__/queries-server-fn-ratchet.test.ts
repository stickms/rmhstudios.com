/**
 * A `*.queries.ts` never holds a `createServerFn` (third-pass audit AR2).
 *
 * A server-rendered read used to be written twice: the GET route (session, rate
 * limit, validation, load) and a `createServerFn` in the queries file that
 * repeated the session check and the load so the loader could run it without
 * HTTP, under a comment saying it had the same body as the route. The two were kept the same by hand, and
 * drifted: one checked admin its own way, others skipped the route's validation.
 *
 * A queries file now states each read once, as `contractQuery(key, contract)`
 * (`lib/route/route-query.ts`): the browser calls the contract, the loader runs
 * the SAME route handler in-process (`lib/api/internal-dispatch.server.ts`). So
 * the count here is zero and stays zero; there is no baseline to lower.
 *
 * If a loader needs something a GET route cannot give it, that is a server
 * function in a `*.functions.ts` / `.server.ts` module next to the page, not a
 * second copy of a read inside a queries file.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Any mention outside a comment: an import, a call, a re-export. */
const SERVER_FN = /\bcreateServerFn\b/;
/** The marker the hand-kept twins carried. */
// Spelled in two halves so this file is not itself a hit for `grep -rl "Same" + " bod" lib`.
const TWIN_MARKER = new RegExp('\\bSame' + ' bod(y|ies) as\\b');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function queriesFiles(): string[] {
  return globSync('{app,components,lib,hooks,stores,features}/**/*.queries.{ts,tsx}', {
    exclude: (f) => /node_modules|__tests__|\.test\./.test(String(f)),
  })
    .map(String)
    .sort();
}

describe('queries files hold no server functions', () => {
  it('finds the queries files it is meant to guard', () => {
    expect(queriesFiles().length).toBeGreaterThan(20);
  });

  it('no *.queries.ts mentions createServerFn', () => {
    const bad = queriesFiles().filter((f) =>
      SERVER_FN.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(
      bad,
      `These queries files define a server function. State the read once with contractQuery(key, contract) from '@/lib/route/route-query' (worked example: lib/admin/admin-ops.queries.ts); the loader then runs the GET route itself.`,
    ).toEqual([]);
  });

  it('no module under lib/ says it repeats a route body', () => {
    const bad = globSync('lib/**/*.{ts,tsx}', {
      exclude: (f) => /node_modules|__tests__|\.test\./.test(String(f)),
    })
      .map(String)
      .filter((f) => TWIN_MARKER.test(readFileSync(f, 'utf8')))
      .sort();
    expect(
      bad,
      'A "same body as the route" comment marks a read written twice. Keep the body in the route and reach it with contractQuery.',
    ).toEqual([]);
  });

  it('tells a real use from a comment', () => {
    expect(
      SERVER_FN.test(stripComments("import { createServerFn } from '@tanstack/react-start';")),
    ).toBe(true);
    expect(SERVER_FN.test(stripComments('const f = createServerFn({ method: "GET" });'))).toBe(
      true,
    );
    expect(SERVER_FN.test(stripComments('// no createServerFn twin here'))).toBe(false);
    expect(SERVER_FN.test(stripComments('/** no `createServerFn` twin */\nexport {};'))).toBe(
      false,
    );
  });
});
