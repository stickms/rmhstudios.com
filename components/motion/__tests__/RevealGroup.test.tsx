/**
 * RevealGroup / RevealItem — render-to-string tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

const reduced = { value: false };
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => reduced.value,
  prefersReducedMotion: () => reduced.value,
}));

import { RevealGroup, RevealItem } from '../RevealGroup';

afterEach(() => {
  reduced.value = false;
});

describe('RevealGroup', () => {
  it('renders its children', () => {
    const html = renderToString(
      <RevealGroup>
        <RevealItem>a</RevealItem>
        <RevealItem>b</RevealItem>
      </RevealGroup>,
    );
    expect(html).toContain('a');
    expect(html).toContain('b');
  });

  it('children start hidden (staggered fade-rise initial state applied)', () => {
    const html = renderToString(
      <RevealGroup>
        <RevealItem>item</RevealItem>
      </RevealGroup>,
    );
    // fadeRise hidden variant → opacity 0 + translateY(16px) on the item.
    expect(html).toContain('opacity:0');
    expect(html).toContain('translateY(16px)');
  });

  it('forwards className and honors `as`', () => {
    const html = renderToString(
      <RevealGroup as="ul" className="grp">
        <RevealItem as="li">x</RevealItem>
      </RevealGroup>,
    );
    expect(html).toMatch(/<ul[^>]*class="grp"/);
    expect(html).toMatch(/<li/);
  });

  it('under reduced motion renders plain elements with no motion styles', () => {
    reduced.value = true;
    const html = renderToString(
      <RevealGroup className="grp">
        <RevealItem>visible</RevealItem>
      </RevealGroup>,
    );
    expect(html).toContain('visible');
    expect(html).toContain('grp');
    expect(html).not.toContain('opacity:0');
    expect(html).not.toContain('translateY');
  });
});
