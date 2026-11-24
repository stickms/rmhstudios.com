import { describe, expect, it } from 'vitest';
import { encodeFragmentTerm, normaliseQuote, pdfPageUrl, textFragmentUrl } from './text-fragment';

describe('text fragments', () => {
  it('encodes the characters the fragment syntax reserves', () => {
    expect(encodeFragmentTerm('a-b, c & d')).toBe('a%2Db%2C%20c%20%26%20d');
    expect(encodeFragmentTerm('MD–PhD 50%')).toBe('MD%E2%80%93PhD%2050%25');
    expect(encodeFragmentTerm('café')).toBe('caf%C3%A9');
  });

  it('matches a short quote whole', () => {
    expect(textFragmentUrl('https://med.example.edu/admissions', 'Rolling admissions.')).toBe(
      'https://med.example.edu/admissions#:~:text=Rolling%20admissions.',
    );
  });

  it('uses the first and last words of a long quote', () => {
    const q = 'Applications are reviewed on a rolling basis as they are completed, so apply early.';
    expect(textFragmentUrl('https://x.test/p', q)).toBe(
      'https://x.test/p#:~:text=Applications%20are%20reviewed%20on,completed%2C%20so%20apply%20early.',
    );
    // A nine-word quote is still matched whole.
    expect(textFragmentUrl('https://x.test/p', 'one two three four five six seven eight nine')).toBe(
      'https://x.test/p#:~:text=one%20two%20three%20four%20five%20six%20seven%20eight%20nine',
    );
  });

  it('collapses whitespace, drops wrapping quotation marks and replaces an existing fragment', () => {
    expect(normaliseQuote('  “We  review\n on a rolling basis.” ')).toBe('We review on a rolling basis.');
    expect(textFragmentUrl('https://x.test/p#top', '"Hello - world"')).toBe(
      'https://x.test/p#:~:text=Hello%20%2D%20world',
    );
  });

  it('leaves the URL alone with no quote', () => {
    expect(textFragmentUrl('https://x.test/p', null)).toBe('https://x.test/p');
    expect(textFragmentUrl('https://x.test/p', '   ')).toBe('https://x.test/p');
  });

  it('points a PDF at a page', () => {
    expect(pdfPageUrl('https://aamc.test/media/6996/download?attachment', 2)).toBe(
      'https://aamc.test/media/6996/download?attachment#page=2',
    );
    expect(pdfPageUrl('https://aamc.test/a.pdf', null)).toBe('https://aamc.test/a.pdf');
    expect(pdfPageUrl('https://aamc.test/a.pdf', 0)).toBe('https://aamc.test/a.pdf');
  });
});
