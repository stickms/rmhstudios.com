import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * zod stays off the routes people actually land on.
 *
 * `scripts/check-entry-composition.ts` keeps zod out of the ENTRY chunk, but
 * that only covers the shell. Each route's component chunk is its own critical
 * path, and until 2026-10-21 the home feed, explore, tag, thread, post, profile,
 * community and messages routes each loaded the full zod runtime (`schemas-*`,
 * 72 KB raw / 17 KB brotli) — not to validate anything, but because a
 * component imported one constant from a module that also declared an API
 * input schema. Every one of those schemas ran only inside an API handler.
 *
 * The fix was the repo's existing pair convention (`lib/CLAUDE.md`): a
 * zod-free module for constants, helpers and types (`foo.ts`), and a sibling
 * `foo-schema.ts` / `schema.ts` that the API routes import. This gate walks the
 * static import graph from each route below — the same graph the bundler sees,
 * minus `.server` modules (stubbed on the client) and `import()` (a separate
 * chunk) — and fails if any module on it imports zod.
 *
 * If this fails: the chain in the message shows which import brought zod in.
 * Move the schema out of that module, or move the component's import to the
 * zod-free half. Do not add the route to an allowlist — there isn't one.
 */

const REPO = resolve(dirname(new URL(import.meta.url).pathname), '../..');

const HOT_ROUTES = [
  'app/routes/__root.tsx',
  'app/routes/_site.tsx',
  'app/client.tsx',
  'app/routes/_site/index.tsx',
  'app/routes/_site/explore.tsx',
  'app/routes/_site/tag.$tag.tsx',
  'app/routes/_site/thread/$rootId.tsx',
  'app/routes/_site/u/$userid/index.tsx',
  'app/routes/_site/u/$userid/post/$postid.tsx',
  'app/routes/_site/c.$slug.tsx',
  'app/routes/_site/communities.tsx',
  'app/routes/_site/messages/index.tsx',
  'app/routes/_site/messages/$conversationId.tsx',
  'app/routes/_site/notifications.tsx',
  // Second tier — same fix, same day. (`rmhladder/jobs/$jobId` is absent on
  // purpose: its loader imports `lib/rmhladder/server/actions.ts`, which is zod
  // but runs only in a server function, so the bundler drops it from the
  // client chunk while this source-level walk cannot tell.)
  'app/routes/_site/builds/$slug.tsx',
  'app/routes/_site/canvas.tsx',
  'app/routes/_site/changelog.tsx',
  'app/routes/_site/connections.index.tsx',
  'app/routes/_site/connections.new.tsx',
  'app/routes/_site/connections.u.$id.tsx',
  'app/routes/_site/create/earnings.tsx',
  'app/routes/_site/developer/index.tsx',
  'app/routes/_site/emoji-packs.tsx',
  'app/routes/_site/exchange.$id.tsx',
  'app/routes/_site/feeds.$id.tsx',
  'app/routes/_site/feeds.index.tsx',
  'app/routes/_site/history.tsx',
  'app/routes/_site/homes/listing.$id.tsx',
  'app/routes/_site/hunt.tsx',
  'app/routes/_site/office-hours/index.tsx',
  'app/routes/_site/photo-of-the-day.tsx',
  'app/routes/_site/rings/index.tsx',
  'app/routes/_site/rmhbox-packs.tsx',
  'app/routes/_site/rmhladder/referrals.tsx',
  'app/routes/_site/settings/layout.tsx',
  'app/routes/_site/settings/notifications.tsx',
  'app/routes/_site/settings/privacy.tsx',
  'app/routes/_site/settings/profile.tsx',
  'app/routes/_site/settings/security.tsx',
  'app/routes/_site/trash.tsx',
  'app/routes/_site/user-builds/$slug.tsx',
  'app/routes/_site/user-builds/submit.tsx',
];

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'];

function resolveSpecifier(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(REPO, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  return null;
}

// Value imports/re-exports (a `type`-only statement is erased and skipped), plus
// bare side-effect imports. `[^;]*?` spans multi-line import lists.
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\b(\s+type\b)?[^;]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
const ZOD_RE = /(?:^|\n)\s*import\s+(?!type\b)[^;]*?from\s*['"]zod(?:\/[\w/-]+)?['"]/;

/** Every zod-importing module reachable from `roots`, each with its import chain. */
function zodCarriers(roots: string[]): string[] {
  const parent = new Map<string, string | null>();
  const queue = roots.map((r) => join(REPO, r));
  for (const r of queue) parent.set(r, null);
  const found: string[] = [];
  while (queue.length) {
    const file = queue.shift()!;
    if (/\.server\.[jt]sx?$/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    if (ZOD_RE.test(src)) found.push(file);
    for (const m of src.matchAll(IMPORT_RE)) {
      if (m[1]) continue;
      const next = resolveSpecifier(file, m[2] ?? m[3]);
      if (next && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return found.map((f) => {
    const chain: string[] = [];
    for (let c: string | null | undefined = f; c; c = parent.get(c)) chain.unshift(relative(REPO, c));
    return chain.join(' → ');
  });
}

describe('zod off the hot routes', () => {
  it('the walker sees zod when it is there (the gate is not vacuous)', () => {
    expect(zodCarriers(['lib/posts-plus/schema.ts'])).toEqual(['lib/posts-plus/schema.ts']);
    // ...and follows `@/` + relative imports into it.
    expect(zodCarriers(['lib/rmhark-schema.ts']).length).toBeGreaterThan(1);
  });

  it.each(HOT_ROUTES)('%s reaches no zod-importing module', (route) => {
    expect(zodCarriers([route])).toEqual([]);
  });
});
