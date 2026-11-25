// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; defaultValue_one?: string; [k: string]: unknown }) => {
      const template = o.count === 1 && o.defaultValue_one ? o.defaultValue_one : o.defaultValue;
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name]));
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: unknown; className?: string }) => (
    <a href="/" className={rest.className}>
      {children as never}
    </a>
  ),
}));
vi.mock('@/components/homes/FavoriteButton', () => ({ FavoriteButton: () => null }));
vi.mock('@/lib/contract/client', () => ({ api: vi.fn(), AI_IMAGE_TIMEOUT_MS: 1 }));

import { ListingCard } from '../ListingCard';
import { ListingGallery } from '../ListingGallery';
import { ImageUploader } from '../ImageUploader';
import type { Listing } from '@/lib/homes/types';

function listing(over: Partial<Listing>): Listing {
  return {
    id: 'l1',
    source: 'COMMUNITY',
    status: 'ACTIVE',
    listingType: 'RENT',
    propertyType: 'APARTMENT',
    title: 'Sunny two-bed near the park',
    description: 'A bright flat.',
    price: 1500,
    beds: 2,
    baths: 1,
    sqft: null,
    address: null,
    city: 'Rochester',
    state: 'NY',
    postalCode: null,
    lat: 0,
    lng: 0,
    amenities: [],
    petsAllowed: false,
    availableFrom: null,
    images: ['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg'],
    aiImages: [],
    imageAlts: ['Kitchen with a gas hob and a window over the sink', 'Living room', 'Bedroom', ''],
    viewsCount: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    author: null,
    externalUrl: null,
    sourceName: null,
    favorited: false,
    isOwner: false,
    ...over,
  };
}

/** Every <img> in the markup with its alt, in order. */
function imgs(html: string): Array<{ src: string; alt: string | null }> {
  return [...html.matchAll(/<img\b[^>]*>/g)].map((m) => ({
    src: /src="([^"]*)"/.exec(m[0])?.[1] ?? '',
    alt: /\balt="([^"]*)"/.exec(m[0])?.[1] ?? null,
  }));
}

describe('the gallery', () => {
  it('gives every photo a non-empty alt: the description, else "Photo n of m: title"', () => {
    const l = listing({});
    const html = renderToStaticMarkup(<ListingGallery listing={l} activeImage={0} onSelect={() => {}} />);
    const found = imgs(html);
    expect(found.length).toBe(5); // the main photo and four thumbnails
    for (const img of found) expect(img.alt, img.src).toBeTruthy();
    expect(found[0]?.alt).toBe('Kitchen with a gas hob and a window over the sink');
    expect(found[4]?.alt).toBe('Photo 4 of 4: ⁨Sunny two-bed near the park⁩');
  });

  it('describes a listing with no stored descriptions (an old or external one) with the fallback', () => {
    const html = renderToStaticMarkup(
      <ListingGallery listing={listing({ imageAlts: [], images: ['/a.jpg'] })} activeImage={0} onSelect={() => {}} />,
    );
    const found = imgs(html);
    expect(found).toHaveLength(1);
    expect(found[0]?.alt).toContain('Photo 1 of 1: ');
  });

  it('shows the description as a caption with its own direction, and none for an undescribed photo', () => {
    const l = listing({});
    expect(renderToStaticMarkup(<ListingGallery listing={l} activeImage={1} onSelect={() => {}} />)).toContain(
      'dir="auto" aria-hidden="true" class="t-meta mt-2 break-words" data-slot="homes-photo-caption">Living room</p>',
    );
    expect(renderToStaticMarkup(<ListingGallery listing={l} activeImage={3} onSelect={() => {}} />)).not.toContain(
      'homes-photo-caption',
    );
  });
});

describe('the card', () => {
  it('uses the first description for the cover', () => {
    const html = renderToStaticMarkup(<ListingCard listing={listing({})} />);
    expect(imgs(html)[0]?.alt).toBe('Kitchen with a gas hob and a window over the sink');
  });

  it('uses the title when the cover has no description, and for an external listing', () => {
    for (const l of [listing({ imageAlts: ['', 'x'] }), listing({ source: 'EXTERNAL', imageAlts: [] })]) {
      const found = imgs(renderToStaticMarkup(<ListingCard listing={l} />));
      expect(found[0]?.alt).toBe('Sunny two-bed near the park');
    }
  });
});

describe('the photo manager', () => {
  const render = (alts: string[]) =>
    renderToStaticMarkup(
      <ImageUploader value={['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg']} aiImages={[]} alts={alts} onChange={() => {}} />,
    );

  it('has a labelled field for every photo', () => {
    const html = render(['Kitchen', 'Hall', 'Bedroom', '']);
    const labels = [...html.matchAll(/<label for="([^"]+)"[^>]*>Describe this photo<\/label>/g)].map((m) => m[1]);
    expect(labels).toHaveLength(4);
    for (const id of labels) expect(html).toMatch(new RegExp(`<textarea[^>]*id="${id}"`));
    expect(html.match(/<textarea[^>]*dir="auto"/g)).toHaveLength(4);
  });

  it('says in text how many photos have no description', () => {
    expect(render(['Kitchen', 'Hall', 'Bedroom', ''])).toContain('1 photo has no description.');
    expect(render(['', '', '', ''])).toContain('4 photos have no description.');
    expect(render(['a', 'b', 'c', 'd'])).toContain('Every photo has a description.');
  });

  it('gives each picture an alt: its description, else none (the position line names it)', () => {
    const found = imgs(render(['Kitchen', '', '', '']));
    expect(found.map((i) => i.alt)).toEqual(['Kitchen', '', '', '']);
  });
});
