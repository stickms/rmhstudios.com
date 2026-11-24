import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// deploy/disk-cleanup.sh runs as root on the host between deploys. These run the
// real script against stub docker / df / flock / journalctl and real temp
// directories, and pin what it may and may not remove.

const SCRIPT = resolve(__dirname, '../disk-cleanup.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const IMAGES = [
  '2026-10-25 16:05:00 +0000 UTC|rmhstudios-prod-app:latest',
  '2026-10-25 16:05:00 +0000 UTC|rmhstudios-prod-app:rollback',
  '2026-10-25 16:05:00 +0000 UTC|rmhstudios-prod-app:86e010c',
  '2026-10-22 20:00:00 +0000 UTC|rmhstudios-prod-app:8203b9b',
  '2026-10-20 20:00:00 +0000 UTC|rmhstudios-prod-app:aaaaaaa',
  '2026-10-18 20:00:00 +0000 UTC|rmhstudios-prod-app:bbbbbbb',
  '2026-10-25 16:05:00 +0000 UTC|rmhstudios-prod-app-full:86e010c',
  '2026-10-22 20:00:00 +0000 UTC|rmhstudios-prod-app-full:8203b9b',
  '2026-10-19 20:00:00 +0000 UTC|rmhstudios-prod-app-full:ccccccc',
  '2026-10-25 16:05:00 +0000 UTC|postgres:14',
].join('\n');

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

function run(
  opts: {
    disk?: number;
    deploying?: boolean;
    dryRun?: boolean;
    target?: number;
    fromDeploy?: boolean;
    freeBase?: number;
    freeStep?: number;
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'disk-cleanup-'));
  dirs.push(dir);
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const stub = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  const log = join(dir, 'calls.log');
  stub(
    'docker',
    `echo "$*" >> "${log}"
case "$1" in
  info) echo "${dir}" ;;
  images) printf '%s\\n' "$FAKE_IMAGES" ;;
esac`,
  );
  // `df -BG --output=avail` grows by FAKE_FREE_STEP per call (a counter file), so each cleanup step "frees" space.
  stub(
    'df',
    `case "$*" in
  *--output=avail*)
    n=$(cat "${dir}/df-count" 2>/dev/null || echo 0)
    echo Avail; echo "$((FAKE_FREE_BASE + n * FAKE_FREE_STEP))G"; echo $((n + 1)) > "${dir}/df-count" ;;
  *--output=size*) echo Size; echo 100G ;;
  *) echo "Filesystem 1024-blocks Used Available Capacity Mounted on"; echo "/dev/vda1 100 0 0 \${FAKE_DISK}% /" ;;
esac`,
  );
  stub('flock', '[ "${FAKE_DEPLOYING:-0}" = 1 ] && exit 1 || exit 0');
  stub('journalctl', `echo "journalctl $*" >> "${log}"`);
  stub('apt-get', `echo "apt-get $*" >> "${log}"`);
  // The pressure report runs `du` over the real /home; on a CI runner that is the whole checkout and outlasts the 5 s
  // test timeout. Stub it like every other host command.
  stub('du', 'printf "4.0K\\t/home\\n"');

  const cores = join(dir, 'coredump');
  const tmp = join(dir, 'tmp');
  mkdirSync(cores);
  mkdirSync(tmp);
  const lock = join(dir, 'autodeploy-production.lock');
  writeFileSync(lock, '');
  const file = (path: string, ageDays: number) => {
    writeFileSync(path, 'x');
    utimesSync(path, daysAgo(ageDays), daysAgo(ageDays));
  };
  file(join(cores, 'old.crash'), 3);
  file(join(cores, 'fresh.crash'), 0);
  file(join(tmp, 'autodeploy-production-1.log'), 10);
  file(join(tmp, 'autodeploy-production-2.log'), 0);
  file(join(tmp, 'autodeploy-production-3.log'), 1);
  file(join(tmp, 'pull-web.OLD123'), 10);
  file(join(tmp, 'unrelated-old.txt'), 10);

  const result = spawnSync('/bin/bash', [SCRIPT], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      DOCKER_BIN: join(bin, 'docker'),
      DEPLOY_LOCKS: lock,
      COREDUMP_DIRS: cores,
      CLEANUP_TMP_DIRS: tmp,
      FAKE_DISK: String(opts.disk ?? 40),
      FAKE_DEPLOYING: opts.deploying ? '1' : '0',
      FAKE_IMAGES: IMAGES,
      DRY_RUN: opts.dryRun ? '1' : '0',
      FAKE_FREE_BASE: String(opts.freeBase ?? 0),
      FAKE_FREE_STEP: String(opts.freeStep ?? 0),
      ...(opts.target !== undefined ? { DISK_CLEANUP_TARGET_GB: String(opts.target) } : {}),
      ...(opts.fromDeploy ? { DISK_CLEANUP_FROM_DEPLOY: '1' } : {}),
    },
    encoding: 'utf8',
    timeout: 15_000,
  });
  return {
    result,
    out: result.stdout + result.stderr,
    calls: existsSync(log) ? readFileSync(log, 'utf8') : '',
    exists: (name: string) => existsSync(join(name.startsWith('coredump') ? dir : dir, name)),
  };
}

describe.skipIf(process.platform === 'win32')('disk cleanup between deploys', () => {
  it('only removes what no release reads again when the disk is healthy', () => {
    const { result, calls, exists } = run({ disk: 40 });
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toContain('container prune -f --filter until=24h');
    expect(calls).toContain('image prune -f');
    expect(calls).toContain('builder prune -f --filter until=72h');
    // Nothing a deploy, rollback or pull needs:
    expect(calls).not.toContain('builder prune -af');
    expect(calls).not.toContain('image prune -af');
    expect(calls).not.toMatch(/\brmi\b/);
    expect(calls).not.toContain('journalctl');
    expect(exists('coredump/old.crash')).toBe(false);
    expect(exists('coredump/fresh.crash')).toBe(true);
    expect(exists('tmp/autodeploy-production-1.log')).toBe(false);
    expect(exists('tmp/pull-web.OLD123')).toBe(false);
    expect(exists('tmp/autodeploy-production-2.log')).toBe(true);
    expect(exists('tmp/unrelated-old.txt')).toBe(true);
  });

  it('under disk pressure also drops old release images, never the live or rollback ones', () => {
    const { result, out, calls, exists } = run({ disk: 85 });
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toContain('builder prune -af');
    expect(calls).toContain('journalctl --vacuum-size=200M');
    const removed = calls.split('\n').filter((line) => line.startsWith('rmi ')).sort();
    expect(removed).toEqual([
      'rmi rmhstudios-prod-app-full:ccccccc',
      'rmi rmhstudios-prod-app:aaaaaaa',
      'rmi rmhstudios-prod-app:bbbbbbb',
    ]);
    expect(calls).not.toMatch(/rmi .*:(latest|rollback)\b/);
    expect(calls).not.toContain('postgres');
    expect(calls).not.toContain('image prune -af');
    expect(exists('coredump/fresh.crash')).toBe(false);
    expect(out).toContain('still at 85%');
  });

  it('does nothing while a deploy holds the lock', () => {
    const { result, out, calls, exists } = run({ disk: 95, deploying: true });
    expect(result.status).toBe(0);
    expect(out).toContain('a deploy is running');
    expect(calls).not.toMatch(/prune|rmi|journalctl/);
    expect(exists('coredump/old.crash')).toBe(true);
  });

  it('removes nothing in a dry run', () => {
    const { result, out, calls, exists } = run({ disk: 85, dryRun: true });
    expect(result.status, result.stderr).toBe(0);
    expect(out).toContain('(dry run)');
    expect(calls).not.toMatch(/prune|rmi|journalctl/);
    expect(exists('coredump/old.crash')).toBe(true);
    expect(exists('tmp/autodeploy-production-1.log')).toBe(true);
  });

  describe('target mode (a deploy short of space)', () => {
    const rmiList = (calls: string) => calls.split('\n').filter((line) => line.startsWith('rmi '));

    it('stops as soon as the target is free', () => {
      // free: 1G at start, +1G after each step. Target 3G: BuildKit cache (2), core dumps (3) -> stop.
      const { result, out, calls, exists } = run({ disk: 90, target: 3, fromDeploy: true, freeBase: 1, freeStep: 1 });
      expect(result.status, result.stderr).toBe(0);
      expect(calls).toContain('builder prune -af');
      expect(exists('coredump/fresh.crash')).toBe(false);
      expect(out).toContain("step 'core dumps': freed 1G, 3G free");
      expect(out).toContain('target reached');
      expect(calls).not.toContain('journalctl');
      expect(rmiList(calls)).toEqual([]);
      expect(exists('tmp/autodeploy-production-3.log')).toBe(true);
    });

    it('does nothing past the routine pass when the target is already met', () => {
      const { out, calls } = run({ target: 3, fromDeploy: true, freeBase: 9 });
      expect(out).toContain('target already met');
      expect(calls).not.toContain('builder prune -af');
    });

    it('runs every tier, in order, when the target is never met', () => {
      const { result, out, calls, exists } = run({ disk: 95, target: 50, fromDeploy: true, freeBase: 1, freeStep: 0 });
      expect(result.status, result.stderr).toBe(0);
      const steps = [...out.matchAll(/step '([^']+)'/g)].map((m) => m[1]);
      expect(steps).toEqual([
        'all BuildKit cache',
        'core dumps',
        'journald to 200M',
        'apt cache',
        'stale deploy temp files',
        'old release images (keep 2)',
        'old release images (keep 1)',
      ]);
      expect(calls).toContain('journalctl --vacuum-size=200M');
      expect(exists('coredump/fresh.crash')).toBe(false);
      // Any age, but not the live one (touched within 15 minutes) and not unrelated files.
      expect(exists('tmp/autodeploy-production-3.log')).toBe(false);
      expect(exists('tmp/autodeploy-production-2.log')).toBe(true);
      expect(exists('tmp/unrelated-old.txt')).toBe(true);
      expect(out).toContain('target NOT reached');
    });

    it('never removes :latest, :rollback or the newest image, even at keep 1', () => {
      const { calls } = run({ target: 50, fromDeploy: true, freeBase: 1 });
      const removed = rmiList(calls);
      expect(removed).toContain('rmi rmhstudios-prod-app:8203b9b');
      expect(removed).toContain('rmi rmhstudios-prod-app-full:8203b9b');
      expect(removed).toContain('rmi rmhstudios-prod-app:aaaaaaa');
      expect(removed.join('\n')).not.toMatch(/:(latest|rollback|86e010c)\b/);
      expect(calls).not.toContain('postgres');
      expect(calls).not.toContain('image prune -af');
    });

    it('FROM_DEPLOY bypasses the deploy-lock skip; without it the run still skips', () => {
      const skipped = run({ deploying: true, target: 50, freeBase: 1 });
      expect(skipped.out).toContain('a deploy is running');
      expect(skipped.calls).not.toMatch(/prune|rmi/);
      const asked = run({ deploying: true, target: 50, fromDeploy: true, freeBase: 1 });
      expect(asked.out).not.toContain('a deploy is running');
      expect(asked.calls).toContain('builder prune -af');
    });

    it('without a target behaves as before (no step log, pressure pass only)', () => {
      const { out, calls } = run({ disk: 40 });
      expect(out).not.toContain('target mode');
      expect(calls).not.toContain('builder prune -af');
    });

    it('rejects a target that is not an integer', () => {
      const dir = mkdtempSync(join(tmpdir(), 'disk-cleanup-'));
      dirs.push(dir);
      const result = spawnSync('/bin/bash', [SCRIPT], {
        env: { ...process.env, DISK_CLEANUP_TARGET_GB: '5; rm -rf /', DOCKER_BIN: 'true', DEPLOY_LOCKS: '' },
        encoding: 'utf8',
        timeout: 15_000,
      });
      expect(result.status).toBe(2);
    });

    it('stays honest in a dry run: every tier is only logged, nothing is removed', () => {
      const { result, out, calls, exists } = run({ disk: 95, target: 50, fromDeploy: true, dryRun: true, freeBase: 1 });
      expect(result.status, result.stderr).toBe(0);
      expect(out).toMatch(/\(dry run\) .*docker rmi /);
      expect(out).toContain('(dry run) rm ');
      expect(calls).not.toMatch(/prune|rmi|journalctl|apt-get/);
      expect(exists('coredump/fresh.crash')).toBe(true);
      expect(exists('tmp/autodeploy-production-3.log')).toBe(true);
    });
  });
});
