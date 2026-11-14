import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PINNED_IMAGE, resolveImageManifest } from '../image-manifest';
import { RMHOS } from '../constants';

describe('resolveImageManifest', () => {
  it('serves the dev image directory when there is no CDN base', () => {
    const m = resolveImageManifest(undefined);
    expect(m.bzImage.url).toBe('/rmhos-dev/bzImage');
    expect(m.rootfs.url).toBe('/rmhos-dev/rootfs.ext4');
    expect(m.state?.url).toBe('/rmhos-dev/state.zst');
    expect(m.seabios.url).toBe('/rmhos-dev/seabios.bin');
    expect(m.vgabios.url).toBe('/rmhos-dev/vgabios.bin');
  });

  it('serves a versioned CDN path and ignores a trailing slash', () => {
    const m = resolveImageManifest('https://cdn.rmhstudios.com');
    expect(m.rootfs.url).toBe(`https://cdn.rmhstudios.com/rmhos/${m.version}/rootfs.ext4`);
    expect(m.state?.url).toBe(`https://cdn.rmhstudios.com/rmhos/${m.version}/state.zst`);
    expect(resolveImageManifest('https://cdn.rmhstudios.com/').rootfs.url).toBe(m.rootfs.url);
  });

  it('pins sizes and hashes for every boot file', () => {
    const m = resolveImageManifest(undefined);
    expect(m.version).toBe(PINNED_IMAGE.version);
    for (const f of [m.bzImage, m.rootfs, m.state!, m.seabios, m.vgabios]) {
      expect(f.size).toBeGreaterThan(0);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(m.wasm).toMatch(/v86.*\.wasm/);
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
