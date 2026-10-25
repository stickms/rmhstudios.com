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

function run(opts: { disk?: number; deploying?: boolean; dryRun?: boolean } = {}) {
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
  stub('df', 'echo "Filesystem 1024-blocks Used Available Capacity Mounted on"; echo "/dev/vda1 100 0 0 ${FAKE_DISK}% /"');
  stub('flock', '[ "${FAKE_DEPLOYING:-0}" = 1 ] && exit 1 || exit 0');
  stub('journalctl', `echo "journalctl $*" >> "${log}"`);
  stub('apt-get', `echo "apt-get $*" >> "${log}"`);

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
});
