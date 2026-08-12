/**
 * `server/nitro/anon-html-cache.ts` — the edge-cache gate, as a gate.
 *
 * Two separate things are pinned here, and both fail silently in production if
 * they regress:
 *
 *  1. **The safety model (OPT-43).** The plugin marks HTML `public`, i.e. hands
 *     it to a SHARED cache. Everything that keeps that safe is a narrow gate:
 *     no session cookie, no locale cookie, an audited path, a document GET.
 *     Widening the allowlist is cheap; widening it past what the gate can defend
 *     serves one visitor's page to everyone, and nothing in a normal test run
 *     would ever notice.
 *  2. **bfcache eligibility (OPT-30).** `no-store` on a MAIN DOCUMENT response
 *     makes the page ineligible for the browser back/forward cache in Chrome and
 *     Firefox, so every Back press by a signed-in user pays a full re-render.
 *     `private, no-cache` has the same privacy properties (never stored by a
 *     shared cache, never reused without revalidating) and keeps bfcache. This
 *     file asserts the authenticated header never regresses to `no-store`.
 *
 * The plugin is exercised two ways: through the exported pure decision function,
 * and end-to-end through the real Nitro `response` hook with fake request and
 * response objects, so the content-type and method gates are covered too.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import anonHtmlCachePlugin, {
  CACHEABLE_ANON_PATHS,
  CACHEABLE_ANON_PREFIXES,
  anonCachePolicy,
  decideCacheControl,
} from '@/server/nitro/anon-html-cache';

/** Cookie shapes Better Auth actually emits, plus the bare dev-mode name. */
const SESSION_COOKIES = [
  'better-auth.session_token=abc123',
  '__Secure-better-auth.session_token=abc123',
  '__Host-better-auth.session_token=abc123',
  'better-auth.session_data=eyJ0aGluZyI6MX0',
  'theme=dark; better-auth.session_token=abc123; rmh-lang=en',
];

const LOCALE_COOKIE = 'rmh-lang=fr';

/** Paths the plugin may mark `public`, plus one article path per prefix. */
const ALLOWLISTED_PATHS = [
  ...CACHEABLE_ANON_PATHS,
  ...CACHEABLE_ANON_PREFIXES.map((prefix) => `${prefix}some-slug`),
];

/** Paths that must never be shared, whatever the cookies say. */
const NON_ALLOWLISTED_PATHS = [
  '/wallet',
  '/settings/account',
  '/notifications',
  '/messages',
  '/u/someone',
  '/admin',
  '/create',
  // Prefix matching must not spill into a sibling that merely shares a stem.
  '/blogroll',
  '/blog-archive',
  '/newsletter',
  '/news-roundup',
  // The prefixes' own bare paths are separate decisions: `/news` is allowlisted
  // on its own merits, `/blog` is a redirect and deliberately is not.
  '/blog',
];

/** Minimal stand-ins for the Nitro `response` hook's `event.req` / `event.res`. */
function runPlugin(options: {
  path: string;
  cookie?: string | null;
  method?: string;
  contentType?: string | null;
  existingCacheControl?: string;
}): Headers {
  const resHeaders = new Headers();
  if (options.contentType !== null) {
    resHeaders.set('content-type', options.contentType ?? 'text/html; charset=utf-8');
  }
  if (options.existingCacheControl) {
    resHeaders.set('Cache-Control', options.existingCacheControl);
  }

  const reqHeaders = new Headers();
  if (options.cookie) reqHeaders.set('cookie', options.cookie);

  let handler: ((res: unknown, event: unknown) => void) | null = null;
  anonHtmlCachePlugin({
    hooks: {
      hook: (name, fn) => {
        if (name === 'response') handler = fn;
      },
    },
  });
  expect(handler, 'plugin must register a `response` hook').not.toBeNull();

  const event = {
    req: {
      url: `http://rmhstudios.com${options.path}`,
      method: options.method ?? 'GET',
      headers: reqHeaders,
    },
    res: { headers: resHeaders },
  };
  handler!({ headers: resHeaders }, event);
  return resHeaders;
}

const cacheControl = (headers: Headers) => headers.get('Cache-Control') ?? '';

/**
 * The plugin must write to the response that is actually being SENT.
 *
 * `runPlugin` above passes one `Headers` instance as both `res.headers` and
 * `event.res.headers`, so it cannot tell the two apart — and that is precisely
 * how this shipped broken. In real H3, `prepareResponse()` clears the event's
 * prepared-response slot while it builds the final Response, and `event.res` is
 * a lazy getter (`this[kEventRes] ||= new H3EventResponse()`). So a `response`
 * hook that reads `event.res` does not get the response: it CONSTRUCTS a fresh,
 * empty, detached one. The old `event.res.headers ?? res.headers` therefore
 * never fell through — every header went into a throwaway bag, and both this
 * plugin and `security-headers.ts` were no-ops on every response in production.
 *
 * This models H3's real semantics: `event.res` hands back a NEW object each
 * time, and only `res.headers` is the live one.
 */
describe('anon-html-cache — writes to the response actually being sent', () => {
  function runAgainstRealH3Shape(path: string, cookie?: string) {
    const sentHeaders = new Headers({ 'content-type': 'text/html; charset=utf-8' });
    const detached: Headers[] = [];

    let handler: ((res: unknown, event: unknown) => void) | null = null;
    anonHtmlCachePlugin({
      hooks: {
        hook: (name, fn) => {
          if (name === 'response') handler = fn;
        },
      },
    });

    const reqHeaders = new Headers();
    if (cookie) reqHeaders.set('cookie', cookie);

    const event = {
      req: { url: `http://rmhstudios.com${path}`, method: 'GET', headers: reqHeaders },
      // The lazy getter: a brand-new detached response every read, exactly like
      // `get res() { return this[kEventRes] ||= new H3EventResponse(); }` after
      // `prepareResponse` has cleared the slot.
      get res() {
        const fresh = new Headers();
        detached.push(fresh);
        return { headers: fresh };
      },
    };

    handler!({ headers: sentHeaders }, event);
    return { sentHeaders, detached };
  }

  it('sets Cache-Control on the sent response, not on a detached event.res', () => {
    const { sentHeaders, detached } = runAgainstRealH3Shape('/');
    expect(cacheControl(sentHeaders)).toContain('s-maxage=');
    for (const bag of detached) {
      expect(bag.get('Cache-Control'), 'header landed on a discarded object').toBeNull();
    }
  });

  it('still marks an authenticated document private on the sent response', () => {
    const { sentHeaders } = runAgainstRealH3Shape('/', 'better-auth.session_token=abc123');
    expect(cacheControl(sentHeaders)).toBe('private, no-cache, max-age=0, must-revalidate');
    expect(cacheControl(sentHeaders)).not.toContain('no-store');
  });
});

describe('anon-html-cache — authenticated requests are never shared (OPT-43)', () => {
  it('never marks an authenticated response `public`, on any path', () => {
    const leaks: string[] = [];
    for (const cookie of SESSION_COOKIES) {
      for (const path of [...ALLOWLISTED_PATHS, ...NON_ALLOWLISTED_PATHS]) {
        const value = cacheControl(runPlugin({ path, cookie }));
        if (value.includes('public')) leaks.push(`${path} + "${cookie}" → ${value}`);
      }
    }
    expect(leaks, 'A signed-in document was marked shared-cacheable.').toEqual([]);
  });

  it('force-marks it `private`, overriding whatever the route set', () => {
    const headers = runPlugin({
      path: '/',
      cookie: SESSION_COOKIES[0],
      existingCacheControl: 'public, max-age=600',
    });
    expect(cacheControl(headers)).toBe('private, no-cache, max-age=0, must-revalidate');
  });

  it('treats a session cookie as authenticating even alongside a locale cookie', () => {
    const headers = runPlugin({ path: '/', cookie: 'rmh-lang=en; better-auth.session_token=x' });
    expect(cacheControl(headers)).not.toContain('public');
    expect(cacheControl(headers)).toContain('private');
  });
});

describe('anon-html-cache — the authenticated header keeps bfcache (OPT-30)', () => {
  /**
   * The regression this exists for: `no-store` on a main-document response
   * disqualifies the page from the browser's back/forward cache in Chrome and
   * Firefox, so a signed-in visitor re-renders the whole page on every Back.
   * `private, no-cache, max-age=0, must-revalidate` is equally private — a
   * shared cache still may not store it, and nothing may be reused without
   * revalidating — and stays bfcache-eligible. If this assertion fails, the
   * navigation regression is invisible in every other test.
   */
  it('never emits `no-store` for an authenticated document', () => {
    for (const cookie of SESSION_COOKIES) {
      for (const path of [...ALLOWLISTED_PATHS, ...NON_ALLOWLISTED_PATHS]) {
        expect(cacheControl(runPlugin({ path, cookie }))).not.toContain('no-store');
      }
    }
  });

  it('keeps every privacy directive the old `no-store` header carried', () => {
    const value = cacheControl(runPlugin({ path: '/wallet', cookie: SESSION_COOKIES[0] }));
    // `private` is the directive that actually forbids a shared cache from
    // storing the response; the rest forbid reuse without revalidation.
    expect(value).toContain('private');
    expect(value).toContain('no-cache');
    expect(value).toContain('max-age=0');
    expect(value).toContain('must-revalidate');
  });
});

describe('anon-html-cache — the locale gate', () => {
  it('never marks a locale-preference request `public`', () => {
    for (const path of ALLOWLISTED_PATHS) {
      const value = cacheControl(runPlugin({ path, cookie: LOCALE_COOKIE }));
      expect(value, `${path} with a locale cookie`).not.toContain('public');
    }
  });

  it('leaves the response header untouched rather than rewriting it', () => {
    // A locale-preference anon visitor is simply origin-rendered — the plugin
    // has no opinion, so a route's own policy survives.
    const headers = runPlugin({
      path: '/',
      cookie: LOCALE_COOKIE,
      existingCacheControl: 'private, max-age=60',
    });
    expect(cacheControl(headers)).toBe('private, max-age=60');
  });
});

describe('anon-html-cache — the path allowlist', () => {
  it('never marks a non-allowlisted path `public`, even with no cookies at all', () => {
    for (const path of NON_ALLOWLISTED_PATHS) {
      const headers = runPlugin({ path });
      expect(headers.get('Cache-Control'), `${path} must not be shared`).toBeNull();
      expect(headers.get('Vary')).toBeNull();
    }
  });

  it('marks an allowlisted exact path shared for the short index TTL', () => {
    for (const path of CACHEABLE_ANON_PATHS) {
      const headers = runPlugin({ path });
      expect(cacheControl(headers), path).toBe(
        'public, max-age=0, s-maxage=30, stale-while-revalidate=120',
      );
      expect(headers.get('Vary'), path).toBe('Accept-Language');
    }
  });

  it('marks an article path shared for the long content TTL', () => {
    for (const prefix of CACHEABLE_ANON_PREFIXES) {
      const headers = runPlugin({ path: `${prefix}a-post` });
      expect(cacheControl(headers), prefix).toBe(
        'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
      );
    }
  });

  it('keeps browsers out of it — `max-age=0` on every shared policy', () => {
    for (const path of ALLOWLISTED_PATHS) {
      // Without this a signed-out visitor who then signs in is served their own
      // stale anonymous copy out of the browser's HTTP cache.
      expect(cacheControl(runPlugin({ path })), path).toContain('max-age=0');
    }
  });

  it('yields to a policy the route set for itself', () => {
    const headers = runPlugin({ path: '/', existingCacheControl: 'private, no-store' });
    expect(cacheControl(headers)).toBe('private, no-store');
  });
});

describe('anon-html-cache — the request-shape gates', () => {
  it('only touches HTML', () => {
    for (const contentType of ['application/json', 'application/rss+xml', 'image/avif', null]) {
      const headers = runPlugin({ path: '/', contentType });
      expect(headers.get('Cache-Control'), String(contentType)).toBeNull();
    }
  });

  it('caches GET and HEAD only', () => {
    expect(cacheControl(runPlugin({ path: '/', method: 'GET' }))).toContain('public');
    expect(cacheControl(runPlugin({ path: '/', method: 'HEAD' }))).toContain('public');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(runPlugin({ path: '/', method }).get('Cache-Control'), method).toBeNull();
    }
  });

  it('ignores the query string when matching, so `?view=` cannot dodge the gate', () => {
    // Cloudflare keys on the full query string, so distinct params are distinct
    // entries; what matters here is that a param can neither smuggle a path onto
    // the allowlist nor smuggle one off it.
    expect(cacheControl(runPlugin({ path: '/library?view=music' }))).toContain('public');
    expect(runPlugin({ path: '/wallet?from=/' }).get('Cache-Control')).toBeNull();
  });
});

describe('anon-html-cache — decideCacheControl (the pure gate)', () => {
  it('reports a shared decision only for an anonymous allowlisted path', () => {
    expect(decideCacheControl('/', null)).toMatchObject({ shared: true });
    expect(decideCacheControl('/blog/a-post', null)).toMatchObject({ shared: true });
    expect(decideCacheControl('/', SESSION_COOKIES[0])).toMatchObject({ shared: false });
    expect(decideCacheControl('/', LOCALE_COOKIE)).toBeNull();
    expect(decideCacheControl('/wallet', null)).toBeNull();
  });

  it('lets an exact entry override a prefix TTL', () => {
    // `/news` is an exact entry (index TTL); `/news/x` falls to the prefix.
    expect(anonCachePolicy('/news')).toContain('s-maxage=30');
    expect(anonCachePolicy('/news/x')).toContain('s-maxage=300');
  });
});

/**
 * The allowlist is a claim about routes, so hold it to the routes. This is what
 * catches the `/blog` trap: that route is a `beforeLoad` redirect to `/library`
 * with no component, so it emits a 3xx and not HTML — listing it would be dead
 * weight that reads like a shipped optimization.
 */
describe('anon-html-cache — the allowlist matches the route tree', () => {
  const ROUTES_DIR = resolve(process.cwd(), 'app/routes');
  const ESCAPED_DOT = '__ESCAPED_DOT__';

  function pageRouteFiles(dir = ROUTES_DIR, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'api') continue;
        pageRouteFiles(full, acc);
      } else if (entry.endsWith('.tsx')) {
        acc.push(full);
      }
    }
    return acc;
  }

  /** A route file's URL path, by TanStack's file-naming rules. */
  function urlPathFor(file: string): string | null {
    let rel = file.slice(ROUTES_DIR.length + 1).replace(/\.tsx$/, '');
    if (rel === '__root' || rel === '_site') return null;
    rel = rel.split('[.]').join(ESCAPED_DOT);
    const segments = rel
      .split('/')
      .flatMap((s) => s.split('.'))
      .map((s) => s.split(ESCAPED_DOT).join('.'))
      .filter((s) => s !== '')
      .filter((s) => !s.startsWith('_'))
      .map((s) => (s.endsWith('_') ? s.slice(0, -1) : s));
    const last = segments[segments.length - 1];
    if (last === 'index' || last === 'route') segments.pop();
    return `/${segments.join('/')}`;
  }

  const byPath = new Map<string, string>();
  for (const file of pageRouteFiles()) {
    const path = urlPathFor(file);
    if (path !== null && !byPath.has(path)) byPath.set(path, file);
  }

  it('lists no path without a page route', () => {
    const ghosts = [...CACHEABLE_ANON_PATHS].filter((path) => !byPath.has(path));
    expect(
      ghosts,
      'These are edge-cached in server/nitro/anon-html-cache.ts but have no route.',
    ).toEqual([]);
  });

  it('lists no path that only redirects (a 3xx is not cacheable HTML)', () => {
    const redirects = [...CACHEABLE_ANON_PATHS].filter((path) => {
      const file = byPath.get(path);
      if (!file) return false;
      const src = readFileSync(file, 'utf8');
      return (
        /beforeLoad:[\s\S]{0,240}?throw redirect\(/.test(src) && !/\bcomponent:\s*\w/.test(src)
      );
    });
    expect(redirects, 'These redirect rather than render — remove them.').toEqual([]);
  });

  it('has at least one real route under every prefix', () => {
    const empty = CACHEABLE_ANON_PREFIXES.filter(
      (prefix) => ![...byPath.keys()].some((path) => path.startsWith(prefix)),
    );
    expect(empty, 'These prefixes are edge-cached but match no route.').toEqual([]);
  });
});

/**
 * The origin decides what MAY be shared; the Cloudflare cache rule decides what
 * the edge actually stores. They are written in two different languages in two
 * different files, so nothing but a test keeps them aligned.
 *
 * Drift in one direction is harmless and in the other is merely wasteful:
 *   - edge NARROWER than origin → the extra origin paths are never cached, so
 *     the plugin change is silently inert (this is exactly what happened when
 *     the path set was widened and the rule was left scoped to "/").
 *   - edge WIDER than origin  → the origin still refuses to mark those
 *     responses `public`, and the rule respects origin Cache-Control, so
 *     nothing unsafe is stored — it just never hits.
 *
 * Neither is a data leak, which is why this is a plain equality check rather
 * than a safety assertion. It exists so the inert case is caught at CI time
 * instead of by wondering why the cache-hit ratio never moved.
 */
describe('cloudflare cache rule stays in sync with the origin allowlist', () => {
  const script = readFileSync(
    join(process.cwd(), 'deploy/apply-cloudflare-cache-rules.sh'),
    'utf8',
  );
  const htmlRule = script
    .split('\n')
    .find((line) => line.includes('"expression"') && line.includes('session_token'));

  it('has an HTML cache rule to check', () => {
    expect(htmlRule, 'No cookie-gated HTML rule found in the Cloudflare script.').toBeDefined();
  });

  it('matches every exact path the origin will mark public', () => {
    const missing = [...CACHEABLE_ANON_PATHS].filter(
      (path) => !htmlRule?.includes(`\\"${path}\\"`),
    );
    expect(
      missing,
      'The origin marks these edge-cacheable but the Cloudflare rule does not match them, so they are never cached.',
    ).toEqual([]);
  });

  it('matches every prefix the origin will mark public', () => {
    const missing = CACHEABLE_ANON_PREFIXES.filter(
      (prefix) => !htmlRule?.includes(`starts_with(http.request.uri.path, \\"${prefix}\\")`),
    );
    expect(
      missing,
      'These prefixes are edge-cacheable at the origin but unmatched at the edge.',
    ).toEqual([]);
  });

  it('still bypasses cache on the session and locale cookies', () => {
    expect(htmlRule).toContain('session_token');
    expect(htmlRule).toContain('rmh-lang=');
  });
});

/**
 * No NON-HTML cache rule may capture a path the origin serves as HTML.
 *
 * ## The bug this exists to stop
 *
 * On 2026-08-11 the zone carried a hand-made rule called "CDN static assets"
 * whose expression was `URI Path starts with /library` (plus `/music`, `/models`,
 * `/sprites`). `/library` is **not** a static directory — there is no
 * `public/library` — it is an app route tree (`_site/library/index.tsx`,
 * `library.$slug.tsx`, `library.albums.$albumId.tsx`) whose loader resolves a
 * session and branches on `isAdmin`. So a rule meant for game audio was
 * governing per-viewer HTML, with no cookie bypass, ahead of the rule that has
 * one. `starts with /music` likewise swallowed `/music-trivia`.
 *
 * It was not a live leak, and the reason matters: every rule in the phase uses
 * `edge_ttl: respect_origin`, so the origin's `private, no-cache` on
 * authenticated HTML refused the store. But that is one dropdown away from being
 * one — "Ignore cache-control header and use this TTL" is the natural thing to
 * reach for on a rule named "CDN static assets", and choosing it would have
 * published one viewer's library (possibly an admin's) to everyone.
 *
 * A prefix that overlaps an HTML route is therefore treated as a bug in its own
 * right, independent of the TTL mode that currently makes it harmless. Trailing
 * slashes are the fix and the thing asserted: `/music/` cannot match
 * `/music-trivia`, while `/music` can.
 *
 * Scope note: this parses the committed script, so it constrains what the repo
 * will apply — it cannot see a rule someone adds only in the dashboard. That gap
 * is why the script's header says the PUT replaces the whole phase.
 */
describe('no static-asset cache rule may capture an HTML route', () => {
  const rules: { description: string; expression: string }[] = (() => {
    const script = readFileSync(
      join(process.cwd(), 'deploy/apply-cloudflare-cache-rules.sh'),
      'utf8',
    );
    // The heredoc body is real JSON once the shell quoting is stripped.
    const body = script.split("read -r -d '' BODY <<'JSON' || true\n")[1]?.split('\nJSON')[0];
    return JSON.parse(body ?? '{"rules":[]}').rules;
  })();

  /** The cookie-gated HTML rule is the one allowed to match HTML paths. */
  const isHtmlRule = (r: { expression: string }) => r.expression.includes('session_token');

  /** Every `starts_with(http.request.uri.path, "X")` prefix in an expression. */
  const prefixesOf = (expression: string): string[] =>
    [...expression.matchAll(/starts_with\(http\.request\.uri\.path,\s*"([^"]+)"\)/g)].map(
      (m) => m[1],
    );

  it('found the rules to check (a silent parse failure would pass vacuously)', () => {
    expect(rules.length).toBeGreaterThan(1);
    expect(rules.filter(isHtmlRule)).toHaveLength(1);
  });

  it('no non-HTML rule matches an exact allowlisted HTML path', () => {
    const collisions: string[] = [];
    for (const rule of rules.filter((r) => !isHtmlRule(r))) {
      for (const prefix of prefixesOf(rule.expression)) {
        for (const path of CACHEABLE_ANON_PATHS) {
          if (path.startsWith(prefix)) collisions.push(`${rule.description}: "${prefix}" ⊃ ${path}`);
        }
      }
    }
    expect(
      collisions,
      'A static-asset rule matches an HTML path the origin marks shareable. Whichever ' +
        'rule wins, the HTML is now governed by a rule with no cookie bypass — add a ' +
        'trailing slash so the prefix means "files under this directory".',
    ).toEqual([]);
  });

  it('no non-HTML rule matches an allowlisted HTML prefix', () => {
    const collisions: string[] = [];
    for (const rule of rules.filter((r) => !isHtmlRule(r))) {
      for (const prefix of prefixesOf(rule.expression)) {
        for (const htmlPrefix of CACHEABLE_ANON_PREFIXES) {
          // Either direction is an overlap: the static prefix may sit above the
          // article subtree or inside it.
          if (htmlPrefix.startsWith(prefix) || prefix.startsWith(htmlPrefix)) {
            collisions.push(`${rule.description}: "${prefix}" overlaps ${htmlPrefix}`);
          }
        }
      }
    }
    expect(collisions, 'A static-asset rule overlaps the article subtrees.').toEqual([]);
  });

  it('static-media prefixes end in a slash, so they cannot swallow a sibling route', () => {
    // `/music` matches `/music-trivia`; `/music/` cannot. This is the whole fix,
    // so it is asserted directly rather than left implicit in the collision
    // checks above — a future prefix pointing at a directory with no sibling
    // route today would otherwise be free to omit it.
    const bare: string[] = [];
    for (const rule of rules.filter((r) => !isHtmlRule(r))) {
      // The image-transform rule targets API path stems, not directories, and is
      // matched against `/api/...` routes that are never HTML.
      if (rule.expression.includes('/api/')) continue;
      for (const prefix of prefixesOf(rule.expression)) {
        if (!prefix.endsWith('/')) bare.push(`${rule.description}: "${prefix}"`);
      }
    }
    expect(
      bare,
      'These path prefixes have no trailing slash, so they also match sibling routes ' +
        'that merely start with the same characters.',
    ).toEqual([]);
  });

  it('every rule respects the origin Cache-Control in both directions', () => {
    // The origin is the final gate on what may be stored: it is what refuses to
    // share authenticated HTML. An explicit TTL override on any rule removes that
    // gate, which is what would promote a prefix overlap into a cross-user leak.
    const script = readFileSync(
      join(process.cwd(), 'deploy/apply-cloudflare-cache-rules.sh'),
      'utf8',
    );
    const body = script.split("read -r -d '' BODY <<'JSON' || true\n")[1]?.split('\nJSON')[0];
    const parsed = JSON.parse(body ?? '{"rules":[]}').rules as {
      description: string;
      action_parameters?: {
        edge_ttl?: { mode?: string };
        browser_ttl?: { mode?: string };
      };
    }[];

    const overrides = parsed.flatMap((rule) =>
      (['edge_ttl', 'browser_ttl'] as const)
        .filter((key) => {
          const mode = rule.action_parameters?.[key]?.mode;
          return mode !== undefined && mode !== 'respect_origin';
        })
        .map((key) => `${rule.description}.${key}=${rule.action_parameters?.[key]?.mode}`),
    );
    expect(
      overrides,
      'A TTL override ignores the origin Cache-Control, including the `private, no-cache` ' +
        'that keeps authenticated HTML out of the shared cache.',
    ).toEqual([]);
  });
});
