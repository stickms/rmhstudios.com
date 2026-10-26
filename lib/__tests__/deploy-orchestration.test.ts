import { afterEach, describe, expect, it } from 'vitest';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { recordRelease, promoteRelease, readState } from '../../deploy/release-state.mjs';

// Execute the real orchestrator. Its Git, Docker, HTTP and hotswap boundaries
// are hermetic executables; no database, daemon or production service is touched.
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const shaA = 'a'.repeat(40),
  shaB = 'b'.repeat(40),
  shaC = 'c'.repeat(40);
const posix = (value: string) =>
  value
    .replaceAll('\\', '/')
    .replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

function fixture(
  extra: Record<string, string> = {},
  options: { realFlock?: boolean; fakeDisk?: boolean } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'rmh-deploy-orchestration-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'deploy'));
  mkdirSync(join(dir, 'bin'));
  copyFileSync(resolve('deploy.sh'), join(dir, 'deploy.sh'));
  copyFileSync(resolve('deploy/release-state.mjs'), join(dir, 'deploy/release-state.mjs'));
  writeFileSync(
    join(dir, '.env.production'),
    'DATABASE_URL=postgresql://fixture:fixture@db:5432/rmh\n',
  );
  writeFileSync(join(dir, 'head'), shaA);
  writeFileSync(
    join(dir, 'deploy/hotswap-web.sh'),
    `#!/bin/bash
if [ "\${MOCK_LATE_FAILURE:-0}" = 1 ]; then
  while [ ! -s "$HEALTH_RESULT_FILE" ]; do sleep 0.02; done
  touch "$MOCK_ROOT/late-failure"
fi
echo swap >> "$MOCK_ROOT/swaps"
echo ::deploy-event::traffic-moved
`,
  );
  writeFileSync(
    join(dir, 'bin/git'),
    `#!/bin/bash
set -e
case "$1" in
  fetch)
    if [ "$3" = "${shaB}" ] && [ "\${MOCK_UNREACHABLE:-0}" = 1 ]; then exit 1; fi ;;
  checkout) ;;
  cat-file) [ "\${MOCK_UNREACHABLE:-0}" != 1 ] ;;
  merge-base) exit 1 ;;
  rev-parse)
    if [ "$2" = --verify ]; then printf '%s' "\${4%\\^*}";
    elif [ "$2" = --short ]; then cut -c1-12 "$MOCK_ROOT/head";
    else cat "$MOCK_ROOT/head"; fi ;;
  reset)
    target="$3"; [ "$target" != origin/main ] || target="${shaC}"
    printf '%s' "$target" > "$MOCK_ROOT/head"
    if [ "\${MOCK_SELF_UPDATE:-0}" = 1 ] && [ ! -f "$MOCK_ROOT/updated" ]; then
      touch "$MOCK_ROOT/updated"; printf '\\n# script update\\n' >> "$MOCK_ROOT/deploy.sh"
    fi ;;
  log) echo fixture ;;
esac
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(dir, 'bin/docker'),
    `#!/bin/bash
printf '%s\\n' "$*" >> "$MOCK_ROOT/docker.log"
if [ "$1" = pull ]; then
  # no-space: fails until the deploy has reclaimed (builder prune -af), or always
  if [ "\${MOCK_PULL_NOSPACE:-}" = always ] || { [ "\${MOCK_PULL_NOSPACE:-}" = 1 ] && [ ! -f "$MOCK_ROOT/reclaimed" ]; }; then
    echo 'write /var/lib/docker/tmp/layer: no space left on device' >&2; exit 1
  fi
  if [ "\${MOCK_PULL_FAIL:-0}" = 1 ]; then echo 'manifest unknown' >&2; exit 1; fi
fi
case "$*" in
  *'builder prune -af'*) touch "$MOCK_ROOT/reclaimed" ;;
  *'migrate status'*)
    if [ "\${MOCK_MIGRATION_FAIL:-0}" = 1 ]; then echo 'Pending migration'; exit 1; fi ;;
  *'migrate deploy'*)
    if [ "\${MOCK_MIGRATION_FAIL:-0}" = 1 ]; then echo 'The \x60unsafe_migration\x60 migration started at 2026-10-23 failed'; echo P3009; exit 1; fi ;;
  *'{{.DockerRootDir}}'*) echo "$MOCK_ROOT" ;;
  *'{{.State.Running}} {{.RestartCount}}'*)
    if [ -f "$MOCK_ROOT/late-failure" ] && [ ! -f "$MOCK_ROOT/restored" ]; then echo 'true 1'; else echo 'true 0'; fi ;;
  *' up -d '*) [ ! -f "$MOCK_ROOT/late-failure" ] || touch "$MOCK_ROOT/restored" ;;
  *' ps -q '*) echo fixture-worker ;;
esac
`,
    { mode: 0o755 },
  );
  writeFileSync(join(dir, 'bin/curl'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  // These cases enter with the deployment lock acquired. The stale observer
  // must still check serving identity inside that critical section.
  if (!options.realFlock)
    writeFileSync(join(dir, 'bin/flock'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  // Disk is the one thing the host really controls: report 1G free until the deploy
  // has cleared the BuildKit cache, then 50G, so the reclaim ladder can be observed.
  if (options.fakeDisk)
    writeFileSync(
      join(dir, 'bin/df'),
      `#!/bin/bash
if [ -f "$MOCK_ROOT/reclaimed" ]; then n=50; else n=1; fi
case "$*" in *--output=size*) printf 'Size\\n100G\\n' ;; *) printf 'Avail\\n%sG\\n' "$n" ;; esac
`,
      { mode: 0o755 },
    );
  // A stand-in for the 15-minute watcher: it outlives the deploy, as the real one does.
  writeFileSync(
    join(dir, 'deploy/post-deploy-guard.sh'),
    '#!/bin/bash\necho $$ > "$MOCK_ROOT/guard.pid"\nexec sleep 30\n',
    { mode: 0o755 },
  );
  const stateDir = join(dir, '.deploy/releases');
  recordRelease(stateDir, 'release-previous', shaA, 'queued');
  promoteRelease(stateDir, 'release-previous', '');
  recordRelease(stateDir, 'release-previous', shaA, 'success');
  const env = {
    ...process.env,
    REPO_DIR: posix(dir),
    MOCK_ROOT: posix(dir),
    DEPLOY_STATE_DIR: posix(stateDir),
    DEPLOY_RELEASE_ID: 'release-candidate',
    DEPLOY_LOCKFILE: posix(join(dir, 'lock')),
    DEPLOY_QUEUE_FILE: posix(join(dir, 'queue')),
    DISCORD_WEBHOOK_URL: '',
    GITHUB_TOKEN: '',
    INTERNAL_API_SECRET: '',
    DEPLOY_PULL_RESERVE_GB: '0',
    DEPLOY_HEADROOM_GB: '0',
    WORKER_SETTLE_SECONDS: '0',
    POST_DEPLOY_GUARD: '0',
    GUARD_LOG: posix(join(dir, 'guard.log')),
    ...extra,
  };
  const command = `PATH=${quote(posix(join(dir, 'bin')))}:${quote(posix(dirname(process.execPath)))}:"$PATH"; export PATH; exec bash ${quote(posix(join(dir, 'deploy.sh')))} production ${shaB}`;
  const result = spawnSync(bash, ['--noprofile', '--norc', '-c', command], {
    env,
    encoding: 'utf8',
    timeout: 20_000,
  });
  return {
    dir,
    result,
    stateDir,
    docker: existsSync(join(dir, 'docker.log'))
      ? readFileSync(join(dir, 'docker.log'), 'utf8')
      : '',
  };
}

describe('production deploy orchestration', () => {
  const pulls = (docker: string) => docker.split('\n').filter((line) => line.startsWith('pull '));
  // A pull can outgrow the up-front estimate and die mid-transfer. That is fixable
  // by freeing space, so reclaim and retry once instead of failing the release.
  it('reclaims and retries once when a pull runs out of disk', () => {
    const { result, docker } = fixture({ MOCK_PULL_NOSPACE: '1' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('Pull ran out of disk');
    expect(pulls(docker)).toHaveLength(4);
    expect(docker.indexOf('builder prune -af')).toBeLessThan(docker.lastIndexOf('pull '));
  }, 25_000);
  // Freeing the build cache is cheap and enough here; deleting every unused image
  // would also remove the :rollback image the post-deploy rollback depends on.
  it('stops reclaiming once there is enough room and keeps the rollback images', () => {
    const { result, docker } = fixture(
      { DEPLOY_PULL_RESERVE_GB: '6', DEPLOY_HEADROOM_GB: '2' },
      { fakeDisk: true },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(docker).toContain('builder prune -af');
    expect(docker).not.toContain('image prune -af');
    expect(result.stdout).toContain('After reclaim: 50G free');
  }, 25_000);
  it('retries a no-space pull only once', () => {
    const { result, docker, stateDir } = fixture({ MOCK_PULL_NOSPACE: 'always' });
    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(pulls(docker)).toHaveLength(4);
    expect(readState(stateDir, 'live')?.sha).toBe(shaA);
  }, 25_000);
  it('does not reclaim or retry when a pull fails for another reason', () => {
    const { result, docker } = fixture({ MOCK_PULL_FAIL: '1' });
    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(pulls(docker)).toHaveLength(2);
    expect(docker).not.toContain('builder prune -af');
    expect(result.stdout).not.toContain('Pull ran out of disk');
  }, 25_000);
  // 2026-10-25: the disk filled mid-deploy, took Postgres down, and left containers
  // unable to start. The guard must reclaim the (otherwise never-cleaned) BuildKit
  // cache first and, if there is still not enough room, refuse BEFORE pulling.
  it('reclaims the build cache and refuses to pull when it cannot make room', () => {
    const { result, docker } = fixture({ DEPLOY_PULL_RESERVE_GB: '999999' });
    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(docker).toContain('builder prune -af');
    expect(result.stdout).toContain('need ≥');
    expect(docker).not.toContain('pull ');
  }, 25_000);
  it('trims only old build cache, and nothing hard, when there is room', () => {
    const { result, docker } = fixture();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(docker).toMatch(/builder prune -f --filter until=72h/);
    expect(docker).not.toContain('builder prune -af');
  }, 25_000);
  // Every journal write goes through node. Without it the release used to die
  // part-way through with only "node: command not found" in the listener log.
  it.skipIf(process.platform === 'win32')('refuses to start when node is not on PATH', () => {
    const empty = mkdtempSync(join(tmpdir(), 'rmh-deploy-nonode-'));
    dirs.push(empty);
    const result = spawnSync('/bin/bash', [resolve('deploy.sh'), 'production', shaB], {
      env: { PATH: empty },
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('node is not on PATH');
  });
  // Needs the real flock(1): a detached child that inherits the lock descriptor
  // keeps the lock after the deploy exits, so the next push queued behind it.
  it.skipIf(process.platform === 'win32' || spawnSync('flock', ['-V']).error !== undefined)(
    'releases the deployment lock when it hands off to the post-deploy guard',
    async () => {
      const { dir, result } = fixture({ POST_DEPLOY_GUARD: '1' }, { realFlock: true });
      const pidFile = join(dir, 'guard.pid');
      try {
        expect(result.status, result.stdout + result.stderr).toBe(0);
        // The guard is launched in the background and deploy.sh exits straight
        // away, so on a loaded runner it may not have written its pid yet.
        for (let i = 0; i < 250 && !existsSync(pidFile); i++)
          await new Promise((done) => setTimeout(done, 20));
        expect(existsSync(pidFile), 'the guard must have been started').toBe(true);
        const next = spawnSync('flock', ['-n', join(dir, 'lock'), 'true']);
        expect(next.status, 'a following deploy must be able to take the lock').toBe(0);
      } finally {
        if (existsSync(pidFile)) {
          try {
            process.kill(Number(readFileSync(pidFile, 'utf8')));
          } catch {
            /* already gone */
          }
        }
      }
    },
    25_000,
  );
  it('assigns a valid release identity to a manual deployment', () => {
    const { result, stateDir } = fixture({ DEPLOY_RELEASE_ID: '' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readState(stateDir, 'live')?.id).toMatch(/^release-\d+-\d+$/);
    expect(readState(stateDir, 'last-successful')?.sha).toBe(shaB);
  }, 25_000);
  it('detects a worker restart after the initial parallel checks finish', () => {
    const { result, stateDir } = fixture({ MOCK_LATE_FAILURE: '1' });
    expect(result.status, result.error?.message || result.stdout + result.stderr).toBe(1);
    expect(result.stdout).toContain('Rolling back non-web services');
    expect(readState(stateDir, 'last-successful')?.sha).toBe(shaA);
    expect(readState(stateDir, 'release-candidate')?.phase).toBe('rolledback');
  }, 25_000);
  it('preserves the approved SHA through a script self-update while main advances', () => {
    const { result, stateDir, docker } = fixture({ MOCK_SELF_UPDATE: '1' });
    expect(result.status, result.error?.message || result.stdout + result.stderr).toBe(0);
    expect(readState(stateDir, 'live')?.sha).toBe(shaB);
    expect(docker).toContain(`pull ghcr.io/stickms/rmhstudios-app:${shaB}`);
    expect(docker).not.toContain(`:${shaC}`);
  }, 25_000);
  it('does not mark a partially failed migration rolled back or move traffic', () => {
    const { dir, result, stateDir, docker } = fixture({ MOCK_MIGRATION_FAIL: '1' });
    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(docker).not.toContain('resolve --rolled-back');
    expect(result.stdout).toContain('P3009');
    expect(readState(stateDir, 'live')?.sha).toBe(shaA);
    expect(readState(stateDir, 'release-candidate')?.phase).toBe('fail');
    expect(existsSync(join(dir, 'swaps'))).toBe(false);
  }, 25_000);
  it('fails closed when the approved commit cannot be fetched', () => {
    const { result, stateDir, docker } = fixture({ MOCK_UNREACHABLE: '1' });
    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(docker).not.toContain('pull ');
    expect(result.stdout).toContain('Cannot fetch the approved SHA');
    expect(readState(stateDir, 'live')?.sha).toBe(shaA);
  }, 25_000);
  it('fences a queued alarm rollback after a newer release takes over', () => {
    const { result, docker, stateDir } = fixture({ DEPLOY_EXPECT_LIVE_ID: 'release-obsolete' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(docker).not.toContain('pull ');
    expect(readState(stateDir, 'release-candidate')?.phase).toBe('superseded');
    expect(readState(stateDir, 'live')?.sha).toBe(shaA);
  }, 25_000);
});
