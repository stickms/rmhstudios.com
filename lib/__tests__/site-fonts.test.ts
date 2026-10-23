import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const rootTsx = readFileSync(join(root, 'app/routes/__root.tsx'), 'utf8');

/** First declaration of a token anywhere in the sheet (the default `:root` block). */
function firstToken(name: string): string {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`${name} not found`);
  return m[1].replace(/\s+/g, ' ').trim();
}

describe('site font tokens', () => {
  for (const token of ['--site-font-display', '--site-font-body']) {
    it(`${token} leads with Geist and keeps the non-Latin fallbacks`, () => {
      const v = firstToken(token);
      expect(v.startsWith('var(--font-geist)')).toBe(true);
      expect(v).toContain('system-ui');
      expect(v).toContain('var(--font-inter)');
    });
  }

  it('--site-font-mono leads with Geist Mono and keeps JetBrains Mono', () => {
    const v = firstToken('--site-font-mono');
    expect(v.startsWith('var(--font-geist-mono)')).toBe(true);
    expect(v).toContain('var(--font-jetbrains-mono)');
  });

  it('defines the Geist family tokens', () => {
    expect(firstToken('--font-geist')).toContain("'Geist Variable'");
    expect(firstToken('--font-geist-mono')).toContain("'Geist Mono'");
  });

  it('family tokens end in a named face, never a generic (a generic makes the rest of the stack unreachable)', () => {
    const generics = /(^|,)\s*(sans-serif|serif|monospace|system-ui|ui-[a-z-]+|cursive|fantasy)\s*$/;
    expect(firstToken('--font-geist')).not.toMatch(generics);
    expect(firstToken('--font-geist-mono')).not.toMatch(generics);
  });

  it('fallbacks follow Geist in order', () => {
    const order = (v: string, names: string[]) => {
      const idx = names.map((n) => v.indexOf(n));
      expect(idx.every((i) => i >= 0)).toBe(true);
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    };
    for (const token of ['--site-font-display', '--site-font-body']) {
      order(firstToken(token), [
        'var(--font-geist)',
        '-apple-system',
        'var(--font-inter)',
        'system-ui',
      ]);
    }
    order(firstToken('--site-font-mono'), [
      'var(--font-geist-mono)',
      'var(--font-jetbrains-mono)',
      "'SF Mono'",
      'monospace',
    ]);
  });

  it('preloads the Latin Geist woff2', () => {
    expect(rootTsx).toMatch(/geist-latin-wght-normal\.woff2\?url/);
    expect(rootTsx).toMatch(/href:\s*geistLatinWoff2/);
  });
});
