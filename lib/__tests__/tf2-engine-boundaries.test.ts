import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Redesign A3: lib/tf2-game is the Source engine the single-player (lib/sp-game) and CS:GO (lib/csgo-game) layers are
 * built on, so the dependency runs one way: sp-game and csgo-game import the engine, never the other way round. A game
 * that needs to plug into the engine registers with it instead (see `registerClientProfile` in
 * lib/tf2-game/client/game-profile.ts and `startListenWorker` in lib/tf2-game/client/net/listen-worker-host.ts).
 */

const root = new URL('../../', import.meta.url).pathname;
const engineDir = join(root, 'lib/tf2-game');
const FORBIDDEN = ['lib/sp-game', 'lib/csgo-game'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Every module specifier a file imports, re-exports, dynamically imports or mocks. */
function specifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const found: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\b(?:import|require)\(\s*['"]([^'"]+)['"]/g,
    /\bvi\.(?:mock|doMock|importActual)\(\s*['"]([^'"]+)['"]/g,
    /\bnew URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) found.push(m[1]!);
  return found;
}

/** The repo-relative path a specifier points at, or null for a package. */
function target(file: string, spec: string): string | null {
  if (spec.startsWith('@/')) return spec.slice(2);
  if (spec.startsWith('.')) return relative(root, normalize(join(dirname(file), spec)));
  return null;
}

describe('lib/tf2-game does not depend on the games built on it', () => {
  const files = walk(engineDir);

  it('scans the engine', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('imports nothing from lib/sp-game or lib/csgo-game', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        const to = target(file, spec);
        if (to && FORBIDDEN.some((dir) => to === dir || to.startsWith(`${dir}/`))) {
          offenders.push(`${relative(root, file)} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
