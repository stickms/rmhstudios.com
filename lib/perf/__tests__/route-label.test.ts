import { describe, expect, it } from 'vitest';
import { MAX_LABEL_SEGMENTS, normalizeRoute } from '../route-label';

describe('normalizeRoute', () => {
  it('keeps plain route words and strips the query and fragment', () => {
    expect(normalizeRoute('/api/feed?cursor=abc&limit=20')).toBe('/api/feed');
    expect(normalizeRoute('/wallet#history')).toBe('/wallet');
    expect(normalizeRoute('/')).toBe('/');
    expect(normalizeRoute('')).toBe('/');
    expect(normalizeRoute(undefined)).toBe('/');
  });

  it('accepts a full URL as well as a path', () => {
    expect(normalizeRoute('https://rmhstudios.com/api/posts/123?x=1')).toBe('/api/posts/:id');
    expect(normalizeRoute('http://localhost')).toBe('/');
  });

  it('collapses uuids, cuids, digits and long hex to :id', () => {
    expect(normalizeRoute('/api/posts/3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b')).toBe(
      '/api/posts/:id',
    );
    expect(normalizeRoute('/api/users/cm1x2y3z4a5b6c7d8e9f0g1h2')).toBe('/api/users/:id');
    expect(normalizeRoute('/api/posts/9876543210')).toBe('/api/posts/:id');
    expect(normalizeRoute('/api/blobs/deadbeefcafe0123')).toBe('/api/blobs/:id');
  });

  it('does not mistake short words for ids', () => {
    expect(normalizeRoute('/api/v1/users')).toBe('/api/v1/users');
    expect(normalizeRoute('/admin/library-storage')).toBe('/admin/library-storage');
    // 11 hex chars is below the threshold, and "feed" etc. are plain words.
    expect(normalizeRoute('/x/abcdef01234')).toBe('/x/abcdef01234');
  });

  it('collapses handles but keeps profile traffic recognisable', () => {
    expect(normalizeRoute('/@alice')).toBe('/@:id');
    expect(normalizeRoute('/@alice/followers')).toBe('/@:id/followers');
  });

  it('labels static assets by extension only', () => {
    expect(normalizeRoute('/assets/index-DgX3k9.js')).toBe('static:js');
    expect(normalizeRoute('/assets/fonts/inter.WOFF2?v=3')).toBe('static:woff2');
    expect(normalizeRoute('/favicon.ico')).toBe('static:ico');
    expect(normalizeRoute('/sitemap.xml')).toBe('static:xml');
  });

  it('treats an unknown dotted segment as an id', () => {
    expect(normalizeRoute('/api/version/1.2.3')).toBe('/api/version/:id');
    expect(normalizeRoute('/downloads/file.unknownext')).toBe('/downloads/:id');
  });

  it('keeps at most four segments', () => {
    const label = normalizeRoute('/a/b/c/d/e/f/g');
    expect(label).toBe('/a/b/c/d');
    expect(label.split('/').filter(Boolean)).toHaveLength(MAX_LABEL_SEGMENTS);
  });

  it('collapses over-long slugs', () => {
    expect(normalizeRoute(`/blog/${'x-'.repeat(40)}`)).toBe('/blog/:id');
  });

  it('is bounded: many distinct ids yield one label', () => {
    const labels = new Set<string>();
    for (let i = 0; i < 5000; i++) labels.add(normalizeRoute(`/api/posts/${i}/comments/${i * 7}`));
    expect(labels.size).toBe(1);
  });
});
