// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: unknown; className?: string }) => (
    <a href="/" className={className}>
      {children as never}
    </a>
  ),
}));

import { CompareTable } from '../CompareTable';
import { buildComparison } from '@/lib/homes/compare';
import { DEFAULT_INCOME_PROFILE } from '@/lib/homes/affordability';
import type { Listing } from '@/lib/homes/types';

function listing(over: Partial<Listing>): Listing {
  return {
    id: 'a',
    source: 'COMMUNITY',
    status: 'ACTIVE',
    listingType: 'RENT',
    propertyType: 'APARTMENT',
    title: 'Sunny two-bed',
    description: 'A bright flat.',
    price: 1500,
    beds: 2,
    baths: 1,
    sqft: 750,
    address: null,
    city: 'Rochester',
    state: 'NY',
    postalCode: null,
    lat: 43.1566,
    lng: -77.6088,
    amenities: ['Parking'],
    petsAllowed: true,
    availableFrom: '2026-12-01T00:00:00.000Z',
    images: [],
    aiImages: [],
    imageAlts: [],
    viewsCount: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    author: null,
    externalUrl: null,
    sourceName: null,
    favorited: true,
    isOwner: false,
    ...over,
  };
}

const a = listing({ id: 'a' });
const b = listing({ id: 'b', title: 'Quiet studio', status: 'RENTED', amenities: ['Laundry'], petsAllowed: false });

function render(extra: Parameters<typeof buildComparison>[0] extends infer I ? Partial<I> : never = {}) {
  const model = buildComparison({
    listings: [a, b],
    notes: { a: 'viewing Thursday', b: 'مرحبا' },
    place: { label: 'Work', lat: 43.16, lng: -77.61 },
    profile: { ...DEFAULT_INCOME_PROFILE, annualIncome: 72000 },
    ...extra,
  });
  return renderToStaticMarkup(<CompareTable model={model} unit="mi" placeLabel="Work" onRemove={() => {}} />);
}

describe('CompareTable', () => {
  it('is a real table with column headers per listing and row headers per fact', () => {
    const html = render();
    expect(html).toContain('<table');
    expect(html).toContain('<caption');
    expect(html.match(/<th scope="col"/g)?.length).toBe(3); // the fact column and two listings
    expect(html).toContain('<th scope="row"');
    expect(html).toContain('Price');
    expect(html).toContain('Per square foot');
    expect(html).toContain('Distance to Work, straight line');
    expect(html).toContain('Against your budget');
    expect(html).toContain('Within your budget');
  });

  it('marks a listing that is no longer active and keeps its column', () => {
    const html = render();
    expect(html.match(/No longer listed/g)).toHaveLength(1);
    expect(html).toContain('Quiet studio');
  });

  it('renders notes as text with dir="auto", never as markup', () => {
    const html = render({ notes: { a: '<b>viewing</b> Thursday', b: 'مرحبا' } });
    expect(html).toContain('dir="auto"');
    expect(html).toContain('&lt;b&gt;viewing&lt;/b&gt; Thursday');
    expect(html).not.toContain('<b>viewing</b>');
    expect(html).toContain('مرحبا');
  });

  it('gives every tick text and divides columns by a 1px rule, with no boxes', () => {
    const html = render();
    expect(html).toContain('Has it');
    expect(html).toContain('Does not have it');
    expect(html).toContain('border-s border-site-border');
    expect(html).not.toMatch(/shadow|bg-site-surface|backdrop|gradient/);
    expect(html).toContain('$2.00');
  });

  it('scrolls inside its own region with the row names pinned', () => {
    const html = render();
    expect(html).toContain('role="region"');
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('sticky start-0');
  });

  it('names each remove control by the listing', () => {
    expect(render()).toContain('aria-label="Remove Quiet studio from the comparison"');
  });
});
