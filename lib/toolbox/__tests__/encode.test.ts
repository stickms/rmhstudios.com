import { describe, expect, it } from 'vitest';
import { ENCODINGS, decode, encode } from '@/lib/toolbox/encode';

const samples = ['', 'hello', 'é', 'emoji 😀 & <tags> "quotes" \'apos\'', 'line\nbreak/plus+eq=', '日本語'];

describe('encode / decode', () => {
  it('round-trips every encoding', () => {
    for (const enc of ENCODINGS) {
      for (const s of samples) expect(decode(encode(s, enc), enc), `${enc}: ${s}`).toEqual({ ok: true, text: s });
    }
  });

  it('encodes UTF-8, not Latin-1', () => {
    expect(encode('é', 'base64')).toBe('w6k=');
    expect(encode('é', 'hex')).toBe('c3 a9');
    expect(encode('a b&c', 'url')).toBe('a%20b%26c');
    expect(encode('<a href="x">', 'html')).toBe('&lt;a href=&quot;x&quot;&gt;');
  });

  it('makes URL-safe Base64 without padding', () => {
    expect(encode('??>', 'base64')).toBe('Pz8+');
    expect(encode('??>', 'base64url')).toBe('Pz8-');
    expect(encode('a', 'base64url')).toBe('YQ');
  });

  it('decodes lenient forms people paste', () => {
    expect(decode('w6k', 'base64')).toEqual({ ok: true, text: 'é' });
    expect(decode('aGVs\nbG8=', 'base64')).toEqual({ ok: true, text: 'hello' });
    expect(decode('0x68 0x69', 'hex')).toEqual({ ok: true, text: 'hi' });
    expect(decode('68:69', 'hex')).toEqual({ ok: true, text: 'hi' });
    expect(decode('a+b%21', 'url')).toEqual({ ok: true, text: 'a b!' });
    expect(decode('&copy; &#169; &#xA9; &unknown;', 'html')).toEqual({ ok: true, text: '© © © &unknown;' });
  });

  it('reports invalid input and invalid UTF-8', () => {
    expect(decode('abc$', 'base64')).toEqual({ ok: false, reason: 'invalid-input' });
    expect(decode('a', 'base64')).toEqual({ ok: false, reason: 'invalid-input' });
    expect(decode('Pz8+', 'base64url')).toEqual({ ok: false, reason: 'invalid-input' });
    expect(decode('%E0%A4%A', 'url')).toEqual({ ok: false, reason: 'invalid-input' });
    expect(decode('abc', 'hex')).toEqual({ ok: false, reason: 'invalid-input' });
    expect(decode('ff', 'hex')).toEqual({ ok: false, reason: 'invalid-utf8' });
    expect(decode('/w==', 'base64')).toEqual({ ok: false, reason: 'invalid-utf8' });
  });

  it('leaves out-of-range numeric entities alone', () => {
    expect(decode('&#xD800; &#99999999;', 'html')).toEqual({ ok: true, text: '&#xD800; &#99999999;' });
  });
});
