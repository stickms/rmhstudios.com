/**
 * Which test files belong to the engine TypeScript project (tsconfig.engine.json, third-pass audit AR4).
 *
 * The engine project is the Source-engine port minus its server side. tsconfig.engine.json is the one
 * place that says which files that is, so the two vitest configs read it instead of repeating it: the
 * main suite (vitest.config.ts) excludes these files and the engine suite (vitest.tf2.config.ts) includes
 * them. A test the engine project excludes (`*.server.test.ts`, and the ones it names) is a site file
 * and stays in the suite it was in.
 *
 * Plain `.mjs` so that both configs import it with its extension, which Vite's native config loader needs.
 */
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = import.meta.dirname;

/**
 * tsconfig.engine.json's `exclude`. Its comments are whole lines, which is all this strips.
 * @returns {string[]}
 */
function engineExcludes() {
  const text = readFileSync(path.join(root, 'tsconfig.engine.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(text).exclude;
}

/**
 * Every `*.test.ts(x)` under `dirs` that the engine project compiles, as repo-relative paths.
 * @param {readonly string[]} dirs
 * @returns {string[]}
 */
export function engineProjectTests(dirs) {
  const excludes = engineExcludes();
  return dirs
    .flatMap((dir) => globSync(`${dir}/**/*.test.{ts,tsx}`, { cwd: root }))
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => !excludes.some((pattern) => path.matchesGlob(file, pattern)))
    .sort();
}

/**
 * The engine-project tests that used to run in the main suite. `lib/tf2-game`, `lib/sp-game` and
 * `lib/csgo-game` were already the engine suite's, whole directories at a time.
 */
export const ENGINE_TESTS_FROM_MAIN_SUITE = engineProjectTests(['lib/tf2-hud', 'lib/tf2-loadout']);
