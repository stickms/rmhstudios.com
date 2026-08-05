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
