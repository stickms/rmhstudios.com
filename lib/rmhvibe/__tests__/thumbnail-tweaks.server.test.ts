import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import { savedTweakValues } from '@/lib/rmhvibe/thumbnail-worker.server';

// Thumbnails (the jobs worker and scripts/backfill-vibe-thumbs.ts) must render the
// owner's saved knobs, resolved against the latest spec, not the defaults.
describe('savedTweakValues', () => {
  const spec = [
    { key: 'hue', label: 'Hue', type: 'color', default: '#000000' },
    { key: 'size', label: 'Size', type: 'range', default: 2, min: 1, max: 5, step: 1 },
  ];

  it('uses saved values and falls back to defaults for the rest', () => {
    expect(savedTweakValues({ tweakValues: { hue: '#ff0000' }, versions: [{ tweakSpec: spec }] })).toEqual({
      hue: '#ff0000',
      size: 2,
    });
  });

  it('drops a saved value the spec no longer allows', () => {
    expect(
      savedTweakValues({ tweakValues: { size: 99, gone: 1 }, versions: [{ tweakSpec: spec }] }),
    ).toEqual({ hue: '#000000', size: 5 });
  });

  it('is undefined for a page with no knobs', () => {
    expect(savedTweakValues({ tweakValues: { hue: '#ff0000' }, versions: [] })).toBeUndefined();
    expect(savedTweakValues({ tweakValues: null, versions: [{ tweakSpec: null }] })).toBeUndefined();
  });
});
