/**
 * OPT-02 — entry-chunk composition guard (docs/optimization-ideas-2026-08-05.md).
 *
 * OPT-01 (scripts/check-bundle-budget.ts) catches the SYMPTOM — bytes. This
 * catches the CAUSE: a package that must never sit in the entry chunk's static
 * closure, named together with the source file that imported it.
 *
 *   pnpm run check:entry-composition            # report + fail on a violation
 *   pnpm run check:entry-composition --strict   # additionally REQUIRE sourcemaps
 *   pnpm run check:entry-composition --top=40   # widen the composition table
 *
 * ── Requires a sourcemap build ────────────────────────────────────────────
 * The client build is minified with no module boundaries left in it (verified:
 * zero `//#region` markers, no `node_modules` strings), so the ONLY way to know
 * which package a byte came from is `<chunk>.js.map`. `vite.config.ts` sets
 * `build.sourcemap: false`, so a plain `pnpm build` emits none.
 *
 * Run the build with the flag — `pnpm run build:frontend:sourcemap`, which is
 * what `.github/workflows/web-ci.yml` uses so that ONE build feeds both gates.
 * Without maps this script says so and exits 0 (so a plain local `pnpm build`
 * is not a spurious failure); with `--strict` it exits 1 instead.
 *
 * Byte attribution decodes each chunk's `mappings` and charges the bytes
 * between consecutive segments to `sources[sourceIndex]` — the same method
 * docs/performance-audit-2026-08-04.md used by hand to find the Discord SDK.
 */
/* eslint-disable no-console -- CI reporter intentionally writes a human-readable report */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { findClientEntry, readChunk, staticClosure } from './check-bundle-budget';

const ROOT = process.env.BUNDLE_BUDGET_ROOT || process.cwd();
const OUT_DIR = path.join(ROOT, '.output', 'public');

/**
 * Packages that must NEVER appear in the entry chunk's static closure.
 * Each entry names WHY, so a future failure is self-explaining. Adding a name
 * here is cheap; removing one requires a measurement.
 *
 * Every name below was verified against a real build on 2026-08-05: all ten are
 * declared dependencies, and all except `zod` and `pixi.js` were found sitting
 * correctly in ASYNC chunks — i.e. each tripwire guards a payload that really
 * exists and really is split today, so none of them is a dead entry.
 * `pixi.js` is absent from the client graph entirely (it is built separately
 * into `public/vibe-packages` by `scripts/build-vibe-packages.ts`); it stays
 * listed so that importing it into the app graph trips the wire.
 * `zod` is a live violation — see KNOWN_VIOLATIONS.
 */
const FORBIDDEN: Record<string, string> = {
  '@discord/embedded-app-sdk': 'Discord Activity only — /discord/* loads it itself',
  three: 'route-only 3D — must stay behind a lazy() boundary',
  'pixi.js': 'route-only 2D renderer',
  tone: 'route-only audio engine',
  'twemoji-parser': 'one minigame history view',
  '@twemoji/api': 'post-hydration only',
  'web-vitals': 'dynamically imported by lib/rum.ts on purpose',
  zod: 'validators belong in *-schema.ts split points, not the shell',
  'emoji-picker-react': 'composer-only',
  'maplibre-gl': 'map routes only',
};

/**
 * Dated baseline for violations that are ALREADY on main, so this gate can be
 * turned on without going red on day one — a ratchet, not an amnesty.
 *
 * The cap is enforced in both directions:
 *   • over the cap  → FAIL (the violation grew)
 *   • not present   → FAIL, asking you to DELETE the entry (it was fixed)
 * so a stale baseline cannot quietly become permanent.
 *
 * `zod` (71,421 B / 69.7 KB, measured 2026-08-05): a REGRESSION against
 * docs/performance-audit-2026-08-04.md §2, which removed a 69.7 KB zod chunk
 * from the critical path by splitting shell schemas into `*-schema.ts`
 * siblings. It is back, at almost exactly the same weight, via NINE
 * module-scope `import { z } from 'zod'` sites that the entry reaches:
 *
 *   lib/catalog/types.ts:24          (entry → apps-*.js → schemas-*.js)
 *   lib/game/replay.ts:22
 *   app/routes/_site/rmhladder/{alerts,companies,jobs,pipeline,review,settings}.tsx
 *   app/routes/_site/rmhladder/jobs/$jobId.tsx
 *
 * The route files count because `app/routeTree.gen.ts` imports all 739 route
 * modules statically, so a top-level import in ANY route module is on every
 * page. Module-scope `z.object(...)` calls are not tree-shakeable, so the whole
 * validator rides the shell.
 *
 * Fix: move each schema into a `*-schema.ts` sibling (the convention the 08-04
 * audit established) and keep plain TypeScript types in the runtime module.
 * Then delete this entry — the check below will insist on it.
 */
const KNOWN_VIOLATIONS: Record<string, { maxBytes: number; note: string }> = {
  zod: {
    maxBytes: 74_000, // measured 71,421 B on 2026-08-05 + a ~3.6% band
    note: 'pre-existing regression — 9 module-scope `import { z } from "zod"` sites on the critical path',
  },
};

type SourceMap = {
  sources: string[];
  sourcesContent?: (string | null)[];
  mappings: string;
};

const BASE64 = new Map(
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]),
);

/** Decode one VLQ value starting at `pos`; returns the value and the next pos. */
function decodeVlq(segment: string, pos: number): [number, number] {
  let result = 0;
  let shift = 0;
  let cont = 1;
  while (cont) {
    const digit = BASE64.get(segment[pos++]);
    if (digit === undefined) throw new Error(`bad VLQ in "${segment}"`);
    cont = digit & 32;
    result += (digit & 31) << shift;
    shift += 5;
  }
  const negative = result & 1;
  result >>= 1;
  return [negative ? -result : result, pos];
}

/**
 * Charge every generated byte of `chunk` to the source it came from: within a
 * generated line, the bytes from one mapping segment to the next belong to that
 * segment's source. Returns null when the chunk has no `.map` beside it.
 */
function attributeBytes(chunkRel: string): Map<string, number> | null {
  const mapPath = path.join(OUT_DIR, `${chunkRel}.map`);
  if (!existsSync(mapPath)) return null;
  const map = JSON.parse(readFileSync(mapPath, 'utf8')) as SourceMap;
  const lines = readChunk(OUT_DIR, chunkRel).toString('utf8').split('\n');

  const bytes = new Map<string, number>();
  let sourceIndex = 0;
  const groups = map.mappings.split(';');
  for (let line = 0; line < groups.length; line++) {
    const group = groups[line];
    if (!group) continue;
    const lineLength = lines[line]?.length ?? 0;
    let generatedCol = 0;
    const segments: Array<[number, number | null]> = [];
    for (const segment of group.split(',')) {
      if (!segment) continue;
      let pos = 0;
      let value: number;
      [value, pos] = decodeVlq(segment, pos);
      generatedCol += value;
      let source: number | null = null;
      if (pos < segment.length) {
        [value, pos] = decodeVlq(segment, pos);
        sourceIndex += value;
        source = sourceIndex;
        [, pos] = decodeVlq(segment, pos); // source line
        [, pos] = decodeVlq(segment, pos); // source column
        if (pos < segment.length) [, pos] = decodeVlq(segment, pos); // name index
      }
      segments.push([generatedCol, source]);
    }
    for (let i = 0; i < segments.length; i++) {
      const [col, source] = segments[i];
      if (source === null) continue;
      const end = i + 1 < segments.length ? segments[i + 1][0] : lineLength;
      const name = map.sources[source] ?? '(unknown)';
      bytes.set(name, (bytes.get(name) ?? 0) + Math.max(0, end - col));
    }
  }
  return bytes;
}

/** `…/node_modules/@scope/name/dist/x.js` → `@scope/name`; null for first-party. */
function packageOf(source: string): string | null {
  const marker = source.lastIndexOf('node_modules/');
  if (marker < 0) return null;
  const parts = source.slice(marker + 'node_modules/'.length).split('/');
  if (parts.length === 0) return null;
  return parts[0].startsWith('@') && parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** Strip the `../../../` prefix sourcemaps use to climb out of the out dir. */
function tidySource(source: string): string {
  return source.replace(/^(\.\.\/)+/, '');
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** A static import of `pkg` (or a deep path into it) in a source file's text. */
function importsPackage(content: string, pkg: string): boolean {
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:\\bfrom|\\bimport|\\brequire\\s*\\()\\s*['"]${escaped}(?:/[^'"]*)?['"]`,
  ).test(content);
}

async function main(): Promise<number> {
  if (!existsSync(OUT_DIR)) {
    console.error(
      `check-entry-composition: no ${path.relative(ROOT, OUT_DIR)} — run \`pnpm run build:frontend:sourcemap\` first.`,
    );
    return 1;
  }
  const strict = process.argv.includes('--strict');
  const topArg = process.argv.find((a) => a.startsWith('--top='));
  const top = topArg ? Number.parseInt(topArg.slice('--top='.length), 10) : 25;

  const entry = await findClientEntry(OUT_DIR);
  const { files, reachedFrom } = staticClosure(OUT_DIR, entry);

  const bytesByPackage = new Map<string, number>();
  const chunksByPackage = new Map<string, Set<string>>();
  const firstPartyContent = new Map<string, string>();
  let mapped = 0;
  const unmapped: string[] = [];

  for (const file of files) {
    const attributed = attributeBytes(file);
    if (!attributed) {
      unmapped.push(file);
      continue;
    }
    mapped++;
    const map = JSON.parse(readFileSync(path.join(OUT_DIR, `${file}.map`), 'utf8')) as SourceMap;
    map.sources.forEach((source, i) => {
      if (packageOf(source)) return;
      const content = map.sourcesContent?.[i];
      if (content) firstPartyContent.set(tidySource(source), content);
    });
    for (const [source, count] of attributed) {
      const pkg = packageOf(source);
      if (!pkg) continue;
      bytesByPackage.set(pkg, (bytesByPackage.get(pkg) ?? 0) + count);
      if (!chunksByPackage.has(pkg)) chunksByPackage.set(pkg, new Set());
      chunksByPackage.get(pkg)?.add(file);
    }
  }

  if (mapped === 0) {
    const message =
      'check-entry-composition: no sourcemaps beside the client chunks, so chunk bytes\n' +
      '  cannot be attributed to packages. Rebuild with sourcemaps:\n' +
      '      pnpm run build:frontend:sourcemap\n' +
      '  (vite.config.ts sets build.sourcemap:false, so a plain `pnpm build` emits none.)';
    if (strict) {
      console.error(`${message}\n  --strict was passed, so this is a failure.`);
      return 1;
    }
    console.warn(`${message}\n  Skipping (pass --strict to make this a failure).`);
    return 0;
  }

  const ranked = [...bytesByPackage].sort((a, b) => b[1] - a[1]);
  console.log('\n  entry static closure — composition by package');
  console.log('  ──────────────────────────────────────────────────────────────');
  for (const [pkg, count] of ranked.slice(0, top)) {
    const flag = pkg in FORBIDDEN ? ' ← FORBIDDEN' : '';
    console.log(`  ${kb(count).padStart(10)}  ${pkg}${flag}`);
  }
  console.log('  ──────────────────────────────────────────────────────────────');
  console.log(
    `  ${files.length} chunks on the critical path · ${mapped} attributed` +
      (unmapped.length > 0 ? ` · ${unmapped.length} without a .map (rolldown runtime)` : ''),
  );
  console.log(`  entry: ${entry}\n`);

  let failed = false;

  for (const [pkg, reason] of Object.entries(FORBIDDEN)) {
    const count = bytesByPackage.get(pkg);
    const baseline = KNOWN_VIOLATIONS[pkg];

    if (count === undefined) {
      if (baseline) {
        failed = true;
        console.error(
          `FAIL  \`${pkg}\` is no longer in the entry closure, but KNOWN_VIOLATIONS still\n` +
            `      allows it (${baseline.note}).\n` +
            `      Fixed — delete the \`${pkg}\` entry from KNOWN_VIOLATIONS in\n` +
            '      scripts/check-entry-composition.ts so it cannot come back.\n',
        );
      }
      continue;
    }

    // Where did it land, and how was that chunk reached from the entry?
    const chunks = [...(chunksByPackage.get(pkg) ?? [])];
    const chain: string[] = [];
    let cursor: string | undefined = chunks[0];
    while (cursor) {
      chain.unshift(cursor);
      cursor = reachedFrom.get(cursor);
    }
    const allImporters = [...firstPartyContent]
      .filter(([, content]) => importsPackage(content, pkg))
      // `?tsr-shared=1` and friends are Start's split-point query suffixes on
      // the same file — collapse them so one route is not listed twice.
      .map(([source]) => source.replace(/\?.*$/, ''));
    const importers = [...new Set(allImporters)].sort();
    const shownImporters = importers.slice(0, 8);
    const moreImporters = importers.length - shownImporters.length;

    if (baseline && count <= baseline.maxBytes) {
      console.warn(
        `warn  \`${pkg}\` is in the entry closure at ${kb(count)} — allowed by a dated\n` +
          `      baseline (cap ${kb(baseline.maxBytes)}): ${baseline.note}.\n` +
          `      ${reason}.\n` +
          (importers.length > 0
            ? `      imported at module scope by ${importers.length} source(s):\n` +
              shownImporters.map((s) => `        ${s}`).join('\n') +
              (moreImporters > 0 ? `\n        …and ${moreImporters} more` : '') +
              '\n'
            : ''),
      );
      continue;
    }

    failed = true;
    console.error(
      `FAIL  entry closure contains \`${pkg}\` (${reason})\n` +
        `      ${kb(count)} in ${chunks.join(', ')}\n` +
        (baseline ? `      over its baseline cap of ${kb(baseline.maxBytes)}\n` : '') +
        (chain.length > 0 ? `      reached from: ${chain.join('\n                 ← ')}\n` : '') +
        (importers.length > 0
          ? `      imported at module scope by ${importers.length} source(s):\n` +
            shownImporters.map((s) => `        ${s}`).join('\n') +
            (moreImporters > 0 ? `\n        …and ${moreImporters} more` : '') +
            '\n      → move that import behind a lazy() boundary, or split it into a\n' +
            '        sibling module the shell does not reach.\n'
          : '      → no first-party source in the closure imports it directly; it came in\n' +
            '        through another package. Check that package.\n'),
    );
  }

  if (failed) {
    console.error(
      'check-entry-composition: FAIL — the entry closure is loaded on EVERY page,\n' +
        '  because app/routeTree.gen.ts imports all 739 route modules statically and\n' +
        "  Start's splitter only lifts out route COMPONENTS. Anything else a route\n" +
        '  module touches at top level is a site-wide cost.\n' +
        '  See docs/performance-audit-2026-08-04.md §"The rule this leaves behind".',
    );
    return 1;
  }
  console.log('check-entry-composition: ok — no forbidden package in the entry closure.\n');
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(
        `check-entry-composition: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    });
}

export { FORBIDDEN, KNOWN_VIOLATIONS };
