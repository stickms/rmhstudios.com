import { describe, expect, it } from 'vitest';
import {
  findRelMeLinks,
  htmlVerifiesHandle,
  profileHandleFromUrl,
  profileLinkRel,
  profileUrlFor,
  relContainsMe,
  stripInertMarkup,
} from '@/lib/profile-links/rel-me';
import { linkDisplayLabel, linkHost, normalizeLinkUrl } from '@/lib/profile-links/schema';

/**
 * J1's whole security posture is "does this page link back to us with
 * rel=me?", so the matcher is the thing worth testing. Most of these cases are
 * *hostile*: each one is a way somebody could otherwise claim a domain they do
 * not control.
 */

const back = (handle = 'alice') => `<a rel="me" href="https://rmhstudios.com/u/${handle}">RMH</a>`;

describe('rel="me" — the happy paths', () => {
  it('matches the canonical anchor', () => {
    expect(htmlVerifiesHandle(`<html><body>${back()}</body></html>`, 'alice')).toBe(true);
  });

  it('matches a <link rel="me"> in the head', () => {
    const html = '<head><link rel="me" href="https://rmhstudios.com/u/alice"></head>';
    expect(htmlVerifiesHandle(html, 'alice')).toBe(true);
  });

  it('accepts rel token lists, in any order and any case', () => {
    for (const rel of ['me nofollow', 'nofollow me', 'ME', ' me  noopener ']) {
      const html = `<a rel="${rel}" href="https://rmhstudios.com/u/alice">x</a>`;
      expect(htmlVerifiesHandle(html, 'alice'), rel).toBe(true);
    }
  });

  it('accepts single quotes, unquoted attributes and attribute order', () => {
    expect(
      htmlVerifiesHandle(`<a href='https://rmhstudios.com/u/alice' rel='me'>x</a>`, 'alice'),
    ).toBe(true);
    expect(htmlVerifiesHandle(`<a href=https://rmhstudios.com/u/alice rel=me>x</a>`, 'alice')).toBe(
      true,
    );
  });

  it('accepts www, uppercase host, a trailing slash and a percent-encoded handle', () => {
    expect(
      htmlVerifiesHandle('<a rel="me" href="https://WWW.RMHStudios.com/u/alice/">x</a>', 'alice'),
    ).toBe(true);
    expect(
      htmlVerifiesHandle('<a rel="me" href="https://rmhstudios.com/u/%61lice">x</a>', 'alice'),
    ).toBe(true);
  });

  it('is case-insensitive about the claimed handle', () => {
    expect(
      htmlVerifiesHandle('<a rel="me" href="https://rmhstudios.com/u/Alice">x</a>', 'alice'),
    ).toBe(true);
    expect(htmlVerifiesHandle(back(), 'ALICE')).toBe(true);
  });

  it('decodes entities in the href', () => {
    const html = '<a rel="me" href="https://rmhstudios.com/u/alice?a=1&amp;b=2">x</a>';
    expect(htmlVerifiesHandle(html, 'alice')).toBe(true);
  });
});

describe('rel="me" — hostile input', () => {
  it('does not treat "meme" or "memento" as the me token', () => {
    expect(relContainsMe('meme')).toBe(false);
    expect(relContainsMe('me-too')).toBe(false);
    expect(
      htmlVerifiesHandle('<a rel="meme" href="https://rmhstudios.com/u/alice">x</a>', 'alice'),
    ).toBe(false);
  });

  it('ignores markup inside an HTML comment', () => {
    const html = `<!-- ${back()} -->`;
    expect(htmlVerifiesHandle(html, 'alice')).toBe(false);
  });

  it('ignores markup inside script, style, template and textarea', () => {
    for (const tag of ['script', 'style', 'template', 'textarea']) {
      const html = `<${tag}>${back()}</${tag}>`;
      expect(htmlVerifiesHandle(html, 'alice'), tag).toBe(false);
    }
  });

  it('ignores an unterminated comment that swallows the rest of the page', () => {
    expect(htmlVerifiesHandle(`<!-- oops ${back()}`, 'alice')).toBe(false);
  });

  it('rejects a lookalike host', () => {
    for (const host of [
      'rmhstudios.com.evil.test',
      'notrmhstudios.com',
      'rmhstudios.com.co',
      'evil.test',
    ]) {
      const html = `<a rel="me" href="https://${host}/u/alice">x</a>`;
      expect(htmlVerifiesHandle(html, 'alice'), host).toBe(false);
    }
  });

  it('rejects our URL smuggled into a query string or fragment', () => {
    expect(
      htmlVerifiesHandle(
        '<a rel="me" href="https://evil.test/?to=https://rmhstudios.com/u/alice">x</a>',
        'alice',
      ),
    ).toBe(false);
    expect(
      htmlVerifiesHandle(
        '<a rel="me" href="https://evil.test/#https://rmhstudios.com/u/alice">x</a>',
        'alice',
      ),
    ).toBe(false);
  });

  it('rejects userinfo-in-authority tricks', () => {
    const html = '<a rel="me" href="https://rmhstudios.com@evil.test/u/alice">x</a>';
    expect(htmlVerifiesHandle(html, 'alice')).toBe(false);
  });

  it('rejects a neighbouring handle or a deeper path', () => {
    expect(htmlVerifiesHandle(back('alice2'), 'alice')).toBe(false);
    expect(htmlVerifiesHandle(back('alice-two'), 'alice')).toBe(false);
    expect(
      htmlVerifiesHandle('<a rel="me" href="https://rmhstudios.com/u/alice/posts">x</a>', 'alice'),
    ).toBe(false);
    expect(
      htmlVerifiesHandle('<a rel="me" href="https://rmhstudios.com/alice">x</a>', 'alice'),
    ).toBe(false);
  });

  it('rejects non-http(s) schemes', () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,<a rel=me>',
      'ftp://rmhstudios.com/u/alice',
    ]) {
      expect(profileHandleFromUrl(href), href).toBeNull();
    }
  });

  it('does not resolve a relative /u/alice against the target site', () => {
    const html = '<a rel="me" href="/u/alice">x</a>';
    expect(htmlVerifiesHandle(html, 'alice', 'https://example.test/about')).toBe(false);
  });

  it('rejects a rel="me" pointing at somebody else', () => {
    expect(htmlVerifiesHandle(back('bob'), 'alice')).toBe(false);
  });

  it('refuses an empty handle claim outright', () => {
    expect(htmlVerifiesHandle(back(), '')).toBe(false);
    expect(htmlVerifiesHandle(back(), '   ')).toBe(false);
  });

  it('still finds the real link when a decoy sits beside it', () => {
    const html = `<!-- ${back('bob')} --><script>${back('carol')}</script>${back('alice')}`;
    const found = findRelMeLinks(html);
    expect(found).toHaveLength(1);
    expect(found[0].handle).toBe('alice');
    expect(htmlVerifiesHandle(html, 'alice')).toBe(true);
    expect(htmlVerifiesHandle(html, 'bob')).toBe(false);
  });

  it('survives a rel="me" tag with no href', () => {
    expect(() => findRelMeLinks('<a rel="me">no href</a>')).not.toThrow();
    expect(findRelMeLinks('<a rel="me">no href</a>')).toEqual([]);
  });

  it('survives a garbage href without throwing', () => {
    expect(findRelMeLinks('<a rel="me" href="http://[">x</a>')).toEqual([
      { href: 'http://[', handle: null },
    ]);
  });
});

describe('stripInertMarkup', () => {
  it('removes each inert region', () => {
    const stripped = stripInertMarkup('<p>keep</p><!--drop--><script>drop</script>');
    expect(stripped).toContain('keep');
    expect(stripped).not.toContain('drop');
  });
});

describe('the reciprocal half', () => {
  it('emits rel="me" only on verified links', () => {
    expect(profileLinkRel(true).split(/\s+/)).toContain('me');
    expect(profileLinkRel(false).split(/\s+/)).not.toContain('me');
  });

  it('always keeps the user-generated-content markers', () => {
    for (const verified of [true, false]) {
      const tokens = profileLinkRel(verified).split(/\s+/);
      expect(tokens).toContain('nofollow');
      expect(tokens).toContain('ugc');
      expect(tokens).toContain('noopener');
    }
  });

  it('builds a back-link the matcher accepts', () => {
    const url = profileUrlFor('alice');
    expect(htmlVerifiesHandle(`<a rel="me" href="${url}">x</a>`, 'alice')).toBe(true);
  });
});

describe('link normalisation', () => {
  it('normalises the host for the impersonation index', () => {
    expect(linkHost('https://WWW.Example.com/blog')).toBe('example.com');
    expect(linkHost('https://example.com')).toBe('example.com');
    expect(linkHost('not a url')).toBeNull();
    expect(linkHost('javascript:alert(1)')).toBeNull();
  });

  it('drops the fragment but keeps the path exactly as typed', () => {
    expect(normalizeLinkUrl('https://example.com/~alice#bio')).toBe('https://example.com/~alice');
    expect(normalizeLinkUrl('  https://example.com/a/b  ')).toBe('https://example.com/a/b');
  });

  it('leaves an unparseable value alone rather than inventing one', () => {
    expect(normalizeLinkUrl('  nonsense  ')).toBe('nonsense');
  });

  it('derives a readable label when the user gave none', () => {
    expect(linkDisplayLabel({ url: 'https://www.example.com/blog/2026/x' })).toBe(
      'example.com/blog',
    );
    expect(linkDisplayLabel({ url: 'https://example.com/' })).toBe('example.com');
    expect(linkDisplayLabel({ label: 'My blog', url: 'https://example.com' })).toBe('My blog');
  });
});
