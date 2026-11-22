/**
 * What an occlusion card looks and sounds like in review (s09-03), rendered to static markup: the picture with its
 * description, the masks as positioned elements over it (ink for the target, muted for the others in hide-all mode),
 * "Covered part N of M" for a screen reader, and on the reveal the label as text with the target mask lifted.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
    i18n: { language: 'en' },
  }),
}));

import { OcclusionReview } from '../OcclusionReview';
import type { OcclusionReviewData } from '@/lib/study/occlusion';

const image = { url: '/api/feed/image/diagram.webp', alt: 'A labelled heart' };
const masks = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  x: 0.1 * i,
  y: 0.2,
  w: 0.08,
  h: 0.1,
  label: `part ${i + 1}`,
}));
const data = (over: Partial<OcclusionReviewData> = {}): OcclusionReviewData => ({
  mode: 'hide-all',
  masks,
  targetId: 2,
  note: '',
  ...over,
});
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('OcclusionReview', () => {
  it('shows the picture’s description, the default prompt and "Covered part 2 of 6"', () => {
    const html = renderToStaticMarkup(<OcclusionReview image={image} prompt="" data={data()} revealed={false} />);
    expect(html).toContain('alt="A labelled heart"');
    expect(html).toContain('Name the covered part');
    expect(html).toContain('Covered part 2 of 6');
    expect(html).not.toContain('part 2</');
  });

  it('covers the target in ink and the other five in the muted colour in hide-all mode', () => {
    const html = renderToStaticMarkup(
      <OcclusionReview image={image} prompt="Name it" data={data()} revealed={false} />,
    );
    expect(html).toContain('Name it');
    expect(count(html, 'data-mask="target"')).toBe(1);
    expect(count(html, 'data-mask="covered"')).toBe(5);
    expect(html).toContain('border-site-bg bg-site-text"');
    expect(html).toContain('bg-site-text-muted');
    // The masks are decoration for the eye, hidden from a screen reader.
    expect(count(html, 'aria-hidden="true"')).toBe(6);
  });

  it('reveals only its own label as text and lifts only its own mask', () => {
    const html = renderToStaticMarkup(
      <OcclusionReview image={image} prompt="" data={data({ note: 'The big one' })} revealed />,
    );
    expect(count(html, 'data-mask="target"')).toBe(0);
    expect(count(html, 'data-mask="covered"')).toBe(5);
    expect(html).toContain('part 2');
    for (const other of [1, 3, 4, 5, 6]) expect(html).not.toContain(`>part ${other}<`);
    expect(html).toContain('The big one');
    expect(html).toContain('aria-live="polite"');
  });

  it('draws only the target in hide-one mode', () => {
    const html = renderToStaticMarkup(
      <OcclusionReview image={image} prompt="" data={data({ mode: 'hide-one' })} revealed={false} />,
    );
    expect(count(html, 'data-mask="target"')).toBe(1);
    expect(count(html, 'data-mask="covered"')).toBe(0);
  });

  it('positions each mask over the picture in picture-relative percentages', () => {
    const html = renderToStaticMarkup(<OcclusionReview image={image} prompt="" data={data()} revealed={false} />);
    expect(html).toContain('left:10%;top:20%;width:8%;height:10%');
  });
});
