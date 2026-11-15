import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  DEV_IMAGE,
  PUBLISHED_IMAGE,
  resolveImageManifest,
  type PinnedImage,
} from '../image-manifest';
import { RMHOS } from '../constants';

const FAKE_PUBLISHED: PinnedImage = {
  version: 'abc123def456',
  files: DEV_IMAGE.files,
};

describe('resolveImageManifest', () => {
  it('serves the dev image directory when there is no CDN base', () => {
    const m = resolveImageManifest(undefined)!;
    expect(m.version).toBe(DEV_IMAGE.version);
    expect(m.bzImage.url).toBe('/rmhos-dev/bzImage');
    expect(m.rootfs.url).toBe('/rmhos-dev/rootfs.ext4');
    expect(m.state?.url).toBe('/rmhos-dev/state.zst');
    expect(m.seabios.url).toBe('/rmhos-dev/seabios.bin');
    expect(m.vgabios.url).toBe('/rmhos-dev/vgabios.bin');
  });

  it('serves the dev image without a CDN base even when an image is published', () => {
    expect(resolveImageManifest(undefined, FAKE_PUBLISHED)!.bzImage.url).toBe('/rmhos-dev/bzImage');
  });

  it('is null with a CDN base while no image is published', () => {
    expect(resolveImageManifest('https://cdn.example', null)).toBeNull();
    // The committed state: nothing published yet unless the owner has pinned an image.
    if (PUBLISHED_IMAGE === null) expect(resolveImageManifest('https://cdn.example')).toBeNull();
  });

  it('serves a versioned CDN path and ignores a trailing slash', () => {
    const m = resolveImageManifest('https://cdn.rmhstudios.com', FAKE_PUBLISHED)!;
    expect(m.version).toBe('abc123def456');
    expect(m.rootfs.url).toBe('https://cdn.rmhstudios.com/rmhos/abc123def456/rootfs.ext4');
    expect(m.state?.url).toBe('https://cdn.rmhstudios.com/rmhos/abc123def456/state.zst');
    expect(resolveImageManifest('https://cdn.rmhstudios.com/', FAKE_PUBLISHED)!.rootfs.url).toBe(
      m.rootfs.url,
    );
  });

  it('pins sizes and hashes for every boot file', () => {
    for (const pin of [DEV_IMAGE, PUBLISHED_IMAGE].filter((p): p is PinnedImage => !!p)) {
      expect(pin.version).toMatch(/^[0-9a-f]{12}$/);
      for (const f of Object.values(pin.files)) {
        expect(f.size).toBeGreaterThan(0);
        expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });
});

describe('machine definition', () => {
  it('the page builds the machine the snapshot was taken with', async () => {
    const opts = await import(
      /* @vite-ignore */ pathToFileURL(
        resolve(__dirname, '../../../../scripts/rmhos/vm-options.mjs'),
      ).href
    );
    expect(RMHOS.memoryBytes).toBe(opts.MEMORY_BYTES);
    expect(RMHOS.vgaMemoryBytes).toBe(opts.VGA_MEMORY_BYTES);
    const { vmOptions } = await import('../vm-options');
    const built = vmOptions({ baseUrl: '/x/', relayUrl: 'wisp://a/' });
    const base = opts.baseVmOptions({ baseUrl: '/x/', relayUrl: 'wisp://a/' });
    expect(built.memory_size).toBe(base.memory_size);
    expect(built.vga_memory_size).toBe(base.vga_memory_size);
    expect(built.cmdline).toBe(opts.CMDLINE);
    expect(built.net_device).toEqual(base.net_device);
    expect(built.hda).toEqual({ url: '/x/rootfs.ext4', async: true });
    expect(built.preserve_mac_from_state_image).toBe(true);
  });
});
