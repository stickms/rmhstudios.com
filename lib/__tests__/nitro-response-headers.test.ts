/**
 * Every Nitro `response`-hook plugin must resolve headers through
 * `responseHeaders(res, event)`.
 *
 * ## Why this is a structural test and not a behavioural one
 *
 * This bug has now shipped twice, and the second time was found only because
 * somebody happened to `curl -D-` a response.
 *
 * In H3 v2, `prepareResponse()` clears the event's prepared-response slot
 * (`event[kEventRes] = undefined`) while it builds the final `Response`, and
 * `event.res` is a lazy getter:
 *
 * ```js
 * get res() { return this[kEventRes] ||= new H3EventResponse(); }
 * ```
 *
 * So reading `event.res` inside a `response` hook does not hand back the response
 * being sent — it **constructs a brand-new, empty, detached one**. Its `.headers`
 * is a perfectly valid `Headers` object, which is what makes the bug so quiet:
 * the natural-reading `event.res?.headers ?? res?.headers` never falls through,
 * every header written lands in a throwaway bag, and the bag is garbage a
 * microtask later. No throw, no log, no failing test.
 *
 * Round one (fixed 2026-08-09): `security-headers.ts` and `anon-html-cache.ts`
 * both had it, so the **entire anonymous-HTML edge cache and every
 * defence-in-depth security header were silent no-ops** — for as long as they had
 * existed. Round two (fixed 2026-08-11): `otel.ts` had the same line and was
 * missed by that fix, so `Server-Timing` never reached a client and `lib/rum.ts`
 * could never stamp a beacon with the server's trace id.
 *
 * `lib/__tests__/anon-html-cache.test.ts` already models H3's real semantics for
 * *one* plugin, end to end. That is the right test and it passed throughout round
 * two — because it only covers `anon-html-cache.ts`. What was missing is a gate
 * over the **set** of plugins, which is the thing that actually regressed. Hence
 * this file: it reads the source of every `response`-hook plugin and requires the
 * shared helper, so a fourth plugin cannot quietly reintroduce the pattern.
 *
 * If a plugin genuinely needs a different resolution strategy, change
 * `responseHeaders` — it is one function, in `security-headers.ts`, and it is
 * exported precisely so there is one place to get this right.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const NITRO_DIR = resolve(process.cwd(), 'server/nitro');

/** Registers a Nitro `response` hook, in either quote style. */
const REGISTERS_RESPONSE_HOOK = /hooks\.hook\(\s*['"]response['"]/;

/**
 * The broken idiom, in the shapes it has actually been written in: reading
 * `event.res` FIRST and falling back to the `res` argument. Optional chaining and
 * whitespace vary; the giveaway is `event.res(...).headers` followed by `??`.
 */
const EVENT_RES_FIRST = /event\??\.res\??\.headers\s*\?\?/;

function nitroPluginSources(): { file: string; source: string }[] {
  return readdirSync(NITRO_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((file) => ({ file, source: readFileSync(join(NITRO_DIR, file), 'utf8') }));
}

function responseHookPlugins(): { file: string; source: string }[] {
  return nitroPluginSources().filter(({ source }) => REGISTERS_RESPONSE_HOOK.test(source));
}

describe('Nitro response-hook plugins', () => {
  it('finds the response-hook plugins at all (guards against a silent glob miss)', () => {
    const files = responseHookPlugins().map((p) => p.file);
    // If this drops to zero — a rename, a moved directory — every assertion below
    // would vacuously pass, which is the failure mode of every source-scanning
    // test. These three are the known set as of 2026-08-11; adding a fourth
    // plugin should make this fail loudly and be updated deliberately.
    expect(files).toEqual(
      expect.arrayContaining(['anon-html-cache.ts', 'otel.ts', 'security-headers.ts']),
    );
  });

  it.each(responseHookPlugins().map((p) => p.file))(
    '%s resolves response headers via responseHeaders(), not event.res',
    (file) => {
      const source = readFileSync(join(NITRO_DIR, file), 'utf8');

      // `security-headers.ts` is where the helper is defined, so it satisfies
      // this by declaring it; everyone else must import it.
      const usesHelper =
        /responseHeaders\s*\(/.test(source) &&
        (file === 'security-headers.ts' || /from '\.\/security-headers'/.test(source));

      expect(
        usesHelper,
        `${file} registers a Nitro \`response\` hook but does not go through ` +
          `responseHeaders(res, event) from ./security-headers. Reading \`event.res\` ` +
          `inside a response hook constructs a fresh detached response, so every ` +
          `header set on it is silently discarded.`,
      ).toBe(true);
    },
  );

  it.each(nitroPluginSources().map((p) => p.file))(
    '%s does not read event.res before the res argument',
    (file) => {
      const source = readFileSync(join(NITRO_DIR, file), 'utf8');
      // Strip block and line comments: this file and the plugins both *quote* the
      // broken idiom when explaining it, and a doc comment describing the bug
      // must not read as committing it.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

      expect(
        EVENT_RES_FIRST.test(code),
        `${file} contains \`event.res?.headers ?? res?.headers\`. That order is ` +
          `always wrong in H3 v2 — \`event.res\` is a lazy getter that builds a new ` +
          `detached response, so \`??\` never falls through and the real response ` +
          `never gets the header. Use responseHeaders(res, event).`,
      ).toBe(false);
    },
  );
});
