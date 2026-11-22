import { describe, expect, it } from 'vitest';
import manifest from '../../../data/medschools/crests.json';
import { crestSrc } from './crests';

describe('crestSrc', () => {
  it('returns the static path for a listed slug', () => {
    const slug = manifest.slugs[0]!;
    expect(crestSrc(slug)).toBe(`/images/medschools/crests/${slug}.webp`);
  });
  it('returns null for an unknown slug', () => {
    expect(crestSrc('no-such-school')).toBeNull();
  });
  it('lists only slugs that have a file', async () => {
    const { existsSync } = await import('node:fs');
    for (const slug of manifest.slugs) expect(existsSync(`public/images/medschools/crests/${slug}.webp`), slug).toBe(true);
  });
});
