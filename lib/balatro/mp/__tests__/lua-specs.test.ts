/**
 * Runs the Lua L1 specs (lib/balatro/lua/spec/*_spec.lua) under PUC Lua 5.1
 * and reports each TAP line as its own test (PLAN §6.1, WS0 task 4).
 *
 * `lua5.1` is the same VM family as love.js. It is required, not optional:
 * a missing interpreter FAILS this file with an install hint rather than
 * skipping it (the epic suite's precedent: a suite that silently passes on a
 * machine that cannot run it is a claim of coverage nothing backs).
 * Override the binary with `LUA51=/path/to/lua5.1`.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../../..');
const LUA = process.env.LUA51 || 'lua5.1';
const INSTALL_HINT =
  `lua5.1 not found (looked for "${LUA}"). The Balatro Lua specs need PUC Lua 5.1:\n` +
  '  Debian/Ubuntu: sudo apt-get install -y lua5.1\n' +
  '  macOS (Homebrew): brew install lua@5.1  (then LUA51=$(brew --prefix lua@5.1)/bin/lua5.1)\n' +
  'or point LUA51 at an existing lua5.1 binary.';

interface TapLine {
  ok: boolean;
  skip: boolean;
  name: string;
  detail: string;
}

function parseTap(stdout: string): { lines: TapLine[]; plan: number | null } {
  const lines: TapLine[] = [];
  let plan: number | null = null;
  let current: TapLine | null = null;
  for (const raw of stdout.split('\n')) {
    const m = /^(not ok|ok) \d+ - (.*?)( # SKIP)?$/.exec(raw);
    if (m) {
      current = { ok: m[1] === 'ok', skip: !!m[3], name: m[2], detail: '' };
      lines.push(current);
      continue;
    }
    const p = /^1\.\.(\d+)$/.exec(raw);
    if (p) plan = Number(p[1]);
    else if (current && raw.startsWith('  # ')) current.detail += raw.slice(4) + '\n';
  }
  return { lines, plan };
}

const probe = spawnSync(LUA, ['-v'], { encoding: 'utf8' });
const available = !probe.error && probe.status === 0;

describe('Lua L1 specs (lua5.1)', () => {
  if (!available) {
    it('needs lua5.1', () => {
      throw new Error(INSTALL_HINT);
    });
    return;
  }

  const run = spawnSync(LUA, ['lib/balatro/lua/spec/runner.lua'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const { lines, plan } = parseTap(run.stdout ?? '');

  it('the runner completes with a TAP plan matching its results', () => {
    expect(run.error, String(run.error)).toBeUndefined();
    expect(plan, `no TAP plan in output:\n${run.stdout}\n${run.stderr}`).not.toBeNull();
    expect(lines.length).toBe(plan);
    expect(lines.length).toBeGreaterThan(0);
    const failed = lines.filter((l) => !l.ok).length;
    expect(run.status, run.stderr).toBe(failed > 0 ? 1 : 0);
  });

  for (const line of lines) {
    const test = line.skip ? it.skip : it;
    test(line.name, () => {
      expect(line.ok, line.detail).toBe(true);
    });
  }
});
