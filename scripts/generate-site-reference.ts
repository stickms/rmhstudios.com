/**
 * Generates the exhaustive site reference under `docs/site-reference/` by
 * walking the real route tree and the product catalogs:
 *
 *   app/routes/**            → every page route and every API route
 *   lib/games.ts             → the game catalog
 *   lib/apps.ts              → the app catalog
 *
 * The point is completeness. Hand-written docs explain *why* something works
 * the way it does; this generator guarantees that nothing on the site is
 * simply absent from the documentation, and that the inventory can't rot —
 * `pnpm docs:site --check` fails the build when the tree and the docs disagree.
 *
 *     pnpm docs:site
 *     pnpm docs:site --check
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { games } from '../lib/games';
import { apps } from '../lib/apps';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTES = join(ROOT, 'app', 'routes');
const OUT = join(ROOT, 'docs', 'site-reference');

const CHECK = process.argv.includes('--check');
const stale: string[] = [];

const GENERATED_HEADER = [
  '<!--',
  '  GENERATED FILE — do not edit by hand.',
  '  Source: app/routes/, lib/games.ts, lib/apps.ts.',
  '  Regenerate with `pnpm docs:site`.',
  '-->',
  '',
].join('\n');

function emit(path: string, content: string): void {
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (previous === content) return;
  if (CHECK) {
    stale.push(relative(ROOT, path));
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

/* ── route walking ───────────────────────────────────────────────────────── */

interface RouteFile {
  /** Path relative to app/routes, without extension. */
  id: string;
  file: string;
  isApi: boolean;
}

/** Route ids that also exist as a directory — `rmhbox.tsx` beside `rmhbox/`. */
const layoutIds = new Set<string>();

function walk(dir: string, acc: RouteFile[] = []): RouteFile[] {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      layoutIds.add(relative(ROUTES, full));
      walk(full, acc);
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    const rel = relative(ROUTES, full);
    const id = rel.replace(/\.tsx?$/, '');
    if (id === '__root' || id === 'routeTree.gen') continue;
    acc.push({ id, file: `app/routes/${rel}`, isApi: id === 'api' || id.startsWith(`api/`) });
  }
  return acc;
}

/**
 * Turn a TanStack Start route file id into the URL it serves.
 *
 * The naming rules are in app/CLAUDE.md: `.` is a path separator, `$x` is a
 * param, `[.]` escapes a literal character, a leading `_` is a pathless
 * layout segment, a trailing `_` opts out of parent nesting, `index` is a
 * directory index and `route` is a layout wrapper.
 */
function toUrl(id: string): { url: string; kind: 'page' | 'layout' | 'api' } {
  const basename = id.split('/').pop() ?? id;
  // `route.tsx` wraps a directory; a leading `_` marks a pathless layout
  // (`_site.tsx`). Neither serves a page of its own.
  const isLayout = basename === 'route' || basename.startsWith('_');

  // `[.]` escapes a literal character (`sitemap[.]xml`). Lift those out before
  // splitting on `.`, which is the path separator, then put them back.
  const escaped = new Map<string, string>();
  let work = id.replace(/\[(.)\]/g, (_m, char: string) => {
    const token = `EsCaPeD${escaped.size}`;
    escaped.set(token, char);
    return token;
  });

  work = work.replace(/\./g, '/');

  const segments = work
    .split('/')
    .filter((s) => s !== '' && s !== 'index' && s !== 'route')
    // Pathless layout segments (`_site`) contribute no URL.
    .filter((s) => !s.startsWith('_'))
    // A trailing `_` only opts out of layout nesting; it isn't in the URL.
    .map((s) => s.replace(/_$/, ''))
    .map((s) => {
      let out = s;
      for (const [token, char] of escaped) out = out.replace(token, char);
      return out;
    })
    .map((s) => (s.startsWith('$') ? (s === '$' ? '*' : `:${s.slice(1)}`) : s));

  const url = '/' + segments.join('/');
  return {
    url: url === '/' ? '/' : url.replace(/\/+$/, ''),
    kind: id.startsWith('api/') ? 'api' : isLayout ? 'layout' : 'page',
  };
}

/** HTTP methods a route file handles, read from its `server.handlers` block. */
function methodsOf(file: string): string[] {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const found = new Set<string>();
  for (const m of source.matchAll(/\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*:/g)) {
    found.add(m[1]);
  }
  return [...found].sort();
}

type Gate = 'admin' | 'required' | null;

/** The gate a single route file applies, if any. */
function gateOf(file: string): Gate {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const redirects = /throw redirect\(|redirect\(\{/.test(source);
  // The admin gate bounces non-admins to `/`, not to `/login`, so keying on
  // the login path alone would report every admin page as public.
  if (redirects && /isAdmin/.test(source)) return 'admin';
  if (
    /redirect\(\{[^}]*to:\s*['"]\/login/.test(source) ||
    /requireSession|requireUser/.test(source)
  ) {
    return 'required';
  }
  return null;
}

/**
 * The effective gate on a page, including gates inherited from the layout
 * routes above it — `/admin/*` is gated once in `_site/admin/route.tsx`, not
 * in each of its 30 pages, so reading the leaf file alone reports it as open.
 */
function effectiveGate(id: string, byId: Map<string, RouteFile>): Gate {
  const parts = id.split('/');
  let strongest: Gate = null;
  for (let i = parts.length; i > 0; i--) {
    const prefix = parts.slice(0, i).join('/');
    // The file itself, plus the layout that wraps its directory.
    for (const candidate of [prefix, `${prefix}/route`]) {
      const route = byId.get(candidate);
      if (!route) continue;
      const gate = gateOf(route.file);
      if (gate === 'admin') return 'admin';
      if (gate === 'required') strongest = 'required';
    }
  }
  return strongest;
}

/**
 * Where a pure redirect route sends visitors. Some URLs exist only to keep an
 * old link alive (`/wallet` → `/predictions`); listing them as ordinary pages
 * would imply they render something.
 *
 * The search params are part of the destination, not decoration: several of
 * these routes exist precisely to land on one *tab* of a merged page
 * (`/notifications` → the Inbox's notifications tab, `/leaderboard` → the
 * Arcade board inside Create). Reporting the bare path made two of those read
 * as if they dropped you at the top of a page they do not drop you at — and
 * because that detail was hand-written into the generated file instead, the
 * check drifted out of sync the moment anyone re-ran the generator.
 *
 * Only literal, unconditional params are read. A spread or a ternary
 * (`...(x ? { sub } : {})`) depends on the incoming URL, so there is no single
 * answer to print and the extras are left off rather than guessed at.
 */
function redirectTarget(file: string): string | null {
  const source = readFileSync(join(ROOT, file), 'utf8');
  if (/getSession|isAdmin/.test(source)) return null; // conditional, not a pure redirect
  const match = source.match(/throw redirect\(\{\s*to:\s*['"]([^'"]+)['"]/);
  if (!match) return null;

  const to = match[1];
  const search = searchObjectAfter(source, match.index! + match[0].length);
  if (search === null) return to;

  // Drop conditional spreads before reading the literals: `/arcade` passes
  // `tab: 'games'` always and `sub` only when it was itself asked for that
  // board, so the spread is not part of "where this URL sends you".
  const literals = search.replace(/\.\.\.\([\s\S]*?\)\s*,?/g, '');
  const params = [...literals.matchAll(/(\w+)\s*:\s*['"]([^'"]+)['"]/g)]
    .map(([, key, value]) => `${key}=${value}`)
    .join('&');
  return params ? `${to}?${params}` : to;
}

/**
 * The body of the `search: { … }` object following a redirect's `to:`, or null
 * when the redirect carries no search. Brace-counted rather than matched with a
 * regex because these objects nest (a conditional spread is itself an object).
 */
function searchObjectAfter(source: string, from: number): string | null {
  const key = source.slice(from).match(/^\s*,\s*search:\s*\{/);
  if (!key) return null;
  const open = from + key[0].length; // first char inside the `{`
  let depth = 1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i);
  }
  return null; // unbalanced — treat as no search rather than guessing
}

/** The page's title, taken from its `head()` meta if present. */
function titleOf(file: string): string {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const meta = source.match(/title:\s*['"`]([^'"`]+)['"`]/);
  if (!meta) return '';
  // Dynamic pages build their title from loader data; a captured
  // `${loaderData?.title ?? …}` fragment is noise, not a page name.
  if (meta[1].includes('${')) return '';
  return meta[1].replace(/\s*\|\s*RMH Studios\s*$/, '').trim();
}

/* ── page inventory ──────────────────────────────────────────────────────── */

function renderPages(routes: RouteFile[]): string {
  const byId = new Map(routes.map((r) => [r.id, r]));
  const pages = routes
    .filter((r) => !r.isApi)
    .map((r) => ({ ...r, ...toUrl(r.id) }))
    // `rmhbox.tsx` beside a `rmhbox/` directory wraps that directory — the page
    // itself is `rmhbox/index.tsx`, so listing both would double-count the URL.
    .filter((r) => r.kind !== 'layout' && !layoutIds.has(r.id))
    .map((r) => ({ ...r, gate: effectiveGate(r.id, byId) }))
    .sort((a, b) => a.url.localeCompare(b.url));

  // `_site/` pages get the sidebar shell; top-level routes are full-screen.
  const shelled = pages.filter((p) => p.id.startsWith('_site'));
  const fullScreen = pages.filter((p) => !p.id.startsWith('_site'));

  const out: string[] = [GENERATED_HEADER];
  out.push('# Page routes');
  out.push('');
  out.push(
    `Every page the site serves — ${pages.length} routes. ` +
      `${shelled.length} render inside the standard site shell (sidebar, nav, context rail); ` +
      `${fullScreen.length} are full-screen, which is how games, the login page and the legal pages are meant to render. ` +
      'Placement decides chrome: a file under `app/routes/_site/` gets the shell, a top-level file does not.',
  );
  out.push('');
  out.push('Params appear as `:name`; `*` is a catch-all splat.');
  out.push('');
  out.push(
    '**Access** is derived from the route file and every layout above it: `admin` (bounced unless ' +
      '`isAdmin`), `sign-in` (redirected to `/login`), or `public`. `public` describes the *route*, ' +
      'not necessarily everything on it — several public pages render a sign-in prompt in place of ' +
      'their content rather than redirecting, `/developer` being one.',
  );
  out.push('');

  const section = (title: string, rows: typeof pages, note: string) => {
    out.push(`## ${title}`);
    out.push('');
    out.push(note);
    out.push('');
    out.push('| URL | Title | Access | Source |');
    out.push('| --- | ----- | ------ | ------ |');
    for (const p of rows) {
      const to = redirectTarget(p.file);
      const title = to ? `redirects to \`${to}\`` : titleOf(p.file) || '—';
      const access = p.gate === 'admin' ? 'admin' : p.gate === 'required' ? 'sign-in' : 'public';
      out.push(`| \`${p.url}\` | ${cell(title)} | ${access} | \`${p.file}\` |`);
    }
    out.push('');
  };

  section('Site shell', shelled, 'Standard pages, rendered inside the sidebar shell.');
  section(
    'Full-screen',
    fullScreen,
    'Games, apps and standalone pages that intentionally render without the site shell.',
  );

  return out.join('\n');
}

/* ── API inventory ───────────────────────────────────────────────────────── */

function renderApi(routes: RouteFile[]): string {
  const api = routes
    .filter((r) => r.isApi)
    .map((r) => ({ ...r, ...toUrl(r.id), methods: methodsOf(r.file) }))
    .sort((a, b) => a.url.localeCompare(b.url));

  const groups = new Map<string, typeof api>();
  for (const route of api) {
    // Group by the first segment after /api, e.g. /api/v1/... → v1.
    const group = route.url.split('/')[2] ?? 'root';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(route);
  }

  const out: string[] = [GENERATED_HEADER];
  out.push('# API routes');
  out.push('');
  out.push(
    `Every server route in the app tier — ${api.length} files across ${groups.size} groups. ` +
      'This is the whole internal surface, not just the public developer API: ' +
      'the public, versioned, key-authenticated subset is `/api/v1/*`, documented in ' +
      '[the developer API reference](../developer-api/endpoints/index.md). ' +
      'Everything else is session-authenticated and internal — treat it as unstable.',
  );
  out.push('');
  out.push(
    "Methods are read from each file's `server.handlers` block. A route with no methods listed " +
      'exports a handler built by a wrapper (for example the developer API `withDeveloperApi`).',
  );
  out.push('');

  for (const group of [...groups.keys()].sort()) {
    const rows = groups.get(group)!;
    out.push(`## \`/api/${group}\``);
    out.push('');
    out.push(`${rows.length} route${rows.length === 1 ? '' : 's'}.`);
    out.push('');
    out.push('| Route | Methods | Source |');
    out.push('| ----- | ------- | ------ |');
    for (const r of rows) {
      out.push(
        `| \`${r.url}\` | ${r.methods.length ? r.methods.map((m) => `\`${m}\``).join(' ') : '—'} | \`${r.file}\` |`,
      );
    }
    out.push('');
  }

  return out.join('\n');
}

/* ── catalogs ────────────────────────────────────────────────────────────── */

function renderCatalog(
  kind: 'Games' | 'Apps',
  items: {
    id: string;
    title: string;
    description: string;
    longDescription: string;
    href: string;
    status?: string;
    tags: string[];
    authGate: boolean;
    unlisted?: boolean;
    hidden?: boolean;
  }[],
  source: string,
  blurb: string,
): string {
  const listed = items.filter((i) => !i.unlisted && !i.hidden);
  const hidden = items.filter((i) => i.unlisted || i.hidden);

  const out: string[] = [GENERATED_HEADER];
  out.push(`# ${kind}`);
  out.push('');
  out.push(blurb);
  out.push('');
  out.push(
    `Generated from \`${source}\`, the single source of truth every card on the site reads from.`,
  );
  out.push('');

  out.push('| | Route | Status | Auth | Tags |');
  out.push('| --- | ----- | ------ | ---- | ---- |');
  for (const i of listed) {
    out.push(
      `| **${cell(i.title)}** | [\`${i.href}\`](https://rmhstudios.com${i.href}) | ${
        i.status ? cell(i.status) : '—'
      } | ${i.authGate ? 'required' : '—'} | ${i.tags.map((t) => `\`${t}\``).join(' ')} |`,
    );
  }
  out.push('');

  if (hidden.length) {
    out.push(`## Unlisted`);
    out.push('');
    out.push(
      'Reachable by URL but deliberately absent from the browse pages — hidden games and internal or ' +
        'staged experiences. They are documented here because "undocumented" and "unlisted" are not the same thing.',
    );
    out.push('');
    out.push('| | Route | Status |');
    out.push('| --- | ----- | ------ |');
    for (const i of hidden) {
      out.push(`| **${cell(i.title)}** | \`${i.href}\` | ${i.status ? cell(i.status) : '—'} |`);
    }
    out.push('');
  }

  out.push('## Detail');
  out.push('');
  for (const i of [...listed, ...hidden]) {
    out.push(`### ${i.title}`);
    out.push('');
    out.push(i.longDescription || i.description);
    out.push('');
    const facts = [
      `**Route:** \`${i.href}\``,
      `**Catalog id:** \`${i.id}\``,
      i.status ? `**Status:** ${i.status}` : '',
      `**Sign-in:** ${i.authGate ? 'required' : 'not required'}`,
      i.unlisted || i.hidden ? '**Unlisted**' : '',
    ].filter(Boolean);
    out.push(facts.join(' · '));
    out.push('');
  }

  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}

/* ── main ────────────────────────────────────────────────────────────────── */

const routes = walk(ROUTES);

emit(join(OUT, 'pages.md'), renderPages(routes));
emit(join(OUT, 'api.md'), renderApi(routes));
emit(
  join(OUT, 'games.md'),
  renderCatalog(
    'Games',
    games,
    'lib/games.ts',
    'Every game on the platform — browser games of every shape: real-time multiplayer, 3D, puzzle, casino, idle and narrative.',
  ),
);
emit(
  join(OUT, 'apps.md'),
  renderCatalog(
    'Apps',
    apps,
    'lib/apps.ts',
    'The full applications that sit alongside the games — synced media, learning and productivity tools, and the creator surfaces.',
  ),
);

if (CHECK && stale.length) {
  console.error('Site reference is out of date. Run `pnpm docs:site` and commit:');
  for (const f of stale) console.error(`  ${f}`);
  process.exit(1);
}

const pageCount = routes.filter((r) => !r.isApi).length;
const apiCount = routes.filter((r) => r.isApi).length;
process.stdout.write(
  (CHECK
    ? 'Site reference is up to date.'
    : `Wrote site reference: ${pageCount} page route files, ${apiCount} API route files, ${games.length} games, ${apps.length} apps.`) +
    '\n',
);
