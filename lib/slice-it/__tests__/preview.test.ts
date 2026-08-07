/**
 * C7 — where a preview starts.
 *
 * The guards matter more than the pick: a preview that starts 5 seconds before
 * the end of a track plays silence, which reads as the feature being broken
 * rather than the heuristic being wrong.
 */

import { describe, expect, it } from 'vitest';
import { PREVIEW_SECONDS, defaultPreviewStart, previewFragment, resolvePreviewStart } from '../preview';
import type { Section } from '../beatmap/sections';

const section = (start: number, end: number, energy: number, label = 'A'): Section => ({
  start,
  end,
  label,
  energy,
});

describe('defaultPreviewStart', () => {
  it('picks the loudest section', () => {
    const sections = [
      section(0, 20, 0.4),
      section(20, 60, 0.6),
      section(60, 120, 1.0, 'B'),
      section(120, 180, 0.7, 'C'),
    ];
    expect(defaultPreviewStart(sections, 180)).toBe(60);
  });

  it('skips the intro when there is an alternative', () => {
    // A cold open is occasionally the loudest thing in a track, and starting a
    // preview at 0.0 makes the feature look broken even when it is right.
    const sections = [section(0, 20, 1.0), section(20, 120, 0.5, 'B')];
    expect(defaultPreviewStart(sections, 120)).toBe(20);
  });

  it('falls back to the intro when it is the only section', () => {
    expect(defaultPreviewStart([section(0, 120, 1)], 120)).toBe(0);
  });

  it('never starts so late that the preview runs into silence', () => {
    const sections = [section(0, 100, 0.3), section(100, 110, 1.0, 'B')];
    const start = defaultPreviewStart(sections, 110);
    expect(start).toBeLessThanOrEqual(110 - PREVIEW_SECONDS);
  });

  it('previews from the start of a track shorter than a preview', () => {
    expect(defaultPreviewStart([section(0, 10, 1)], 10)).toBe(0);
  });

  it('produces something usable with no sections at all', () => {
    const start = defaultPreviewStart([], 200);
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThanOrEqual(200 - PREVIEW_SECONDS);
  });
});

describe('resolvePreviewStart', () => {
  it('clamps a stored point that a re-analysis left past the end', () => {
    // A song can get shorter — a re-upload, a re-transcode — and a preview
    // point stored against the old duration would play nothing.
    expect(resolvePreviewStart(500, 100)).toBe(100 - PREVIEW_SECONDS);
  });

  it('treats null, negative and garbage as the start', () => {
    expect(resolvePreviewStart(null, 200)).toBe(0);
    expect(resolvePreviewStart(undefined, 200)).toBe(0);
    expect(resolvePreviewStart(-5, 200)).toBe(0);
    expect(resolvePreviewStart(Number.NaN, 200)).toBe(0);
  });

  it('keeps a valid stored point untouched', () => {
    expect(resolvePreviewStart(45.5, 200)).toBe(45.5);
  });
});

describe('previewFragment', () => {
  it('emits a media fragment with both bounds', () => {
    // The fragment rather than a `currentTime` seek is what lets the browser
    // issue one range request instead of fetching the head of the file.
    expect(previewFragment('/api/stream/x', 60)).toBe('/api/stream/x#t=60,80');
  });

  it('rounds to hundredths and refuses a negative start', () => {
    expect(previewFragment('/s', 12.3456)).toBe('/s#t=12.35,32.35');
    expect(previewFragment('/s', -3)).toBe('/s#t=0,20');
  });
});
