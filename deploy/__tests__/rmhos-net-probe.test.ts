import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = resolve('deploy/rmhos-net/probe-firewall.sh');
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

// A docker stand-in: records every call; the verdict of the throwaway container is MOCK_RUN_EXIT.
function probe(env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rmhos-probe-'));
  dirs.push(dir);
  const docker = join(dir, 'docker');
  writeFileSync(
    docker,
    `#!/bin/bash
printf '%s\\n' "$*" >> "$MOCK_ROOT/docker.log"
case "$*" in
  *'up --no-start'*) [ "\${MOCK_UP_FAIL:-0}" != 1 ] || exit 1 ;;
  *'network inspect'*) echo 172.31.86.1 ;;
  *' ps -aq '*) echo cid1 ;;
  'inspect '*) echo fixture-app:latest ;;
  'run '*) exit "\${MOCK_RUN_EXIT:-10}" ;;
esac
`,
  );
  chmodSync(docker, 0o755);
  const result = spawnSync('bash', [script], {
    env: { ...process.env, DOCKER_BIN: docker, PROJECT_NAME: 'rmhfixture', MOCK_ROOT: dir, ...env },
    encoding: 'utf8',
  });
  return { result, log: readFileSync(join(dir, 'docker.log'), 'utf8') };
}

describe('probe-firewall.sh', () => {
  it('proves the firewall when the connection to the host times out', () => {
    const { result, log } = probe({ MOCK_RUN_EXIT: '10' });
    expect(result.status, result.stdout).toBe(0);
    const run = log.split('\n').find((l) => l.startsWith('run '));
    expect(run).toContain('--network rmhfixture-rmhos-egress');
    expect(run).toContain('--cap-drop ALL');
    expect(run).toContain('172.31.86.1');
    expect(run).toContain('fixture-app:latest');
  });

  it.each([
    ['connected', '11'],
    ['refused', '12'],
    ['other error', '13'],
    ['docker failure', '125'],
  ])('is not proven when the probe %s', (_n, code) => {
    expect(probe({ MOCK_RUN_EXIT: code }).result.status).toBe(1);
  });

  it('is not proven when the network cannot be created', () => {
    const { result, log } = probe({ MOCK_UP_FAIL: '1' });
    expect(result.status).toBe(1);
    expect(log).not.toContain('run ');
  });
});
