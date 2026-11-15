// The image publish path: the R2 upload (against an injected client: R2 is not reachable from CI
// tests), the manifest, and the block the owner pastes into image-manifest.ts afterwards.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { publish, CACHE_CONTROL } from '../../../scripts/rmhos/publish-r2.mjs';
import { computeManifest, BOOT } from '../../../scripts/rmhos/write-manifest.mjs';
import { pinReport, renderPin, toPin } from '../../../scripts/rmhos/print-pin.mjs';

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const VERSIONS = { KERNEL_SERIES: '6.12', KERNEL_VERSION: '6.12.117', KERNEL_SHA256: 'ab'.repeat(32) };

/** An image directory with small stand-ins for every file, and the manifest computed from it. */
function image() {
  const dir = mkdtempSync(join(tmpdir(), 'rmhos-img-'));
  dirs.push(dir);
  const names = [...BOOT, 'packages.txt', 'apk-installed.txt', 'linux-6.12.117.tar.xz'];
  for (const n of names) writeFileSync(join(dir, n), `content of ${n}\n`);
  writeFileSync(
    join(dir, 'build-info.json'),
    JSON.stringify({ commit: 'c0ffee', runUrl: 'https://github.com/o/r/actions/runs/1', date: '2026-11-15T00:00:00Z' }),
  );
  // The scripts are plain JS, so their return types are inferred loosely: say what the tests rely on.
  const manifest = computeManifest(dir, VERSIONS) as unknown as {
    version: string;
    kernel: unknown;
    build: { commit: string; runUrl: string; date: string };
    files: Record<string, { size: number; sha256: string }>;
  };
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { dir, manifest };
}

type Cmd = { constructor: { name: string }; input: Record<string, unknown> };
/** A fake S3 client: records every command; `head` and `put` decide what happens. */
function fakeClient(opts: {
  exists?: boolean;
  failPuts?: Record<string, number>;
}) {
  const calls: { kind: string; key: string; input: Record<string, unknown> }[] = [];
  const failures = { ...(opts.failPuts ?? {}) };
  return {
    calls,
    async send(cmd: Cmd) {
      const kind = cmd.constructor.name;
      const key = String(cmd.input.Key);
      calls.push({ kind, key, input: cmd.input });
      if (kind === 'HeadObjectCommand') {
        if (opts.exists) return {};
        throw Object.assign(new Error('not found'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
      }
      const left = failures[key] ?? 0;
      if (left > 0) {
        failures[key] = left - 1;
        throw new Error('R2 hiccup');
      }
      return {};
    },
  };
}

const quiet = { sleep: async () => {}, log: () => {} };

describe('publish-r2', () => {
  it('uploads every file with an immutable cache header and content type, manifest.json last', async () => {
    const { dir, manifest } = image();
    const client = fakeClient({});
    const keys = await publish({ client, bucket: 'b', dir, manifest, ...quiet });
    const prefix = `rmhos/${manifest.version}/`;
    expect(keys.at(-1)).toBe(`${prefix}manifest.json`);
    expect(keys).toHaveLength(Object.keys(manifest.files).length + 1);
    expect(keys.slice(0, -1)).toEqual(Object.keys(manifest.files).map((n) => `${prefix}${n}`));
    const puts = client.calls.filter((c) => c.kind === 'PutObjectCommand');
    for (const p of puts) {
      expect(p.input.CacheControl).toBe(CACHE_CONTROL);
      expect(CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
      expect(Buffer.isBuffer(p.input.Body)).toBe(true); // a whole buffer, not a stream
    }
    const type = (n: string) => puts.find((p) => p.key.endsWith(n))?.input.ContentType;
    expect(type('state.zst')).toBe('application/zstd');
    expect(type('packages.txt')).toBe('text/plain; charset=utf-8');
    expect(type('linux-6.12.117.tar.xz')).toBe('application/x-xz');
    expect(type('manifest.json')).toBe('application/json');
    expect(type('bzImage')).toBe('application/octet-stream');
    // the kernel source and the apk database are published, and are not boot inputs
    expect(Object.keys(manifest.files)).toEqual(
      expect.arrayContaining(['apk-installed.txt', 'linux-6.12.117.tar.xz']),
    );
  });

  it('refuses to overwrite an existing version, before sending anything', async () => {
    const { dir, manifest } = image();
    const client = fakeClient({ exists: true });
    await expect(publish({ client, bucket: 'b', dir, manifest, ...quiet })).rejects.toThrow(
      /already exists.*immutable/,
    );
    expect(client.calls.map((c) => c.kind)).toEqual(['HeadObjectCommand']);
  });

  it('--force overwrites, and skips the existence check', async () => {
    const { dir, manifest } = image();
    const client = fakeClient({ exists: true });
    await publish({ client, bucket: 'b', dir, manifest, force: true, ...quiet });
    expect(client.calls.some((c) => c.kind === 'HeadObjectCommand')).toBe(false);
    expect(client.calls.at(-1)?.key).toBe(`rmhos/${manifest.version}/manifest.json`);
  });

  it('retries a failing file up to 3 times, then succeeds', async () => {
    const { dir, manifest } = image();
    const key = `rmhos/${manifest.version}/rootfs.ext4`;
    const client = fakeClient({ failPuts: { [key]: 2 } });
    await publish({ client, bucket: 'b', dir, manifest, ...quiet });
    expect(client.calls.filter((c) => c.key === key)).toHaveLength(3);
  });

  it('gives up after 3 attempts and never uploads the manifest of a half-published version', async () => {
    const { dir, manifest } = image();
    const key = `rmhos/${manifest.version}/state.zst`;
    const client = fakeClient({ failPuts: { [key]: 99 } });
    await expect(publish({ client, bucket: 'b', dir, manifest, ...quiet })).rejects.toThrow(
      /giving up on .*state\.zst after 3 attempts/,
    );
    expect(client.calls.filter((c) => c.key === key)).toHaveLength(3);
    expect(client.calls.some((c) => c.key.endsWith('/manifest.json') && c.kind === 'PutObjectCommand')).toBe(false);
  });

  it('refuses a file that does not match the manifest', async () => {
    const { dir, manifest } = image();
    writeFileSync(join(dir, 'bzImage'), 'tampered');
    const client = fakeClient({});
    await expect(publish({ client, bucket: 'b', dir, manifest, ...quiet })).rejects.toThrow(
      /bzImage does not match manifest\.json/,
    );
  });

  it('propagates an unexpected HEAD failure instead of publishing blind', async () => {
    const { dir, manifest } = image();
    const client = {
      send: async () => {
        throw Object.assign(new Error('forbidden'), { name: 'Forbidden', $metadata: { httpStatusCode: 403 } });
      },
    };
    await expect(publish({ client, bucket: 'b', dir, manifest, ...quiet })).rejects.toThrow('forbidden');
  });
});

describe('write-manifest', () => {
  it('hashes only the boot inputs: provenance and the extra files do not change the version', () => {
    const { dir, manifest } = image();
    writeFileSync(join(dir, 'packages.txt'), 'different header\n');
    writeFileSync(join(dir, 'apk-installed.txt'), 'different\n');
    writeFileSync(join(dir, 'build-info.json'), JSON.stringify({ commit: 'other' }));
    const again = computeManifest(dir, VERSIONS);
    expect(again.version).toBe(manifest.version);
    expect(again.build.commit).toBe('other');
    writeFileSync(join(dir, 'state.zst'), 'a new snapshot');
    expect(computeManifest(dir, VERSIONS).version).not.toBe(manifest.version);
  });

  it('records the commit, run URL and date, and names a missing file', () => {
    const { dir, manifest } = image();
    expect(manifest.build).toEqual({
      commit: 'c0ffee',
      runUrl: 'https://github.com/o/r/actions/runs/1',
      date: '2026-11-15T00:00:00Z',
    });
    rmSync(join(dir, 'apk-installed.txt'));
    expect(() => computeManifest(dir, VERSIONS)).toThrow(/apk-installed\.txt is missing/);
  });
});

describe('print-pin', () => {
  it('maps the manifest to the published-image shape in one place', () => {
    const { manifest } = image();
    const pin = toPin(manifest) as { version: string; files: Record<string, { size: number; sha256: string }> };
    expect(Object.keys(pin.files)).toEqual(['bzImage', 'rootfs', 'state', 'seabios', 'vgabios']);
    expect(pin.version).toBe(manifest.version);
    expect(pin.files.rootfs).toEqual({
      size: manifest.files['rootfs.ext4'].size,
      sha256: manifest.files['rootfs.ext4'].sha256,
    });
    expect(pin.files.state).toEqual({
      size: manifest.files['state.zst'].size,
      sha256: manifest.files['state.zst'].sha256,
    });
  });

  it('prints ready-to-paste TypeScript, and the commit it was built from', () => {
    const { manifest } = image();
    const src = renderPin(toPin(manifest));
    expect(src.startsWith("export const PUBLISHED_IMAGE = {\n  version: '")).toBe(true);
    expect(src).toContain('    rootfs: {\n      size: ');
    expect(src.endsWith('  },\n};')).toBe(true);
    expect(pinReport(manifest)).toContain('built from commit c0ffee');
  });

  it('refuses a manifest with a gap rather than printing a wrong pin', () => {
    const { manifest } = image();
    const broken = { ...manifest, files: { ...manifest.files } };
    delete (broken.files as Record<string, unknown>)['state.zst'];
    expect(() => toPin(broken)).toThrow(/state\.zst/);
    expect(() => toPin({ ...manifest, version: 'nope' })).toThrow(/version/);
  });
});
