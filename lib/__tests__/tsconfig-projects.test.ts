/**
 * The TypeScript projects partition the source (third-pass audit AR1 steps 1 and 2, AR4).
 *
 * `pnpm typecheck` is `tsc -b` over three projects: tsconfig.core.json, tsconfig.engine.json and
 * tsconfig.site.json. A change in one rechecks that project and, when its declarations changed, the
 * projects above it; the site never compiles the engine's source. That only holds while:
 *
 *  1. every source file belongs to exactly one project. A file in none is not typechecked at all and
 *     no editor finds a project for it; a file in two is checked twice under two sets of inputs.
 *  2. core imports only core, and the engine only itself and core. `tsc` fails on this too (TS6307),
 *     but it is not in the fast gate, and this failure names the import.
 *  3. the main vitest suite runs none of the engine project's tests (AR4's done-when), and the engine
 *     suite runs all of them.
 *
 * tsconfig.site.json cannot say "this directory except these files" with globs, so it excludes the
 * other projects' directories and names the files they leave behind in `files`. Check 1 is what keeps
 * that list honest: its failure message is the line to add or remove.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import mainSuite from '../../vitest.config';
import engineSuite from '../../vitest.tf2.config';
import { engineProjectTests } from '../../vitest.engine-tests.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');

interface Tsconfig {
  compilerOptions?: Record<string, unknown>;
  include?: string[];
  exclude?: string[];
  files?: string[];
  references?: { path: string }[];
}

/** The configs carry whole-line comments, which is all this strips. */
function readConfig(name: string): Tsconfig {
  const text = readFileSync(path.join(root, name), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(text) as Tsconfig;
}

/** A tsconfig pattern names a file, a glob, or a directory (then everything under it). */
function matches(file: string, pattern: string): boolean {
  return path.matchesGlob(file, pattern) || path.matchesGlob(file, `${pattern}/**`);
}

function inProject(config: Tsconfig, file: string): boolean {
  if (config.files?.includes(file)) return true;
  if (!config.include?.some((pattern) => matches(file, pattern))) return false;
  return !config.exclude?.some((pattern) => matches(file, pattern));
}

/**
 * What no project checks, exactly as before the split: build output, generated copies and `scripts/`
 * (run with tsx, tested by their own suites). Pinned here so that a directory cannot leave the
 * typecheck by being added to tsconfig.site.json's `exclude`.
 */
const UNCHECKED = [
  'node_modules',
  'bazel-*',
  'dist-server',
  'public/vibe-packages',
  'server/api-routes',
  'scripts',
  '.output',
  '.next',
  'next-env.d.ts',
  '.vinxi',
  'proxy.ts',
];

/** Every .ts/.tsx/.mts file `tsc`'s `**` would reach: not under node_modules or a dot-directory. */
function sourceFiles(dir = root, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    // statSync, not the dirent: `bazel-*` are symlinks, and they are skipped by name below.
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (UNCHECKED.some((pattern) => matches(rel, pattern))) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|mts)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const core = readConfig('tsconfig.core.json');
const engine = readConfig('tsconfig.engine.json');
const site = readConfig('tsconfig.site.json');
const solution = readConfig('tsconfig.json');
const projects = { core, engine, site } as const;
type ProjectName = keyof typeof projects;
const NAMES = Object.keys(projects) as ProjectName[];

const files = sourceFiles();
const owners = new Map<string, ProjectName[]>(
  files.map((file) => [file, NAMES.filter((name) => inProject(projects[name], file))]),
);
const filesOf = (name: ProjectName): string[] => files.filter((file) => owners.get(file)?.[0] === name);

/** Every module specifier the compiler follows: imports, re-exports, `import()` and `typeof import()`. */
function specifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const found: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) found.push(m[1]!);
  return found;
}

/** The source file a specifier resolves to, or null for a package or an asset. */
function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('@features/')) base = `features/${spec.slice('@features/'.length)}`;
  else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null;
  for (const suffix of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = base + suffix;
    if (!/\.(ts|tsx|mts)$/.test(candidate)) continue;
    const full = path.join(root, candidate);
    if (existsSync(full) && statSync(full).isFile()) return candidate;
  }
  return null;
}

/** `file -> import` for every import of `name`'s files that lands outside the `allowed` projects. */
function leaks(name: ProjectName, allowed: readonly ProjectName[]): string[] {
  const out: string[] = [];
  for (const file of filesOf(name)) {
    for (const spec of specifiers(readFileSync(path.join(root, file), 'utf8'))) {
      const to = resolve(file, spec);
      if (!to) continue;
      const owner = owners.get(to)?.[0];
      if (!owner || !allowed.includes(owner)) out.push(`${file} -> ${spec} (${owner ?? 'no project'})`);
    }
  }
  return out;
}

describe('the TypeScript projects', () => {
  it('finds the source', () => {
    expect(files.length).toBeGreaterThan(5000);
    expect(filesOf('core').length).toBeGreaterThan(20);
    expect(filesOf('engine').length).toBeGreaterThan(500);
  });

  it('puts every source file in exactly one project', () => {
    const orphans = files.filter((file) => owners.get(file)!.length === 0);
    const shared = files.filter((file) => owners.get(file)!.length > 1).map((file) => `${file} (${owners.get(file)!.join(', ')})`);
    // An orphan is a file a project's `exclude` leaves out of its directory: add it to `files` in
    // tsconfig.site.json. A shared file is listed there but no longer excluded: remove it.
    expect({ orphans, shared }).toEqual({ orphans: [], shared: [] });
  });

  it('lists only files that exist in tsconfig.site.json', () => {
    expect((site.files ?? []).filter((file) => !existsSync(path.join(root, file)))).toEqual([]);
  });

  it('builds all three from the root, in dependency order', () => {
    expect(solution.files).toEqual([]);
    expect(solution.include).toBeUndefined();
    expect(solution.references?.map((ref) => ref.path)).toEqual([
      './tsconfig.core.json',
      './tsconfig.engine.json',
      './tsconfig.site.json',
    ]);
    expect(core.references).toBeUndefined();
    expect(engine.references?.map((ref) => ref.path)).toEqual(['./tsconfig.core.json']);
    expect(site.references?.map((ref) => ref.path)).toEqual(['./tsconfig.core.json', './tsconfig.engine.json']);
    expect(core.compilerOptions?.composite).toBe(true);
    expect(engine.compilerOptions?.composite).toBe(true);
  });

  it('keeps core free of the engine and the site', () => {
    expect(leaks('core', ['core'])).toEqual([]);
  });

  it('keeps the engine free of the site', () => {
    expect(leaks('engine', ['engine', 'core'])).toEqual([]);
  });
});

/**
 * The root tsconfig.json has no files, so `tsc --noEmit` there checks nothing and exits 0. Nothing that
 * people or CI follow may say to run it: scripts and workflows call `pnpm typecheck` (or name a project
 * with `-p` / `-b`), and so do the documents a contributor reads first.
 */
describe('nothing runs a bare tsc', () => {
  const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');
  const workflows = readdirSync(path.join(root, '.github/workflows')).map((name) => `.github/workflows/${name}`);
  const shell = readdirSync(path.join(root, 'scripts')).filter((name) => name.endsWith('.sh')).map((name) => `scripts/${name}`);
  const guides = [
    'CLAUDE.md',
    'CONTRIBUTING.md',
    'README.md',
    '.github/pull_request_template.md',
    'docs/architecture.md',
    'docs/codebase-overview.md',
    'docs/page-consistency.md',
    'docs/testing.md',
    'lib/CLAUDE.md',
    'features/CLAUDE.md',
    'app/CLAUDE.md',
    'components/CLAUDE.md',
    'server/CLAUDE.md',
  ];
  /** A `tsc` invocation: through a runner, or as the command of a script line. Prose that names the flag is not one. */
  const INVOCATION = /(?:pnpm exec|pnpm dlx|npx|node [^\s]*\/bin\/)\s*tsc\b[^\n`"]*/g;
  const namesAProject = (command: string): boolean => /\s(?:-p|--project|-b|--build|--version|--help)\b/.test(command);

  it('in package.json, the workflows, the shell scripts or the guides', () => {
    const scripts = Object.entries((JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts)
      .filter(([, command]) => /(?:^|[\s&;])(?:node [^\s]*\/bin\/)?tsc\b/.test(command) && !namesAProject(command))
      .map(([name]) => `package.json: ${name}`);
    const prose = [...workflows, ...shell, ...guides].flatMap((file) =>
      [...read(file).matchAll(INVOCATION)].filter((m) => !namesAProject(m[0])).map((m) => `${file}: ${m[0].trim()}`),
    );
    expect([...scripts, ...prose]).toEqual([]);
  });
});

describe('the engine project and the test suites', () => {
  const engineTests = filesOf('engine').filter((file) => /\.test\.tsx?$/.test(file));
  const mainExclude = mainSuite.test?.exclude ?? [];
  const engineInclude = engineSuite.test?.include ?? [];

  it('agrees with vitest.engine-tests.mjs on which tests are the engine project\'s', () => {
    const dirs = ['lib/tf2-game', 'lib/sp-game', 'lib/csgo-game', 'lib/tf2-hud', 'lib/tf2-loadout'];
    expect(engineProjectTests(dirs)).toEqual([...engineTests].sort());
    expect(engineTests.length).toBeGreaterThan(100);
  });

  it('runs none of them in the main suite', () => {
    expect(engineTests.filter((file) => !mainExclude.some((pattern) => path.matchesGlob(file, pattern)))).toEqual([]);
  });

  it('runs all of them in the engine suite', () => {
    expect(engineTests.filter((file) => !engineInclude.some((pattern) => path.matchesGlob(file, pattern)))).toEqual([]);
  });
});
