// Co-op results are verified by replaying the run on the server (features/altair/engine/verify). That only works
// while every random roll and every transcendental in the SIMULATION goes through engine/rng.ts and
// engine/dmath.ts. This guard fails the build when new sim code reaches for the raw Math functions
// (a silent desync: the host's browser and the server would stop agreeing and honest runs would be
// rejected). Rendering-only files are exempt.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ENGINE = join(__dirname, '..');
const EXEMPT = new Set(['rng.ts', 'dmath.ts', 'camera.ts', 'renderer.ts', 'renderer-setup.ts', 'interpolation.ts']);
const EXEMPT_DIRS = new Set(['__tests__', 'webgl', 'sprites']);
const FORBIDDEN = /Math\.(random|sin|cos|tan|atan2|atan|asin|acos|exp|pow|log|log2|log10|cbrt|hypot|sinh|cosh|tanh)\s*\(|\s\*\*\s*[0-9a-zA-Z(]/;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!EXEMPT_DIRS.has(name)) out.push(...files(full));
    } else if (name.endsWith('.ts') && !EXEMPT.has(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('engine determinism guard', () => {
  it('sim code uses rand() and the d* math, never the raw Math functions', () => {
    const offenders: string[] = [];
    for (const f of files(ENGINE)) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('/*')) return; // doc comments
        const code = line.replace(/\/\/.*$/, '');
        if (FORBIDDEN.test(code)) offenders.push(`${relative(ENGINE, f)}:${i + 1}: ${line.trim()}`);
      });
    }
    // host-sim's seed default and its input normalisation run outside the replayed path (the replay
    // feeds the log's integers straight in), so they are the only allowed uses.
    const allowed = offenders.filter((o) => !/host-sim\.ts:\d+: (this\.seed = |const m = Math\.hypot)/.test(o));
    expect(allowed).toEqual([]);
  });
});
