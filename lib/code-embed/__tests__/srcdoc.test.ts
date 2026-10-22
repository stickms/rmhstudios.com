import { describe, expect, it } from 'vitest';
import { buildSrcdoc, EMBED_TOTAL_MAX } from '../shared';
import { codeEmbedSchema } from '../schema';

describe('runnable embed srcdoc', () => {
  it('puts the CSP before any author content and allows no network', () => {
    const doc = buildSrcdoc({ html: '<p>x</p>', css: 'p{}', js: 'alert(1)' });
    const csp = doc.indexOf('Content-Security-Policy');
    expect(csp).toBeGreaterThan(-1);
    expect(csp).toBeLessThan(doc.indexOf('<p>x</p>'));
    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toMatch(/connect-src|frame-src/);
  });

  it('keeps author text from closing the wrapper tags early', () => {
    const doc = buildSrcdoc({ html: '', css: '</style><b>', js: '</script><i>' });
    expect(doc.match(/<\/script>/g)).toHaveLength(1);
    expect(doc.match(/<\/style>/g)).toHaveLength(1);
  });

  it('rejects empty and oversized snippets', () => {
    expect(codeEmbedSchema.safeParse({ html: '', css: '', js: '' }).success).toBe(false);
    const big = 'a'.repeat(10_000);
    expect(big.length * 3).toBeGreaterThan(EMBED_TOTAL_MAX);
    expect(codeEmbedSchema.safeParse({ html: big, css: big, js: big }).success).toBe(false);
  });
});
