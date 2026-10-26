import { describe, expect, it } from 'vitest';
import {
  buildTokens,
  decodeLocalisation,
  languageFilePath,
  languageOf,
  parseLocalisation,
} from '../localisation';
import { substituteLabel } from '../scene/build';

const file = (language: string, tokens: Record<string, string>) =>
  `"lang"\n{\n"Language" "${language}"\n"Tokens"\n{\n${Object.entries(tokens)
    .map(([k, v]) => `"${k}" "${v}"`)
    .join('\n')}\n}\n}\n`;

const utf16 = (text: string) => {
  const out = new Uint8Array(2 + text.length * 2);
  out.set([0xff, 0xfe]);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + i * 2] = c & 255;
    out[3 + i * 2] = c >> 8;
  }
  return out;
};

describe('TF2 localisation files', () => {
  it('reads Valve’s UTF-16 files and the language they declare', () => {
    const bytes = utf16(file('English', { TF_Hud_Foo: 'Foo\\nBar' }));
    expect(languageOf(bytes)).toBe('english');
    const { tokens } = parseLocalisation(decodeLocalisation(bytes));
    expect(tokens.get('tf_hud_foo')).toBe('Foo\nBar');
  });

  it('accepts UTF-8 with or without a BOM', () => {
    const plain = new TextEncoder().encode(file('French', { A: 'é' }));
    expect(parseLocalisation(decodeLocalisation(plain)).tokens.get('a')).toBe('é');
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...plain]);
    expect(parseLocalisation(decodeLocalisation(bom)).tokens.get('a')).toBe('é');
  });

  it('defaults to English and falls back to it for missing tokens', () => {
    const files = new Map([
      [
        languageFilePath('english'),
        utf16(file('English', { Hello: 'Hello', Only_En: 'English only' })),
      ],
      [languageFilePath('german'), utf16(file('German', { Hello: 'Hallo' }))],
    ]);
    const read = (p: string) => files.get(p);
    const en = buildTokens('english', read);
    const de = buildTokens('german', read);
    expect(substituteLabel('#Hello', new Map(), en)).toBe('Hello');
    expect(substituteLabel('#Hello', new Map(), de)).toBe('Hallo');
    expect(substituteLabel('#Only_En', new Map(), de)).toBe('English only');
    // No file at all: a readable name, not a blank.
    expect(
      substituteLabel(
        '#TF_Some_Token',
        new Map(),
        buildTokens('english', () => undefined),
      ),
    ).toBe('Some Token');
  });
});

describe('#strings outside labelText', () => {
  it('lists the text properties and resolves a label’s `text` too', async () => {
    const { TEXT_KEYS } = await import('../scene/build');
    for (const k of ['labeltext', 'text', 'title', 'header', 'tooltiptext'])
      expect(TEXT_KEYS.has(k)).toBe(true);
    expect(TEXT_KEYS.has('xpos')).toBe(false);
  });
});
