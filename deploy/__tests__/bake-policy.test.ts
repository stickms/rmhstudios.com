import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * deploy/bake-policy.sh decides whether the bake rolls the new web container back. The
 * point of the policy is NOT rolling back a healthy release that is merely slow, so the
 * tests are mostly about what it tolerates, and a few about what it must still catch.
 */
function run(script: string, env: Record<string, string> = {}) {
  const result = spawnSync('/bin/bash', ['-c', `. ${resolve('deploy/bake-policy.sh')}\nbake_policy_init\n${script}`], {
    env: { PATH: '/usr/bin:/bin', ...env },
    encoding: 'utf8',
    timeout: 10_000,
  });
  return { status: result.status, out: result.stdout.trim(), err: result.stderr };
}

// probes: [smoke rc, seconds since the bake began] in order; prints "ok" or the rollback reason of the first that trips.
const probes = (rounds: Array<[number, number]>, env: Record<string, string> = {}) =>
  run(
    `for r in ${rounds.map(([rc, t]) => `"${rc}:${t}"`).join(' ')}; do\n` +
      `  bake_policy_probe "\${r%%:*}" "\${r##*:}" || { echo "ROLLBACK: $BAKE_REASON"; exit 0; }\n` +
      `done; echo ok`,
    env,
  );

describe.skipIf(process.platform === 'win32')('bake policy: smoke probes', () => {
  it('ignores failures in the startup grace window, however many', () => {
    const rounds: Array<[number, number]> = Array.from({ length: 4 }, (_, i) => [1, i * 20]);
    expect(probes(rounds).out).toBe('ok'); // 0, 20, 40, 60 s: all inside the 90 s grace
  });

  it('rolls back after 3 broken rounds in a row once past the grace window', () => {
    const r = probes([[1, 100], [1, 120], [1, 140]]);
    expect(r.out).toBe('ROLLBACK: 3 consecutive broken responses during the bake');
  });

  it('does not roll back on a few slow rounds, which are about the host as much as the release', () => {
    expect(probes(Array.from({ length: 8 }, (_, i): [number, number] => [2, 100 + i * 20])).out).toBe('ok');
  });

  it('rolls back on slow rounds that never end (9 in a row by default)', () => {
    const r = probes(Array.from({ length: 9 }, (_, i): [number, number] => [2, 100 + i * 20]));
    expect(r.out).toBe('ROLLBACK: 9 consecutive failed rounds (slow or unreachable) during the bake');
  });

  it('a good round resets both streaks', () => {
    expect(probes([[1, 100], [1, 120], [0, 140], [1, 160], [1, 180]]).out).toBe('ok');
  });

  it('a slow round breaks a broken streak (the failures were not all the release)', () => {
    expect(probes([[1, 100], [1, 120], [2, 140], [1, 160]]).out).toBe('ok');
  });

  it('honours the thresholds from the environment', () => {
    const r = probes([[1, 10], [1, 20]], { BAKE_GRACE_SECONDS: '0', BAKE_FAIL_THRESHOLD: '2' });
    expect(r.out).toBe('ROLLBACK: 2 consecutive broken responses during the bake');
  });
});

describe.skipIf(process.platform === 'win32')('bake policy: the container itself', () => {
  const container = (rounds: Array<[string, number]>, restarts0 = 0) =>
    run(
      `for r in ${rounds.map(([running, n]) => `"${running}:${n}"`).join(' ')}; do\n` +
        `  bake_policy_container "\${r%%:*}" "\${r##*:}" ${restarts0} || { echo "ROLLBACK: $BAKE_REASON"; exit 0; }\n` +
        `done; echo ok`,
    );

  it('tolerates one restart if the container is running again (an OOM kill is not a bad release)', () => {
    expect(container([['true', 0], ['true', 1], ['true', 1]]).out).toBe('ok');
  });

  it('rolls back a crash loop (a second restart)', () => {
    expect(container([['true', 1], ['true', 2]]).out).toContain('restarted 2x during the bake');
  });

  it('retries a container seen down once, and rolls back when it is down twice in a row', () => {
    expect(container([['false', 0], ['true', 1]]).out).toBe('ok');
    expect(container([['false', 0], ['false', 1]]).out).toContain('down in 2 consecutive rounds');
  });

  it('does not invent a restart from a baseline it could not read', () => {
    const r = run(`bake_policy_container true 5 "" && echo ok`);
    expect(r.out).toBe('ok');
  });
});
