/**
 * The commit gate's plumbing (audit OP1): which checkout the agent hook gates, and how a
 * killed step is told from a rule failure.
 *
 * The gate's RULES are tested by the gates themselves. What had no test was the wiring
 * around them, and that is where it failed for five phases:
 *
 * - `.claude/hooks/commit-gate.sh` gated `$CLAUDE_PROJECT_DIR` whatever the command said,
 *   so `cd <worktree> && git commit` was checked against the main checkout's tree and
 *   `git -C <worktree> commit` was not seen at all;
 * - `RMH_SKIP_COMMIT_GATE=1 git commit …`, the documented escape hatch, never reached the
 *   hook's environment;
 * - a step taken by the out-of-memory killer printed the same ✗ as a broken rule.
 *
 * The hook is driven here against a throwaway repository whose `scripts/check-consistency.sh`
 * is a stub that records how it was called, so nothing in this file starts vitest, eslint or
 * tsc.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = path.resolve(import.meta.dirname, '../..');
const HOOK = path.join(REPO, '.claude/hooks/commit-gate.sh');
const PARSER = path.join(REPO, '.claude/hooks/commit-gate-parse.mjs');
const STEP = path.join(REPO, 'scripts/gate-step.sh');

/** A hook run inside `git commit` inherits GIT_DIR / GIT_INDEX_FILE; these tests must not. */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_') && key !== 'RMH_SKIP_COMMIT_GATE' && key !== 'CLAUDE_PROJECT_DIR')
      env[key] = value;
  }
  return { ...env, ...extra };
}

function parse(command: string, cwd = '/work/main'): string[] {
  const out = execFileSync('node', [PARSER], {
    input: JSON.stringify({ cwd, tool_input: { command } }),
    encoding: 'utf8',
    env: cleanEnv(),
  });
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').join(' '));
}

describe('commit-gate-parse: where a command commits', () => {
  // [command, expected lines of "<skip> <stages> <dir>"]
  const cases: [string, string[]][] = [
    ['git commit -m x', ['0 0 /work/main']],
    ['cd /work/tree && git commit -m "x"', ['0 0 /work/tree']],
    ['git -C /work/tree commit -m x', ['0 0 /work/tree']],
    ['cd /work && git -C tree commit -m x', ['0 0 /work/tree']],
    ['git status; (cd sub && git commit -m "a;b")', ['0 0 /work/main/sub']],
    ['bash -c "cd /work/tree && git commit -m x"', ['0 0 /work/tree']],
    // The command stages for itself: the staged tree is not yet the commit.
    ['cd /work/tree && git add -A && git commit -m x', ['0 1 /work/tree']],
    ['git commit -am x', ['0 1 /work/main']],
    ['git commit --all -m x', ['0 1 /work/main']],
    ['git commit -m "one file" -- a.ts', ['0 1 /work/main']],
    ['git add a.ts && git -C /work/tree commit -m x', ['0 0 /work/tree']],
    ['git commit -m one && git commit -m two', ['0 1 /work/main']],
    // The escape hatch, in each way a command can carry it.
    ['RMH_SKIP_COMMIT_GATE=1 git commit -m x', ['1 0 /work/main']],
    ['env RMH_SKIP_COMMIT_GATE=1 git commit -m x', ['1 0 /work/main']],
    ['export RMH_SKIP_COMMIT_GATE=1; git commit -m x', ['1 0 /work/main']],
    ['RMH_SKIP_COMMIT_GATE=0 git commit -m x', ['0 0 /work/main']],
    // Two checkouts in one command are two gates.
    ['git commit -m x && git -C /work/tree commit -m y', ['0 0 /work/main', '0 0 /work/tree']],
    // Not commits.
    ['ls -la', []],
    ['git commit-graph write', []],
    ['git commit-tree abc', []],
    ['git log --oneline | grep commit', []],
  ];

  it.each(cases)('%s', (command, expected) => {
    expect(parse(command)).toEqual(expected);
  });

  it('does not read a heredoc commit message as shell', () => {
    const command = [
      "cd /work/tree && git commit -m \"$(cat <<'EOF'",
      "Don't; break && git -C /nope commit -a",
      'RMH_SKIP_COMMIT_GATE=1 git add everything',
      'EOF',
      ')" && git status',
    ].join('\n');
    expect(parse(command)).toEqual(['0 0 /work/tree']);
  });

  it('still gates a `git commit` it cannot read, where the command starts', () => {
    // The pre-OP1 hook matched the substring; an unreadable form must not become a way round.
    expect(parse('xargs -I{} git commit -m {} < messages')).toEqual(['0 0 /work/main']);
  });

  it('keeps the directory it had when a `cd` target is a variable', () => {
    expect(parse('cd "$SOMEWHERE" && git commit -m x')).toEqual(['0 0 /work/main']);
  });
});

describe('commit-gate.sh: gates the checkout the commit happens in', () => {
  let scratch: string;
  let main: string;
  let tree: string;
  let calls: string;

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=gate@test.invalid', '-c', 'user.name=gate', ...args], {
      cwd,
      env: cleanEnv(),
      encoding: 'utf8',
    });

  /** Run the hook as the harness does: payload on stdin, the project dir in the environment. */
  function hook(command: string, options: { stubExit?: number; cwd?: string } = {}) {
    writeFileSync(calls, '');
    const result = spawnSync('bash', [HOOK], {
      input: JSON.stringify({ cwd: options.cwd ?? main, tool_input: { command } }),
      encoding: 'utf8',
      env: cleanEnv({
        CLAUDE_PROJECT_DIR: main,
        STUB_CALLS: calls,
        STUB_EXIT: String(options.stubExit ?? 0),
      }),
    });
    return {
      status: result.status,
      stderr: result.stderr,
      calls: readFileSync(calls, 'utf8').split('\n').filter(Boolean),
    };
  }

  beforeAll(() => {
    scratch = realpathSync(mkdtempSync(path.join(tmpdir(), 'commit-gate-hook-')));
    main = path.join(scratch, 'main');
    tree = path.join(scratch, 'tree');
    calls = path.join(scratch, 'calls');
    mkdirSync(path.join(main, 'scripts'), { recursive: true });
    // The stand-in gate: record where and how it was called, answer what the test asks.
    writeFileSync(
      path.join(main, 'scripts/check-consistency.sh'),
      '#!/usr/bin/env bash\nprintf \'%s %s\\n\' "$PWD" "$*" >> "$STUB_CALLS"\nprintf \'stub gate output\\n\'\nexit "$STUB_EXIT"\n',
    );
    chmodSync(path.join(main, 'scripts/check-consistency.sh'), 0o755);
    git(scratch, 'init', '-q', '-b', 'main', main);
    git(main, 'add', '.');
    git(main, 'commit', '-q', '-m', 'init');
    git(main, 'worktree', 'add', '-q', '-b', 'side', tree);
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('gates the main checkout for a plain commit there, on the staged tree', () => {
    const run = hook('git commit -m x');
    expect(run.status).toBe(0);
    expect(run.calls).toEqual([`${main} --staged --fast`]);
  });

  it('gates the worktree, not $CLAUDE_PROJECT_DIR, when the command moves there', () => {
    expect(hook(`cd ${tree} && git commit -m x`).calls).toEqual([`${tree} --staged --fast`]);
    expect(hook(`git -C ${tree} commit -m x`).calls).toEqual([`${tree} --staged --fast`]);
  });

  it('gates the working tree when the command stages for itself', () => {
    expect(hook(`cd ${tree} && git add -A && git commit -m x`).calls).toEqual([
      `${tree} --working --fast`,
    ]);
  });

  it('blocks with exit 2 and the gate output when a rule fails', () => {
    const run = hook(`cd ${tree} && git commit -m x`, { stubExit: 1 });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('blocked this commit');
    expect(run.stderr).toContain('stub gate output');
    expect(run.stderr).not.toContain('KILLED');
  });

  it('blocks with a different message when a step was killed (gate exit 3)', () => {
    const run = hook(`cd ${tree} && git commit -m x`, { stubExit: 3 });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('a step was KILLED');
    expect(run.stderr).toContain('not the change');
    expect(run.stderr).not.toContain('blocked this commit');
  });

  it('honours the escape hatch written in the command, and says so', () => {
    const run = hook(`cd ${tree} && RMH_SKIP_COMMIT_GATE=1 git commit -m x`, { stubExit: 1 });
    expect(run.status).toBe(0);
    expect(run.calls).toEqual([]);
    expect(run.stderr).toContain('Commit gate skipped');
  });

  it('stamps a passing staged tree where .githooks/pre-commit looks for it, worktree included', () => {
    for (const dir of [main, tree]) {
      const stamp = path.resolve(
        dir,
        git(dir, 'rev-parse', '--git-path', 'rmh-commit-gate-ok').trim(),
      );
      rmSync(stamp, { force: true });
      hook(`cd ${dir} && git commit -m x`);
      expect(existsSync(stamp), stamp).toBe(true);
      // A working-tree gate is a superset of the commit, not the commit: no stamp.
      rmSync(stamp);
      hook(`cd ${dir} && git add -A && git commit -m x`);
      expect(existsSync(stamp), stamp).toBe(false);
    }
  });

  it('passes commands that are not commits, and commits in other repositories, untouched', () => {
    expect(hook('ls && git status').calls).toEqual([]);
    const elsewhere = path.join(scratch, 'elsewhere');
    mkdirSync(elsewhere);
    git(scratch, 'init', '-q', elsewhere);
    const run = hook(`cd ${elsewhere} && git commit -m x`, { stubExit: 1 });
    expect(run.status).toBe(0);
    expect(run.calls).toEqual([]);
  });
});

describe('gate-step.sh: a killed step is not a rule failure', () => {
  /** Run `run_step <name> bash -c <script>` and report its return code and output. */
  function step(script: string) {
    const result = spawnSync(
      'bash',
      [
        '-c',
        '. "$1"; run_step "the step" bash -c "$2"; rc=$?; printf "\\nRETURN=%s KILLED=%s" "$rc" "$GATE_KILLED"',
        '_',
        STEP,
        script,
      ],
      { encoding: 'utf8', env: cleanEnv() },
    );
    const output = result.stdout + result.stderr;
    return {
      output,
      returned: /RETURN=(\d)/.exec(output)?.[1],
      killed: /KILLED=the step/.test(output),
    };
  }

  it('returns 0 for a pass and 1 for an ordinary failure, with no ☠ line', () => {
    expect(step('exit 0')).toMatchObject({ returned: '0', killed: false });
    const failed = step('echo "3 problems"; exit 1');
    expect(failed).toMatchObject({ returned: '1', killed: false });
    expect(failed.output).not.toContain('☠');
  });

  it.each([
    ['kill -KILL $$', 'SIGKILL (exit 137)'],
    ['kill -TERM $$', 'SIGTERM (exit 143)'],
    ['kill -ABRT $$', 'SIGABRT (exit 134)'],
  ])('names the step and the signal for `%s`', (script, cause) => {
    const run = step(script);
    expect(run).toMatchObject({ returned: '2', killed: true });
    expect(run.output).toContain(`☠ the step — KILLED by ${cause}`);
    expect(run.output).toContain('not a rule failure');
  });

  it('recognises the kill pnpm exec flattens to exit 1', () => {
    const run = step(
      'echo " ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command was killed with SIGKILL (Forced termination): tsx x"; exit 1',
    );
    expect(run).toMatchObject({ returned: '2', killed: true });
    expect(run.output).toContain('KILLED by SIGKILL (reported by pnpm; exit 1)');
  });

  it('recognises a JavaScript heap exhaustion that exits 1', () => {
    const run = step(
      'echo "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory"; exit 1',
    );
    expect(run).toMatchObject({ returned: '2', killed: true });
    expect(run.output).toContain('the JavaScript heap limit');
  });
});

describe('check-consistency.sh wiring', () => {
  const gate = readFileSync(path.join(REPO, 'scripts/check-consistency.sh'), 'utf8');

  it('starts every tool through run_step', () => {
    // A tool started bare is a tool whose SIGKILL reads as "✗ rule failed" again.
    const bare = gate
      .split('\n')
      .filter((line) => /^\s*(if\s+)?(pnpm (run|exec|test)|node node_modules)\b/.test(line))
      .map((line) => line.trim());
    expect(bare).toEqual([]);
  });

  it('exits 3, not 1, when a step was killed', () => {
    expect(gate).toMatch(/if \[ -n "\$GATE_KILLED" \]; then[\s\S]*?exit 3\nfi/);
  });

  it('runs the same gate files whatever is staged — the fast path caps workers, it does not drop gates', () => {
    expect(gate).toContain('"${GATE_RUN[@]}" "${GATE_TESTS[@]}"');
    expect(gate).not.toMatch(/GATE_TESTS=\(\)|unset GATE_TESTS/);
  });
});
