/** Durable release identity. The deployment flock serializes writers. No secrets are recorded. */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const releaseIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/;
const shaPattern = /^[a-f0-9]{40}$/;
export function readState(dir, name) {
  if (!releaseIdPattern.test(name)) throw new Error('Invalid release identity');
  const file = join(dir, `${name}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}
function atomicWrite(dir, name, value) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  const temporary = `${file}.${process.pid}.tmp`;
  const fd = openSync(temporary, 'w', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(value)}\n`);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  renameSync(temporary, file);
}
export function recordRelease(dir, id, sha, phase, now = Date.now()) {
  if (!releaseIdPattern.test(id) || !id.startsWith('release-') || !shaPattern.test(sha)) throw new Error('Invalid release identity');
  if (!/^[a-z][a-z0-9-]{0,47}$/.test(phase)) throw new Error('Invalid release phase');
  const existing = readState(dir, id);
  if (existing && existing.sha !== sha) throw new Error('Release SHA cannot change');
  const state = existing ?? { id, sha, requestedAt: Number(process.env.DEPLOY_REQUESTED_AT || Math.floor(now / 1000)) * 1000, previous: readState(dir, 'live'), events: [] };
  // A queued request may outlive another deployment. Its rollback snapshot must
  // describe the release serving when it acquires the lock, not when it queued.
  if (phase === 'lock-acquired') state.previous = readState(dir, 'live');
  state.phase = phase;
  state.updatedAt = now;
  state.events.push({ phase, at: now });
  for (const [key, env] of [['webDigest', 'RELEASE_WEB_DIGEST'], ['fullDigest', 'RELEASE_FULL_DIGEST'], ['configurationHash', 'RELEASE_CONFIG_HASH']]) {
    const value = process.env[env];
    if (value && /^[a-zA-Z0-9/_.:@-]{1,256}$/.test(value)) state[key] = value;
  }
  atomicWrite(dir, id, state);
  return state;
}
export function promoteRelease(dir, id, expectedLiveId) {
  const state = readState(dir, id);
  if (!state) throw new Error('Unknown release');
  const live = readState(dir, 'live');
  if ((live?.id ?? '') !== expectedLiveId && live?.id !== id) throw new Error('Live release changed');
  atomicWrite(dir, 'live', { id, sha: state.sha, webDigest: state.webDigest, fullDigest: state.fullDigest, at: Date.now() });
}
export function restoreRelease(dir, id) {
  if (readState(dir, 'live')?.id !== id) throw new Error('A newer release is serving; refusing stale rollback');
  const state = readState(dir, id);
  if (!state?.previous) throw new Error('No previous serving release');
  atomicWrite(dir, 'live', state.previous);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [action, dir, id, sha, phase] = process.argv.slice(2);
    if (action === 'record') recordRelease(dir, id, sha, phase);
    else if (action === 'promote') promoteRelease(dir, id, sha ?? '');
    else if (action === 'restore') restoreRelease(dir, id);
    else if (action === 'read') process.stdout.write(String(readState(dir, id)?.[sha] ?? ''));
    else throw new Error('Unknown release-state action');
  } catch (error) {
    console.error(`release-state: ${error.message}`);
    process.exitCode = 1;
  }
}
