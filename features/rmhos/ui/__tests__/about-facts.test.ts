import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEV_IMAGE, resolveImageManifest } from '../../engine/image-manifest';
import {
  BUILD_SCRIPTS_URL,
  KERNEL_TARBALL_URL,
  KERNEL_VERSION,
  packagesUrl,
  V86_URL,
} from '../about-facts';

// NOTICE.md wraps one word per line in this checkout: compare on collapsed whitespace.
const notice = readFileSync(join(process.cwd(), 'features/rmhos/NOTICE.md'), 'utf8').replace(
  /\s+/g,
  ' ',
);

describe('About facts match NOTICE.md', () => {
  it('names the pinned kernel tarball', () => {
    expect(notice).toContain(`<${KERNEL_TARBALL_URL}>`);
    expect(KERNEL_TARBALL_URL).toContain(`linux-${KERNEL_VERSION}.tar.xz`);
  });
  it('points at the build scripts directory NOTICE.md names, and v86', () => {
    expect(notice).toContain('`scripts/rmhos/`');
    expect(BUILD_SCRIPTS_URL.endsWith('/scripts/rmhos')).toBe(true);
    expect(notice).toContain(`(${V86_URL})`);
  });
  it('the source-offer sentence points at a written offer NOTICE.md really makes', () => {
    const en = JSON.parse(readFileSync(join(process.cwd(), 'locales/en/c-rmhos.json'), 'utf8')) as Record<string, string>;
    const sentence = en['about-source-offer'] ?? '';
    expect(sentence).toContain('three years');
    expect(sentence).toContain('NOTICE.md');
    expect(notice).toContain('Written offer.');
    expect(notice).toContain('For three years after the date a published image was built');
  });
  it('packages.txt is beside the image the manifest resolves', () => {
    expect(notice).toContain('`packages.txt`');
    const published = { version: 'abc123def456', files: DEV_IMAGE.files };
    expect(packagesUrl(resolveImageManifest('https://cdn.example/', published)!)).toMatch(
      /^https:\/\/cdn\.example\/rmhos\/[0-9a-f]+\/packages\.txt$/,
    );
    expect(packagesUrl(resolveImageManifest(undefined)!)).toBe('/rmhos-dev/packages.txt');
  });
});
