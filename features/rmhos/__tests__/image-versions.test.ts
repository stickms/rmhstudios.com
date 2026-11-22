// One kernel version, three places: scripts/rmhos/versions.env is the build's input, NOTICE.md is the
// licence record and ui/about-facts.ts is what the About dialog states. A kernel bump that updates
// only one of them would ship a licence notice for source that is not what was built.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readVersions } from '../../../scripts/rmhos/write-manifest.mjs';
import { KERNEL_TARBALL_URL, KERNEL_VERSION } from '../ui/about-facts';

const root = process.cwd();
const versions = readVersions(join(root, 'scripts/rmhos/versions.env')) as Record<string, string>;
// NOTICE.md wraps one word per line in this checkout: compare on collapsed whitespace.
const notice = readFileSync(join(root, 'features/rmhos/NOTICE.md'), 'utf8').replace(/\s+/g, ' ');

describe('kernel version has one source', () => {
  it('versions.env, NOTICE.md and the About facts name the same kernel', () => {
    expect(KERNEL_VERSION).toBe(versions.KERNEL_VERSION);
    expect(versions.KERNEL_VERSION?.startsWith(`${versions.KERNEL_SERIES}.`)).toBe(true);
    expect(notice).toContain(`linux-${versions.KERNEL_VERSION}.tar.xz`);
    expect(notice).toContain(versions.KERNEL_SHA256);
  });

  it('the tarball URL the About dialog links is the one the build downloads', () => {
    const series = (versions.KERNEL_SERIES as string).split('.')[0];
    expect(KERNEL_TARBALL_URL).toBe(
      `https://cdn.kernel.org/pub/linux/kernel/v${series}.x/linux-${versions.KERNEL_VERSION}.tar.xz`,
    );
  });

  it('the Alpine release in NOTICE.md is the one the build pins', () => {
    expect(notice).toContain(`Alpine Linux ${versions.ALPINE_VERSION}`);
  });
});
