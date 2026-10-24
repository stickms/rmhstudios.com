import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { recordRelease, promoteRelease, readState } from '../../deploy/release-state.mjs';

// Execute the real orchestrator. Its Git, Docker, HTTP and hotswap boundaries
// are hermetic executables; no database, daemon or production service is touched.
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const shaA = 'a'.repeat(40), shaB = 'b'.repeat(40), shaC = 'c'.repeat(40);
const posix = (value: string) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

function fixture(extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rmh-deploy-orchestration-')); dirs.push(dir);
  mkdirSync(join(dir, 'deploy')); mkdirSync(join(dir, 'bin'));
  copyFileSync(resolve('deploy.sh'), join(dir, 'deploy.sh'));
  copyFileSync(resolve('deploy/release-state.mjs'), join(dir, 'deploy/release-state.mjs'));
  writeFileSync(join(dir, '.env.production'), 'DATABASE_URL=postgresql://fixture:fixture@db:5432/rmh\n');
  writeFileSync(join(dir, 'head'), shaA);
  writeFileSync(join(dir, 'deploy/hotswap-web.sh'), '#!/bin/bash\necho swap >> "$MOCK_ROOT/swaps"\necho ::deploy-event::traffic-moved\n');
  writeFileSync(join(dir, 'bin/git'), `#!/bin/bash
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
`, { mode: 0o755 });
  writeFileSync(join(dir, 'bin/docker'), `#!/bin/bash
printf '%s\\n' "$*" >> "$MOCK_ROOT/docker.log"
case "$*" in
  *'migrate status'*)
    if [ "\${MOCK_MIGRATION_FAIL:-0}" = 1 ]; then echo 'Pending migration'; exit 1; fi ;;
  *'migrate deploy'*)
    if [ "\${MOCK_MIGRATION_FAIL:-0}" = 1 ]; then echo 'The \x60unsafe_migration\x60 migration started at 2026-10-23 failed'; echo P3009; exit 1; fi ;;
  *'{{.DockerRootDir}}'*) echo "$MOCK_ROOT" ;;
  *'{{.State.Running}} {{.RestartCount}}'*) echo 'true 0' ;;
  *' ps -q '*) echo fixture-worker ;;
esac
`, { mode: 0o755 });
  writeFileSync(join(dir, 'bin/curl'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  // These cases enter with the deployment lock acquired. The stale observer
  // must still check serving identity inside that critical section.
  writeFileSync(join(dir, 'bin/flock'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  const stateDir = join(dir, '.deploy/releases');
  recordRelease(stateDir, 'release-previous', shaA, 'queued'); promoteRelease(stateDir, 'release-previous', '');
  const env = {
    ...process.env, REPO_DIR: posix(dir), MOCK_ROOT: posix(dir),
    DEPLOY_STATE_DIR: posix(stateDir), DEPLOY_RELEASE_ID: 'release-candidate',
    DEPLOY_LOCKFILE: posix(join(dir, 'lock')), DEPLOY_QUEUE_FILE: posix(join(dir, 'queue')),
    DISCORD_WEBHOOK_URL: '', GITHUB_TOKEN: '', INTERNAL_API_SECRET: '',
    DEPLOY_PULL_RESERVE_GB: '0', DEPLOY_HEADROOM_GB: '0', WORKER_SETTLE_SECONDS: '0', POST_DEPLOY_GUARD: '0', ...extra,
  };
  const command = `PATH=${quote(posix(join(dir, 'bin')))}:${quote(posix(dirname(process.execPath)))}:"$PATH"; export PATH; exec bash ${quote(posix(join(dir, 'deploy.sh')))} production ${shaB}`;
  const result = spawnSync(bash, ['--noprofile', '--norc', '-c', command], { env, encoding: 'utf8', timeout: 20_000 });
  return { dir, result, stateDir, docker: existsSync(join(dir, 'docker.log')) ? readFileSync(join(dir, 'docker.log'), 'utf8') : '' };
}

describe('production deploy orchestration', () => {
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
