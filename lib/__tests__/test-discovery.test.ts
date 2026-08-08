/**
 * Every test file in the repo is collected by a suite.
 *
 * This gate exists because the opposite happened and nothing noticed. The main
 * config used to carry a hand-written `include` array with one glob per feature
 * directory. `lib/liquid-gl/` was renamed to `lib/liquid/` and its glob became
 * a pattern matching nothing; `lib/http-body.server.test.ts` was written at the
 * top of `lib/` where no glob reached. Both files were green in the editor,
 * both were committed, and neither had ever run — `vitest run lib/http-body.server.test.ts`
 * answered *"No test files found"* for a passing file. Six assertions about a
 * request-body ceiling and an SSRF-adjacent size limit sat in the repo looking
 * exactly like coverage while proving nothing.
 *
 * Discovery is a glob now (see `vitest.config.ts`), so the specific bug cannot
 * recur — but "which files does the suite actually collect" is the kind of
 * question that only stays answered if something asks it. This asks **vitest
 * itself** rather than re-implementing glob semantics, so the gate cannot pass
 * because its own matcher disagreed with the runner's.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

const ROOT = resolve(__dirname, '../..');

/**
 * Files that are deliberately in no suite. One-directional, like the other
 * backlogs in this directory: an entry may be deleted, and adding one means
 * arguing in review for why a test file should never run.
 *
 * Currently empty, and the two tests below keep it that way honestly — the one
 * entry it held (a Temple of Joy layout harness) went out with the gameplay
 * suites. A file that should not run is a file that should not be named
 * `*.test.ts`; prefer deleting it or renaming it over adding it here.
 */
const UNCOLLECTED_BY_DESIGN: Array<{ file: string; why: string }> = [];

/** Directories a test file never lives in — mirrors `exclude` in the configs. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-server',
  '.output',
  '.tanstack',
  '.cache',
  'coverage',
  '.vite',
]);

/** Every `*.test.ts(x)` on disk, repo-relative and POSIX-separated. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      out.push(relative(ROOT, join(dir, entry.name)).split(sep).join('/'));
    }
  }
  return out;
}

/** Ask vitest which files a config collects. Its answer, not our glob guess. */
function collectedBy(config: string): string[] {
  const json = execFileSync(
    process.execPath,
    [
      join(ROOT, 'node_modules/vitest/vitest.mjs'),
      'list',
      '--filesOnly',
      '--json',
      '--config',
      config,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1' },
    },
  );
  return (JSON.parse(json) as Array<{ file: string }>).map((entry) =>
    relative(ROOT, entry.file).split(sep).join('/'),
  );
}

describe('test discovery', () => {
  const onDisk = walk(ROOT).sort();
  // Two subprocesses, once for the file — each `vitest list` costs ~400ms.
  const main = collectedBy('vitest.config.ts');
  const epic = collectedBy('vitest.epic.config.ts');
  const collected = new Set([...main, ...epic]);
  const excused = new Set(UNCOLLECTED_BY_DESIGN.map((entry) => entry.file));

  it('finds test files at all — guards the walker itself', () => {
    // A broken walk would make every assertion below vacuously true. The floor
    // is well under the current count (248 + 11 epic) on purpose: it is here to
    // catch a walker that returns nothing, not to police the suite's size.
    expect(onDisk.length).toBeGreaterThan(200);
    expect(onDisk).toContain('lib/__tests__/test-discovery.test.ts');
    expect(collected.size).toBeGreaterThan(200);
  });

  it('collects every test file in the repo into a suite', () => {
    const orphans = onDisk.filter((file) => !collected.has(file) && !excused.has(file));
    expect(
      orphans,
      'These files look like tests and run nowhere. Either they belong to a suite (they will ' +
        'be picked up automatically — discovery is a glob) or they are not tests and should ' +
        'not be named *.test.ts. A deliberate opt-out goes in UNCOLLECTED_BY_DESIGN, with a reason.',
    ).toEqual([]);
  });

  it('keeps the opt-out list honest — no entry for a file that is gone', () => {
    const stale = UNCOLLECTED_BY_DESIGN.filter(({ file }) => !existsSync(join(ROOT, file)));
    expect(stale.map((entry) => entry.file)).toEqual([]);
  });

  it('keeps the opt-out list honest — no entry for a file that IS collected', () => {
    // If a file ends up in a suite anyway, the exemption is a lie about the
    // suite and should come out rather than sit there implying an exclusion.
    const contradicted = UNCOLLECTED_BY_DESIGN.filter(({ file }) => collected.has(file));
    expect(contradicted.map((entry) => entry.file)).toEqual([]);
  });

  it('runs the epic suite from its own config, and only the epic suite', () => {
    // The epic tests launch Chromium; the main suite is environment-agnostic by
    // design. Mixing them would make every `pnpm test` need a browser install.
    expect(epic.length).toBeGreaterThan(0);
    expect(epic.every((file) => file.startsWith('scripts/epic/'))).toBe(true);
    expect(main.some((file) => file.startsWith('scripts/epic/'))).toBe(false);
  });
});
