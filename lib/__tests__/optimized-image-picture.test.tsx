/**
 * `OptimizedImage` — the `<picture>` + AVIF contract.
 *
 * This is a shared primitive rendered by ~30 components, and on 2026-08-11 it
 * gained a `<picture>` wrapper so it can offer AVIF (~33% smaller than the WebP
 * it already emitted) ahead of the existing `<img srcSet>`. That change is
 * additive by construction — a browser that doesn't understand `image/avif`
 * ignores the `<source>` and uses the `<img>` exactly as before — but "by
 * construction" is worth asserting when the alternative is finding out on a page
 * nobody looked at.
 *
 * Rendered with `react-dom/server` rather than a DOM harness: this file only
 * needs the markup, and the suite's environment is `node` (vitest.config.ts).
 *
 * What is pinned:
 *   1. A manifest-listed path gets `<picture>` with an AVIF `<source>` FIRST —
 *      `<source>` order is the selection order, so an AVIF source after the
 *      `<img>` would never be chosen.
 *   2. The `<img>` keeps its own WebP `srcSet`, so the fallback path is intact.
 *   3. Both srcSets advertise the SAME widths, since a width present in one
 *      format and not the other means a wasted request and a fallback.
 *   4. A path NOT in the manifest still renders a bare `<img>` — no empty
 *      `<picture>`, no `<source>` pointing at files that were never generated.
 *   5. `className`/`width`/`height` stay on the `<img>`, because `<picture>` has
 *      no box of its own and every caller's layout depends on that.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { IMAGE_VARIANTS } from '@/lib/images/variants.gen';

const [variantPath, variantEntry] = Object.entries(IMAGE_VARIANTS)[0];

const render = (props: { src: string } & Record<string, unknown>) =>
  renderToStaticMarkup(
    <OptimizedImage {...(props as unknown as { src: string; alt: string })} alt="t" />,
  );

describe('OptimizedImage <picture>/AVIF', () => {
  it('offers AVIF before the img for a manifest-listed path', () => {
    const html = render({ src: variantPath, width: 640 });
    expect(html).toContain('<picture>');
    expect(html).toContain('type="image/avif"');
    // Order matters: the browser takes the first source it understands.
    expect(html.indexOf('type="image/avif"')).toBeLessThan(html.indexOf('<img'));
  });

  it('keeps a webp srcSet on the img itself', () => {
    const html = render({ src: variantPath, width: 640 });
    const img = html.slice(html.indexOf('<img'));
    expect(img).toMatch(/srcSet="[^"]*\.webp/i);
    expect(img).not.toMatch(/srcSet="[^"]*\.avif/i);
  });

  it('advertises the same widths in both formats', () => {
    const html = render({ src: variantPath, width: 640 });
    const widthsIn = (chunk: string) =>
      [...chunk.matchAll(/\s(\d+)w/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
    const source = html.slice(html.indexOf('<source'), html.indexOf('<img'));
    const img = html.slice(html.indexOf('<img'));
    expect(widthsIn(source)).toEqual([...variantEntry.widths]);
    expect(widthsIn(source)).toEqual(widthsIn(img));
  });

  it('renders a bare img for a path with no generated variants', () => {
    const html = render({ src: '/images/not-in-the-manifest.png', width: 640 });
    expect(html).not.toContain('<picture>');
    expect(html).not.toContain('image/avif');
    expect(html).toContain('<img');
  });

  it('does not offer AVIF when the caller pinned an explicit format', () => {
    // An explicit `format` is a deliberate override; silently serving a different
    // encoding than the one asked for would make that option a lie.
    const html = render({ src: variantPath, width: 640, format: 'webp' });
    expect(html).not.toContain('image/avif');
  });

  it('leaves className and dimensions on the img, not the picture', () => {
    const html = render({ src: variantPath, width: 640, height: 480, className: 'x-cls' });
    const picture = html.slice(0, html.indexOf('<img'));
    const img = html.slice(html.indexOf('<img'));
    expect(picture).not.toContain('x-cls');
    expect(img).toContain('class="x-cls"');
    expect(img).toContain('width="640"');
    expect(img).toContain('height="480"');
  });
});
