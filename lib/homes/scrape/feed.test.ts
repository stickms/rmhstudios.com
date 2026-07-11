import { describe, expect, it } from 'vitest';
import { parseFeedItems, pickField } from './feed';

const RSS2 = `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Housing feed</title>
    <item>
      <title>Bright 2BR in Midtown</title>
      <link>https://example.com/listing/42</link>
      <guid>listing-42</guid>
      <description><![CDATA[<p>Sunny &amp; spacious. $1,800/mo. Cats OK.</p>]]></description>
      <pubDate>Wed, 08 Jul 2026 12:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example.com/42/a.jpg" type="image/jpeg" />
      <media:content url="https://cdn.example.com/42/b.jpg" />
    </item>
    <item>
      <title>Studio near the park</title>
      <link>https://example.com/listing/43</link>
      <guid>listing-43</guid>
      <description>Cozy studio.</description>
    </item>
  </channel>
</rss>`;

// Craigslist's RDF variant: namespaced dc:date + a geo:Point wrapper.
const CL_RDF = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="..." xmlns:dc="..." xmlns:geo="...">
  <item rdf:about="https://rochester.craigslist.org/apa/d/x/7712345678.html">
    <title><![CDATA[$1,850 / 2br - 900ft2 - Sunny flat (Park Ave)]]></title>
    <link>https://rochester.craigslist.org/apa/d/x/7712345678.html</link>
    <dc:date>2026-07-08T09:30:00-04:00</dc:date>
    <geo:Point>
      <geo:lat>43.1566</geo:lat>
      <geo:long>-77.6088</geo:long>
    </geo:Point>
  </item>
</rdf:RDF>`;

describe('parseFeedItems (RSS 2.0)', () => {
  const items = parseFeedItems(RSS2);

  it('finds every item', () => {
    expect(items).toHaveLength(2);
  });

  it('reads leaf fields and unwraps CDATA + entities', () => {
    const f = items[0].fields;
    expect(f.title).toBe('Bright 2BR in Midtown');
    expect(f.link).toBe('https://example.com/listing/42');
    expect(f.guid).toBe('listing-42');
    expect(f.description).toContain('Sunny & spacious');
    expect(f.pubdate).toBe('Wed, 08 Jul 2026 12:00:00 GMT');
  });

  it('collects enclosure + media:content image urls', () => {
    expect(items[0].imageUrls).toEqual([
      'https://cdn.example.com/42/a.jpg',
      'https://cdn.example.com/42/b.jpg',
    ]);
  });
});

describe('parseFeedItems (Craigslist RDF)', () => {
  const [item] = parseFeedItems(CL_RDF);

  it('reads namespaced leaf tags but skips container tags', () => {
    expect(item.fields['dc:date']).toBe('2026-07-08T09:30:00-04:00');
    expect(item.fields['geo:lat']).toBe('43.1566');
    expect(item.fields['geo:long']).toBe('-77.6088');
    // geo:Point is a container — its raw text must not leak in as a field.
    expect(item.fields['geo:point']).toBeUndefined();
  });

  it('unwraps the CDATA title', () => {
    expect(item.fields.title).toBe('$1,850 / 2br - 900ft2 - Sunny flat (Park Ave)');
  });
});

describe('pickField', () => {
  it('returns the first present non-empty value', () => {
    expect(pickField({ a: '', b: 'x' }, ['a', 'b'])).toBe('x');
    expect(pickField({}, ['a'])).toBeNull();
  });
});

describe('parseFeedItems (junk input)', () => {
  it('returns [] for empty / non-feed content', () => {
    expect(parseFeedItems('')).toEqual([]);
    expect(parseFeedItems('<html><body>not a feed</body></html>')).toEqual([]);
  });
});
