import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import manifest from '../../../data/medschools/crests.json';
import { SchoolCrest, crestInitials } from './SchoolCrest';

describe('SchoolCrest', () => {
  it('renders a decorative lazy img for a school with a crest', () => {
    const slug = manifest.slugs[0]!;
    const html = renderToString(<SchoolCrest slug={slug} name="Some School" size={40} />);
    expect(html).toContain(`src="/images/medschools/crests/${slug}.webp"`);
    expect(html).toContain('alt=""');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('width="40"');
    expect(html).toContain('bg-site-bg-subtle');
  });
  it('renders aria-hidden initials without a crest', () => {
    const html = renderToString(<SchoolCrest slug="no-such-school" name="The University of Nowhere" />);
    expect(html).not.toContain('<img');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('>UN<');
  });
  it('derives initials from significant words', () => {
    expect(crestInitials('Harvard Medical School')).toBe('HM');
    expect(crestInitials('')).toBe('');
  });
  it('uses site tokens only', () => {
    const src = readFileSync('features/medschools/ui/SchoolCrest.tsx', 'utf8');
    expect(src).not.toMatch(/rounded-(sm|md|lg|xl|full)\b|#[0-9a-f]{3,6}\b|\b(bg|text|border)-(white|black|gray|slate|zinc|neutral)/);
    expect(src).toContain('rounded-site-sm');
  });
});
