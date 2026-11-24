import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// The root side of a deploy's disk request (deploy/disk-cleanup-urgent.sh) and the sandboxed side that writes it
// (deploy/host-cleanup-request.sh). The request file is untrusted input; these pin what is accepted and clamped.

const URGENT = resolve(__dirname, '../disk-cleanup-urgent.sh');
const HELPER = resolve(__dirname, '../host-cleanup-request.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NONCE = '0123456789abcdef';

function urgent(request: string | null | 'symlink') {
  const dir = mkdtempSync(join(tmpdir(), 'disk-urgent-'));
  dirs.push(dir);
  const bin = join(dir, 'bin');
  const runDir = join(dir, '.deploy-run');
  mkdirSync(bin);
  mkdirSync(runDir);
  const stub = (name: string, body: string, where = bin) => {
    writeFileSync(join(where, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(where, name), 0o755);
  };
  const log = join(dir, 'cleanup.log');
  stub('docker', `case "$1" in info) echo "${dir}" ;; esac`);
  stub('df', `case "$*" in *--output=size*) echo Size; echo 20G ;; *) echo Avail; echo 7G ;; esac`);
  stub('cleanup', `echo "target=$DISK_CLEANUP_TARGET_GB from_deploy=$DISK_CLEANUP_FROM_DEPLOY" >> "${log}"; exit 3`);
  const req = join(runDir, 'disk-request');
  if (request === 'symlink') {
    writeFileSync(join(dir, 'elsewhere'), `5 ${NONCE}\n`);
    symlinkSync(join(dir, 'elsewhere'), req);
  } else if (request !== null) {
    writeFileSync(req, request);
  }
  const result = spawnSync('/bin/bash', [URGENT], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      DOCKER_BIN: join(bin, 'docker'),
      REQUEST_DIR: runDir,
      CLEANUP_SCRIPT: join(bin, 'cleanup'),
    },
    encoding: 'utf8',
    timeout: 15_000,
  });
  return {
    result,
    ran: existsSync(log) ? readFileSync(log, 'utf8').trim() : '',
    done: existsSync(join(runDir, 'disk-done')) ? readFileSync(join(runDir, 'disk-done'), 'utf8').trim() : null,
    requestLeft: existsSync(req) || (request === 'symlink' && false),
  };
}

describe.skipIf(process.platform === 'win32')('urgent disk cleanup request (root side)', () => {
  it('runs the safe cleanup with the requested target and answers with the nonce, free GB and status', () => {
    const { result, ran, done, requestLeft } = urgent(`8 ${NONCE}\n`);
    expect(result.status, result.stderr).toBe(0);
    expect(ran).toBe('target=8 from_deploy=1');
    expect(done).toBe(`${NONCE} 7 3`);
    expect(requestLeft).toBe(false);
  });

  it('clamps the target to the size of the disk, and a zero target up to 1', () => {
    expect(urgent(`99999 ${NONCE}\n`).ran).toBe('target=20 from_deploy=1');
    expect(urgent(`0 ${NONCE}\n`).ran).toBe('target=1 from_deploy=1');
  });

  it.each([
    ['empty', ''],
    ['no nonce', '8\n'],
    ['non-hex nonce', '8 zzzzzzzzzz\n'],
    ['short nonce', '8 abc\n'],
    ['uppercase nonce', `8 ${NONCE.toUpperCase()}\n`],
    ['negative target', `-5 ${NONCE}\n`],
    ['non-integer target', `5.5 ${NONCE}\n`],
    ['shell metacharacters', `5; touch /tmp/pwned ${NONCE}\n`],
    ['command substitution', `$(id) ${NONCE}\n`],
    ['extra field', `8 ${NONCE} extra\n`],
    ['huge target', `123456 ${NONCE}\n`],
  ])('ignores a malformed request (%s) without running anything', (_name, body) => {
    const { result, ran, done, requestLeft } = urgent(body);
    expect(result.status, result.stderr).toBe(0);
    expect(ran).toBe('');
    expect(done).toBeNull();
    expect(requestLeft).toBe(false);
  });

  it('ignores a symlinked request', () => {
    const { result, ran, done } = urgent('symlink');
    expect(result.status, result.stderr).toBe(0);
    expect(ran).toBe('');
    expect(done).toBeNull();
  });

  it('does nothing without a request', () => {
    const { result, ran, done } = urgent(null);
    expect(result.status, result.stderr).toBe(0);
    expect(ran).toBe('');
    expect(done).toBeNull();
  });
});

describe.skipIf(process.platform === 'win32')('deploy-side request helper', () => {
  function helper(opts: { installed: boolean; answer: boolean; wait?: number }) {
    const dir = mkdtempSync(join(tmpdir(), 'host-request-'));
    dirs.push(dir);
    const runDir = join(dir, '.deploy-run');
    writeFileSync(join(dir, 'systemctl'), `#!/usr/bin/env bash\n${opts.installed ? 'exit 0' : 'exit 1'}\n`);
    chmodSync(join(dir, 'systemctl'), 0o755);
    // A stand-in for root: answers the request with its nonce.
    const responder = opts.answer
      ? `( for i in $(seq 1 100); do [ -f "${runDir}/disk-request" ] && { read -r t n < "${runDir}/disk-request"; echo "$t" > "${dir}/asked"; echo "$n 9 0" > "${runDir}/disk-done"; rm -f "${runDir}/disk-request"; break; }; sleep 0.1; done ) &`
      : '';
    const script = `
      set -euo pipefail
      . "${HELPER}"
      ${responder}
      rc=0; request_host_cleanup 12 || rc=$?
      echo "rc=$rc"
      echo "outcome=$HOST_CLEANUP_OUTCOME"
    `;
    const result = spawnSync('/bin/bash', ['-c', script], {
      env: {
        ...process.env,
        SYSTEMCTL_BIN: join(dir, 'systemctl'),
        DEPLOY_RUN_DIR: runDir,
        DEPLOY_HOST_CLEANUP_WAIT_SECONDS: String(opts.wait ?? 2),
        HOST_CLEANUP_POLL_SECONDS: '1',
      },
      encoding: 'utf8',
      timeout: 20_000,
    });
    return {
      out: result.stdout,
      asked: existsSync(join(dir, 'asked')) ? readFileSync(join(dir, 'asked'), 'utf8').trim() : null,
      requestLeft: existsSync(join(runDir, 'disk-request')),
    };
  }

  it('reports "not installed" (rc 2) without writing a request', () => {
    const { out, requestLeft } = helper({ installed: false, answer: false });
    expect(out).toContain('rc=2');
    expect(out).toContain('not installed');
    expect(requestLeft).toBe(false);
  });

  it('writes "<target> <nonce>" and returns once the matching nonce is answered', () => {
    const { out, asked } = helper({ installed: true, answer: true });
    expect(out).toContain('rc=0');
    expect(out).toContain('host cleanup finished (9G free, exit 0)');
    expect(asked).toBe('12');
  });

  it('times out (rc 1) and withdraws the request when nobody answers', () => {
    const { out, requestLeft } = helper({ installed: true, answer: false, wait: 2 });
    expect(out).toContain('rc=1');
    expect(out).toContain('did not answer within 2s');
    expect(requestLeft).toBe(false);
  });
});
