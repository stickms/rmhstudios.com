import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordRelease, readState, promoteRelease, restoreRelease } from '../../deploy/release-state.mjs';
import { staticAssetVersions, parseAssetVersions } from '../../scripts/static-asset-versions.mjs';
import { classifyFiles } from '../../.github/scripts/classify-change.mjs';

const directories: string[] = [];
function temporary() { const dir = mkdtempSync(join(tmpdir(), 'rmh-release-')); directories.push(dir); return dir; }
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const first = 'a'.repeat(40);
const second = 'b'.repeat(40);

describe('durable release fencing', () => {
  it('keeps checkout/candidate progress separate from serving identity', () => {
    const dir = temporary();
    recordRelease(dir, 'release-a', first, 'queued', 1000);
    expect(readState(dir, 'live')).toBeNull();
    recordRelease(dir, 'release-a', first, 'pulled', 2000);
    expect(readState(dir, 'live')).toBeNull();
    promoteRelease(dir, 'release-a', '');
    recordRelease(dir, 'release-b', second, 'fetched', 3000);
    expect(readState(dir, 'live')?.sha).toBe(first);
    expect(readState(dir, 'release-b')?.previous?.sha).toBe(first);
  });
  it('refuses a changed SHA, path traversal and reserved ledger names', () => {
    const dir = temporary();
    recordRelease(dir, 'release-a', first, 'queued');
    expect(() => recordRelease(dir, 'release-a', second, 'pulled')).toThrow('SHA cannot change');
    for (const id of ['../live', 'live', 'release-/../../x']) expect(() => recordRelease(dir, id, first, 'queued')).toThrow();
  });
  it('rejects stale promotion and rollback after another release is serving', () => {
    const dir = temporary();
    recordRelease(dir, 'release-a', first, 'queued'); promoteRelease(dir, 'release-a', '');
    recordRelease(dir, 'release-b', second, 'queued'); promoteRelease(dir, 'release-b', 'release-a');
    expect(() => restoreRelease(dir, 'release-a')).toThrow('newer release');
    recordRelease(dir, 'release-c', first, 'queued');
    expect(() => promoteRelease(dir, 'release-c', 'release-a')).toThrow('Live release changed');
    restoreRelease(dir, 'release-b');
    expect(readState(dir, 'live')?.id).toBe('release-a');
    expect(JSON.parse(readFileSync(join(dir, 'live.json'), 'utf8')).sha).toBe(first);
  });
  it('captures the rollback target after queued releases acquire the lock', () => {
    const dir = temporary();
    recordRelease(dir, 'release-a', first, 'queued');
    recordRelease(dir, 'release-b', second, 'queued');
    promoteRelease(dir, 'release-a', '');
    recordRelease(dir, 'release-b', second, 'lock-acquired');
    promoteRelease(dir, 'release-b', 'release-a');
    restoreRelease(dir, 'release-b');
    expect(readState(dir, 'live')?.sha).toBe(first);
  });
});

describe('static asset publication identity', () => {
  it('changes versions for changed bytes, renamed paths and removed files', () => {
    const dir = temporary(); mkdirSync(join(dir, 'models'));
    const file = join(dir, 'models', 'scene.glb'); writeFileSync(file, 'first');
    const original = staticAssetVersions(dir);
    expect(staticAssetVersions(dir)).toEqual(original);
    writeFileSync(file, 'other'); expect(staticAssetVersions(dir)).not.toEqual(original);
    rmSync(file); writeFileSync(join(dir, 'models', 'renamed.glb'), 'first');
    expect(staticAssetVersions(dir)).not.toEqual(original);
    expect(parseAssetVersions(JSON.stringify(original))).toEqual(original);
  });
  it('rejects invalid publication namespaces instead of emitting unsafe CDN paths', () => {
    for (const value of ['null', '[]', '{"../private":"abc"}', '{"models":"../../x"}']) expect(() => parseAssetVersions(value)).toThrow();
  });
});

describe('release change classification', () => {
  it('takes the full path for unknown, empty and runtime inputs', () => {
    for (const files of [[], ['unknown.config'], ['lib/storage/asset.ts'], ['Dockerfile'], ['docs/a.md', 'vite.config.ts'], ['docs/book/build/package.json']]) {
      expect(classifyFiles(files).frontend).toBe(true);
    }
  });
  it('still tests test-only changes and validates Go/deployment images', () => {
    expect(classifyFiles(['lib/__tests__/privacy.test.ts'])).toEqual({ checks: true, frontend: false, candidate: false });
    expect(classifyFiles(['deploy.sh'])).toEqual({ checks: true, frontend: false, candidate: true });
    expect(classifyFiles(['go-services/cmd/status/main.go'])).toEqual({ checks: true, frontend: false, candidate: true });
    expect(classifyFiles(['docs/architecture.md'])).toEqual({ checks: false, frontend: false, candidate: false });
  });
});
