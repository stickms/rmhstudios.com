import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// deploy/host-check.sh is the only thing that sees the VPS's disks, memory and
// kernel log. This runs the real script against stub df / docker / journalctl /
// flock and a fake /proc/meminfo, and records what it would send on-call.

const SCRIPT = resolve(__dirname, '../host-check.sh');

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'host-check-'));
  const bin = join(dir, 'bin');
  execFileSync('mkdir', ['-p', bin, join(dir, 'state')]);
  const stub = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  stub('df', 'echo "Filesystem 1024-blocks Used Available Capacity Mounted on"; echo "/dev/vda1 100 0 0 ${FAKE_DISK}% /"');
  stub(
    'docker',
    `case "$1" in
       info) echo /var/lib/docker ;;
       ps) echo abc123 ;;
       inspect) echo "/rmhstudios-prod-socket \${FAKE_HEALTH} \${FAKE_RESTARTS}" ;;
     esac`,
  );
  stub('journalctl', 'printf "%s" "${FAKE_KERNEL:-}"');
  stub('flock', '[ "${FAKE_DEPLOYING:-0}" = 1 ] && exit 1 || exit 0');
  const sent = join(dir, 'sent.log');
  stub('send', `echo "$*" >> ${sent}`);
  const meminfo = join(dir, 'meminfo');
  const lock = join(dir, 'autodeploy-production.lock');
  writeFileSync(lock, '');

  const run = (over: { disk?: number; availPct?: number; health?: string; restarts?: number; kernel?: string; deploying?: boolean } = {}) => {
    writeFileSync(meminfo, `MemTotal: 1000000 kB\nMemAvailable: ${(over.availPct ?? 50) * 10000} kB\n`);
    writeFileSync(sent, '');
    execFileSync('bash', [SCRIPT], {
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        STATE_DIR: join(dir, 'state'),
        HOST_CHECK_SEND: join(bin, 'send'),
        MEMINFO: meminfo,
        DEPLOY_LOCKS: lock,
        FAKE_DISK: String(over.disk ?? 40),
        FAKE_HEALTH: over.health ?? 'healthy',
        FAKE_RESTARTS: String(over.restarts ?? 0),
        FAKE_KERNEL: over.kernel ?? '',
        FAKE_DEPLOYING: over.deploying ? '1' : '0',
      },
    });
    return readFileSync(sent, 'utf8').trim().split('\n').filter(Boolean);
  };
  return { run };
}

describe('host-check.sh', () => {
  it('a healthy host sends only its heartbeat', () => {
    const { run } = harness();
    expect(run()).toEqual(['heartbeat host']);
    expect(run()).toEqual(['heartbeat host']);
  });

  it('disk: Sev3 at 85%, Sev2 at 92%, resolved when it drops — each sent once', () => {
    const { run } = harness();
    expect(run({ disk: 87 })).toContainEqual(expect.stringMatching(/^alert firing B01 3 .*root$/));
    expect(run({ disk: 87 })).toEqual(['heartbeat host']); // no re-send while unchanged
    const crit = run({ disk: 95 });
    expect(crit).toContainEqual(expect.stringMatching(/^alert firing A13 2 /));
    expect(crit).toContainEqual(expect.stringMatching(/^alert resolved B01 /));
    expect(run({ disk: 50 })).toContainEqual(expect.stringMatching(/^alert resolved A13 /));
  });

  it('memory under 5% available pages', () => {
    const { run } = harness();
    expect(run({ availPct: 3 })).toContainEqual(expect.stringMatching(/^alert firing A14 2 .*memory$/));
    expect(run({ availPct: 40 })).toContainEqual(expect.stringMatching(/^alert resolved A14 .*memory$/));
  });

  it('a kernel OOM kill pages', () => {
    const { run } = harness();
    const out = run({ kernel: 'Out of memory: Killed process 4242 (node)' });
    expect(out).toContainEqual(expect.stringMatching(/^alert firing A14 2 Kernel OOM killer fired .*4242.* oom$/));
  });

  it('containers: unhealthy alerts; a restart outside a deploy alerts, during one does not', () => {
    const { run } = harness();
    run({ restarts: 1 }); // baseline
    expect(run({ health: 'unhealthy', restarts: 1 })).toContainEqual(expect.stringMatching(/^alert firing B05 3 Container unhealthy/));
    expect(run({ restarts: 2, deploying: true })).not.toContainEqual(expect.stringMatching(/Container restarted/));
    expect(run({ restarts: 3 })).toContainEqual(expect.stringMatching(/^alert firing B05 3 Container restarted: rmhstudios-prod-socket/));
  });
});
