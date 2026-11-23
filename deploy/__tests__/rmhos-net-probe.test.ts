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
  'run '*) for a in "$@"; do last="$a"; done; printf '%s' "$last" > "$MOCK_ROOT/probe.js"; exit "\${MOCK_RUN_EXIT:-10}" ;;
esac
`,
  );
  chmodSync(docker, 0o755);
  const result = spawnSync('bash', [script], {
    env: { ...process.env, DOCKER_BIN: docker, PROJECT_NAME: 'rmhfixture', MOCK_ROOT: dir, ...env },
    encoding: 'utf8',
  });
  return { result, log: readFileSync(join(dir, 'docker.log'), 'utf8'), dir };
}

describe('probe-firewall.sh', () => {
  it('proves the firewall when the connection to the host times out', () => {
    const { result, log } = probe({ MOCK_RUN_EXIT: '10' });
    expect(result.status, result.stdout).toBe(0);
    // the node script is several lines: take everything from `run ` on
    const run = log.slice(log.indexOf('run '));
    expect(run).toContain('--network rmhfixture-rmhos-egress');
    expect(run).toContain('--cap-drop ALL');
    expect(run).toContain('172.31.86.1');
    // both halves of the proof: the sentinel must be refused AND the gateway must time out
    expect(run).toContain('192.0.2.1');
    expect(log).toContain('up --no-start --no-recreate');
    expect(run).toContain('fixture-app:latest');
  });

  it.each([
    ['connected', '11'],
    ['sentinel timed out (the egress chain is absent or not on the FORWARD path)', '20'],
    ['sentinel connected', '21'],
    ['sentinel other error', '22'],
    ['control answered (something else answers for the whole range)', '23'],
    ['gateway sentinel timed out (a default-drop INPUT host without our RMHOS-INPUT chain)', '24'],
    ['gateway sentinel connected', '25'],
    ['gateway sentinel other error', '26'],
    ['gateway control refused', '12'],
    ['other error', '13'],
    ['docker failure', '125'],
  ])('is not proven when the probe %s', (_n, code) => {
    expect(probe({ MOCK_RUN_EXIT: code }).result.status).toBe(1);
  });

  // The container script itself, run here against a fake `net`: what it connects to, in what order, and
  // which exit code each combination of answers gives.
  function runJs(dir: string, answers: Record<string, string>) {
    const preload = join(dir, 'fakenet.cjs');
    writeFileSync(
      preload,
      `const Module = require('module'); const orig = Module._load; const log = [];
Module._load = function (r, ...a) {
  if (r !== 'net') return orig.call(this, r, ...a);
  return { connect: ({ host, port }) => {
    const h = {}; const s = { setTimeout() {}, on(e, f) { h[e] = f; return s; } };
    const a = JSON.parse(process.env.ANSWERS)[host + ':' + port]; log.push(host + ':' + port);
    setImmediate(() => a === 'refused' ? h.error({ code: 'ECONNREFUSED' }) : a === 'connect' ? h.connect() : a === 'error' ? h.error({ code: 'EOTHER' }) : h.timeout());
    return s; } };
};
process.on('exit', () => require('fs').writeFileSync(process.env.CONN_LOG, log.join('\\n')));`,
    );
    const r = spawnSync('node', ['-r', preload, '-e', readFileSync(join(dir, 'probe.js'), 'utf8')], {
      env: { ...process.env, ANSWERS: JSON.stringify(answers), CONN_LOG: join(dir, 'conn.log') },
      encoding: 'utf8',
    });
    return { code: r.status, conns: readFileSync(join(dir, 'conn.log'), 'utf8').split('\n') };
  }
  const good = {
    '192.0.2.1:9': 'refused',
    '192.0.2.1:10': 'timeout',
    '172.31.86.1:9': 'refused',
    '172.31.86.1:10': 'timeout',
  };

  it('requires gateway:9 refused and gateway:10 timed out, after the 192.0.2.1 pair', () => {
    const { dir } = probe();
    const ok = runJs(dir, good);
    expect(ok.code).toBe(10);
    expect(ok.conns).toEqual(['192.0.2.1:9', '192.0.2.1:10', '172.31.86.1:9', '172.31.86.1:10']);
    // a default-drop INPUT host: the gateway sentinel times out too, so it is not proof
    expect(runJs(dir, { ...good, '172.31.86.1:9': 'timeout' }).code).toBe(24);
    expect(runJs(dir, { ...good, '172.31.86.1:9': 'connect' }).code).toBe(25);
    expect(runJs(dir, { ...good, '172.31.86.1:9': 'error' }).code).toBe(26);
    // sentinel refused but the drop behind it is missing
    expect(runJs(dir, { ...good, '172.31.86.1:10': 'refused' }).code).toBe(12);
    expect(runJs(dir, { ...good, '172.31.86.1:10': 'connect' }).code).toBe(11);
    // the egress half still gates first
    expect(runJs(dir, { ...good, '192.0.2.1:9': 'timeout' }).code).toBe(20);
    // Eight cold `node` processes run one after another here; on a loaded CI runner that took 5.8 s against vitest's
    // default 5 s, so the test gets a time budget that fits what it does.
  }, 30_000);

  it('is not proven when the network cannot be created', () => {
    const { result, log } = probe({ MOCK_UP_FAIL: '1' });
    expect(result.status).toBe(1);
    expect(log).not.toContain('run ');
  });
});
