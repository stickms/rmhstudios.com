import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const deploy = readFileSync(resolve(import.meta.dirname, '../../deploy.sh'), 'utf8');

function section(start: string, end: string) {
  const from = deploy.indexOf(start);
  const to = deploy.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing deployment section: ${start} → ${end}`);
  return deploy.slice(from, to);
}

const launch = section('# ── Step 2a:', '# ── Step 3b:');
const joins = section('# ── Join background best-effort jobs', '# ── Cloudflare cache rules');
const compose = section('dc() {', '# ── Helper: prune');
const dirs: string[] = [];
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const shellPath = (value: string) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive: string) => '/' + drive.toLowerCase());

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Invocation {
  args: string[];
  migrated: boolean;
  attached: boolean;
}

function runDeploy(options: {
  cdn?: boolean;
  folders?: string[];
  storage?: string;
  absoluteStorage?: boolean;
  staging?: boolean;
  migration?: 'pending' | 'current' | 'fail';
  failJob?: 'avatars' | 'media';
  hangJob?: 'avatars' | 'media';
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'r2-deploy-'));
  dirs.push(dir);
  const repo = join(dir, 'repo with spaces');
  const storage = options.absoluteStorage ? join(dir, 'absolute media') : options.storage ?? './db';
  const storageHost = isAbsolute(storage) ? storage : join(repo, storage);
  mkdirSync(repo, { recursive: true });
  mkdirSync(join(repo, 'deploy'));
  const sourceRoot = resolve(import.meta.dirname, '../..');
  copyFileSync(join(sourceRoot, 'docker-compose.yml'), join(repo, 'docker-compose.yml'));
  const override = 'deploy/docker-compose.backfill.yml';
  if (existsSync(join(sourceRoot, override))) copyFileSync(join(sourceRoot, override), join(repo, override));
  for (const folder of options.folders ?? ['avatars', 'music']) {
    mkdirSync(join(storageHost, folder), { recursive: true });
  }
  const envFile = join(repo, '.env.test');
  writeFileSync(envFile, [
    'DATABASE_URL=postgresql://test:test@base:5432/test',
    ...(options.cdn === false ? [] : ['VITE_CDN_BASE_URL=https://cdn.example.test']),
    options.storage === undefined && !options.absoluteStorage ? 'STORAGE_PATH=' : `STORAGE_PATH="${isAbsolute(storage) ? shellPath(storage) : storage}"`,
  ].join('\n') + '\n');
  writeFileSync(join(dir, 'calls'), '');
  writeFileSync(join(dir, 'events'), '');

  // Docker is the external boundary: record the actual argv and model migration
  // completion. Unknown commands fail closed; no daemon or network is reachable.
  const docker = join(dir, 'docker.cjs');
  writeFileSync(docker, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.TEST_ROOT;
const file = (name) => path.join(root, name);
const event = (name) => fs.appendFileSync(file('events'), name + '\\n');
const mark = (name) => fs.writeFileSync(file(name), '');
const exists = (name) => fs.existsSync(file(name));
const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
const args = process.argv.slice(2);
fs.appendFileSync(file('calls'), JSON.stringify({ args, migrated: exists('migrated'), attached: exists('attached') }) + '\\n');
const cmd = args.join(' ');
if (args[0] === 'inspect') { console.log('true'); process.exit(0); }
if (args[0] === 'image' && args[1] === 'inspect') { console.log('{}'); process.exit(0); }
if (args[0] === 'network') {
  if (args[1] === 'connect') { mark('attached'); event('network-attached'); }
  process.exit(0);
}
if (cmd.includes('scripts/sync-static-assets-to-r2.mjs')) {
  mark('static-started'); event('static-started'); process.exit(0);
}
if (cmd.includes('migrate status')) {
  if (process.env.TEST_CDN === '1') {
    for (let i = 0; i < 200 && !exists('static-started'); i++) pause();
  }
  event('migration-status');
  if (process.env.TEST_MIGRATION === 'current') { mark('migrated'); process.exit(0); }
  console.log('1 pending migration'); process.exit(1);
}
if (cmd.includes('migrate deploy')) {
  event('migration-started'); pause();
  if (process.env.TEST_MIGRATION === 'fail') { console.log('P3018: migration failed'); process.exit(1); }
  mark('migrated'); event('migration-finished'); process.exit(0);
}
const job = cmd.includes('scripts/migrate-avatars-to-r2.ts') ? 'avatars'
  : cmd.includes('scripts/migrate-media-to-r2.ts') ? 'media' : undefined;
if (job) {
  event(job + '-started');
  // The deploy lock rides on fd 200; a background job holding it blocks the next deploy.
  if (fs.existsSync('/proc/self/fd/200')) event(job + '-holds-lock');
  if (process.env.TEST_HANG_JOB === job) for (;;) pause();
  for (let i = 0; i < 200 && !exists('foreground-complete'); i++) pause();
  event(job + (exists('foreground-complete') ? '-background' : '-blocked-foreground'));
  // Stay in flight after foreground work, so dropping the real wait is observable.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  event(job + '-finished');
  process.exit(process.env.TEST_FAIL_JOB === job ? 1 : 0);
}
console.error('Unexpected Docker invocation:', args); process.exit(97);
`);
  chmodSync(docker, 0o755);
  const dockerWrapper = join(dir, 'docker-wrapper');
  writeFileSync(dockerWrapper, `#!/bin/bash\nexec ${quote(shellPath(process.execPath))} ${quote(shellPath(docker))} "$@"\n`, { mode: 0o755 });

  const harnessScript = join(dir, 'harness.sh');
  writeFileSync(harnessScript, `
set -euo pipefail
exec 200>>"$TEST_ROOT/lock"
REPO_DIR=${quote(shellPath(repo))}
ENV_FILE=${quote(shellPath(envFile))}
DOCKER_BIN=${quote(shellPath(dockerWrapper))}
PROJECT_NAME=rmhstudios-test
IMAGE_NAME=rmhstudios-test-app
ENVIRONMENT=${options.staging ? 'staging' : 'production'}
log() { printf '%s\\n' "$1"; }
step_start() { :; }
step_done() { :; }
stage() { :; }
release_event() { :; }
update_deploy_status() { printf 'status: %s %s\\n' "$1" "$2"; }
# The production diagnostic uses GNU grep -P; keep this harness portable on
# macOS by substituting only those diagnostics, leaving real gates untouched.
grep() {
  if [ "\${1:-}" = '-oP' ]; then
    if [ "$#" -gt 2 ]; then cat "$3" > /dev/null; else cat > /dev/null; fi
    case "$2" in *'K[0-9]'*) printf '5432\\n' ;; *) printf 'base:5432\\n' ;; esac
  else
    command grep "$@"
  fi
}
${compose}
${launch}
: > "$TEST_ROOT/foreground-complete"
printf 'foreground-complete\\n' >> "$TEST_ROOT/events"
${joins}
printf 'deploy-complete\\n' >> "$TEST_ROOT/events"
`);
  const result = spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash', [harnessScript], {
    cwd: repo,
    env: {
      ...process.env,
      PATH: '/usr/bin:/bin',
      TEST_ROOT: dir.replaceAll('\\', '/'),
      MSYS2_ARG_CONV_EXCL: 'STORAGE_PATH=',
      TEST_CDN: options.cdn === false ? '0' : '1',
      TEST_MIGRATION: options.migration ?? 'pending',
      TEST_FAIL_JOB: options.failJob ?? '',
      TEST_HANG_JOB: options.hangJob ?? '',
      ...(options.hangJob ? { BACKFILL_TIMEOUT_SECONDS: '1' } : {}),
    },
    encoding: 'utf8',
    timeout: 5000,
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    output: result.stdout + result.stderr,
    calls: readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n').filter(Boolean)
      .map((line) => JSON.parse(line) as Invocation),
    events: readFileSync(join(dir, 'events'), 'utf8').trim().split('\n').filter(Boolean),
    storageHost,
    envFile: envFile.replaceAll('\\', '/'),
  };
}

const backfills = (calls: Invocation[]) => calls.filter(({ args }) =>
  args.some((arg) => /^scripts\/migrate-(avatars|media)-to-r2\.ts$/.test(arg)),
);

describe('deployment R2 backfills', () => {
  // Removing Compose or moving either launch ahead of migrate deploy breaks
  // hostname reachability / schema safety, even if the background job succeeds.
  it('runs both backfills through the web Compose service after successful migrations', () => {
    const result = runDeploy({ staging: true });
    expect(result.status, result.output).toBe(0);
    const jobs = backfills(result.calls);
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job.migrated, job.args.join(' ')).toBe(true);
      expect(job.attached, job.args.join(' ')).toBe(true);
      expect(job.args).toEqual([
        'compose', '-p', 'rmhstudios-test', '--env-file', result.envFile,
        '-f', 'docker-compose.yml', '-f', 'deploy/docker-compose.backfill.yml',
        'run', '--rm', '--no-deps', '-T', '-e', 'STORAGE_PATH=/app/db',
        '--entrypoint', 'node',
        'web', expect.stringMatching(/^scripts\/migrate-(avatars|media)-to-r2\.ts$/),
      ]);
    }
    expect(result.events.indexOf('static-started')).toBeLessThan(result.events.indexOf('migration-finished'));
  });

  // A failed migration must abort before a DB-dependent job is ever created.
  it('does not launch either backfill when migration deploy fails', () => {
    const result = runDeploy({ migration: 'fail' });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('status: fail database migration failed');
    expect(backfills(result.calls)).toEqual([]);
    expect(result.events).toContain('static-started');
  });

  it('also backfills when the database schema is already current', () => {
    const result = runDeploy({ migration: 'current' });
    expect(result.status, result.output).toBe(0);
    expect(backfills(result.calls)).toHaveLength(2);
    expect(backfills(result.calls).every((job) => job.migrated)).toBe(true);
    expect(result.events).not.toContain('migration-started');
  });

  // A CLI -v duplicates the inherited target and can retain its writable mode.
  it.each([
    { label: 'relative', storage: './custom db' },
    { label: 'absolute', absoluteStorage: true },
  ])('mounts quoted $label storage overrides read-only', (options) => {
    const result = runDeploy(options);
    expect(result.status, result.output).toBe(0);
    expect(backfills(result.calls)).toHaveLength(2);
    for (const { args } of backfills(result.calls)) {
      expect(args).not.toContain('-v');
      expect(args).toEqual(expect.arrayContaining([
        '-f', 'docker-compose.yml', 'deploy/docker-compose.backfill.yml',
      ]));
      expect(args).toContain('STORAGE_PATH=/app/db');
    }
  });

  it('skips all R2 work when the CDN is not configured', () => {
    const result = runDeploy({ cdn: false });
    expect(result.status, result.output).toBe(0);
    expect(backfills(result.calls)).toEqual([]);
    expect(result.events).not.toContain('static-started');
  });

  it.each([
    { folders: [], scripts: [] },
    { folders: ['avatars'], scripts: ['scripts/migrate-avatars-to-r2.ts'] },
    { folders: ['music'], scripts: ['scripts/migrate-media-to-r2.ts'] },
    { folders: ['builds'], scripts: ['scripts/migrate-media-to-r2.ts'] },
  ])('launches only jobs with local source directories: $folders', ({ folders, scripts }) => {
    const result = runDeploy({ folders });
    expect(result.status, result.output).toBe(0);
    expect(backfills(result.calls).map(({ args }) => args.at(-1)).sort()).toEqual(scripts);
  });

  // Removing '&' blocks later deployment; removing a wait reports completion
  // too soon. A controlled job holds until foreground work reaches its end.
  // The jobs are children of the deploy shell; if they inherit the flock
  // descriptor, a hung one keeps every later deploy queued.
  it.skipIf(process.platform === 'win32')('does not leave the deployment lock open in a backfill', () => {
    const result = runDeploy();
    expect(result.status, result.output).toBe(0);
    expect(result.events).toContain('avatars-started');
    expect(result.events).toContain('media-started');
    expect(result.events).not.toContain('avatars-holds-lock');
    expect(result.events).not.toContain('media-holds-lock');
  });

  // An unbounded join is what let one wedged container hold the deploy open
  // (and its lock) indefinitely.
  it.skipIf(process.platform === 'win32').each(['avatars', 'media'] as const)(
    'bounds a hung %s backfill so the deploy still completes',
    (hangJob) => {
      const result = runDeploy({ hangJob });
      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain(`WARNING: ${hangJob === 'avatars' ? 'avatar' : 'media'} R2 backfill failed`);
      expect(result.events).not.toContain(`${hangJob}-finished`);
      expect(result.events).toContain('deploy-complete');
    },
  );

  it.each(['avatars', 'media'] as const)('joins background work and warns when %s fails', (failJob) => {
    const result = runDeploy({ failJob });
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain(`WARNING: ${failJob === 'avatars' ? 'avatar' : 'media'} R2 backfill failed`);
    for (const job of ['avatars', 'media']) {
      expect(result.events).toContain(`${job}-background`);
      expect(result.events.indexOf(`${job}-finished`)).toBeLessThan(result.events.indexOf('deploy-complete'));
    }
  });
});

// Opt in to real daemon-free Compose merging when the CLI is available. The
// regular suite still exercises the launch contract without requiring Docker.
describe.skipIf(!process.env.COMPOSE_TEST_BIN)('effective backfill Compose mount', () => {
  it.each([
    { label: 'default' },
    { label: 'relative', storage: './custom db' },
    { label: 'absolute', absoluteStorage: true },
  ])('keeps only the job mount read-only with $label storage', (options) => {
    const result = runDeploy(options);
    const root = dirname(result.envFile);
    expect(existsSync(join(root, 'deploy/docker-compose.backfill.yml'))).toBe(true);
    const config = (backfill: boolean) => {
      const parsed = spawnSync(process.env.COMPOSE_TEST_BIN!, [
        '--env-file', result.envFile, '-f', join(root, 'docker-compose.yml'),
        ...(backfill ? ['-f', join(root, 'deploy/docker-compose.backfill.yml')] : []),
        'config', '--format', 'json',
      ], {
        encoding: 'utf8',
        env: {
          PATH: '/usr/bin:/bin',
          ENV_FILE: result.envFile,
          S3_ACCESS_KEY_ID: 'test',
          S3_SECRET_ACCESS_KEY: 'test',
        },
        timeout: 5000,
      });
      expect(parsed.status, parsed.stderr).toBe(0);
      return JSON.parse(parsed.stdout).services.web.volumes as {
        type: string; source: string; target: string; read_only?: boolean;
      }[];
    };
    const source = options.absoluteStorage
      ? result.storageHost : resolve(root, options.storage ?? './db');
    expect(config(true).filter((volume) => volume.target === '/app/db')).toEqual([
      expect.objectContaining({ type: 'bind', source, target: '/app/db', read_only: true }),
    ]);
    const baseMounts = config(false).filter((volume) => volume.target === '/app/db');
    expect(baseMounts).toHaveLength(1);
    expect(baseMounts[0].read_only ?? false).toBe(false);
  });
});
