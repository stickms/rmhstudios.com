/**
 * The login page's paintings: a random one each visit, never the same twice running, and every one has its files.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOGIN_ART, LOGIN_ART_WIDTHS, isLoginArt, loginArtSrc, pickLoginArt } from '../login-art';
import { LOGIN_ART_PREVIEWS } from '../login-art-previews';

describe('pickLoginArt', () => {
  it('can pick every painting', () => {
    const seen = new Set(LOGIN_ART.map((_, i) => pickLoginArt(null, () => i / LOGIN_ART.length)));
    expect([...seen].sort()).toEqual([...LOGIN_ART].sort());
  });

  it('never repeats the last one', () => {
    for (const last of LOGIN_ART) {
      for (let step = 0; step < 100; step++) {
        expect(pickLoginArt(last, () => step / 100)).not.toBe(last);
      }
    }
  });

  it('can still reach every other painting when one is excluded', () => {
    const seen = new Set(Array.from({ length: 100 }, (_, step) => pickLoginArt('meadow', () => step / 100)));
    expect([...seen].sort()).toEqual(LOGIN_ART.filter((a) => a !== 'meadow').sort());
  });

  it('stays in range at the top of the random range', () => {
    expect(isLoginArt(pickLoginArt(null, () => 0.9999999999))).toBe(true);
    expect(isLoginArt(pickLoginArt('coast', () => 0.9999999999))).toBe(true);
  });

  it('ignores a remembered value that is not one of ours (a stale or edited entry)', () => {
    expect(isLoginArt(pickLoginArt('removed-scene', () => 0))).toBe(true);
    expect(pickLoginArt('removed-scene', () => 0)).toBe(LOGIN_ART[0]);
    expect(pickLoginArt('', () => 0)).toBe(LOGIN_ART[0]);
  });
});

describe('the files', () => {
  const dir = join(process.cwd(), 'public/images/login');

  it('exist for every painting at every width', () => {
    for (const art of LOGIN_ART) {
      for (const width of LOGIN_ART_WIDTHS) {
        expect(existsSync(join(process.cwd(), 'public', loginArtSrc(art, width))), `${art} at ${width}`).toBe(true);
      }
    }
  });

  it('are the only ones there, so a scene drawn but not listed (or the reverse) is caught', () => {
    const expected = LOGIN_ART.flatMap((art) => LOGIN_ART_WIDTHS.map((w) => `${art}-${w}.webp`)).sort();
    expect(readdirSync(dir).sort()).toEqual(expected);
  });
});

describe('the previews', () => {
  const PREFIX = 'data:image/webp;base64,';

  it('are there for exactly the paintings that exist', () => {
    expect(Object.keys(LOGIN_ART_PREVIEWS).sort()).toEqual([...LOGIN_ART].sort());
  });

  it('are small WebP images, small enough to inline in the page', () => {
    for (const art of LOGIN_ART) {
      const uri = LOGIN_ART_PREVIEWS[art];
      expect(uri.startsWith(PREFIX), art).toBe(true);
      const bytes = Buffer.from(uri.slice(PREFIX.length), 'base64');
      expect(bytes.subarray(0, 4).toString('ascii'), `${art} RIFF`).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii'), `${art} WEBP`).toBe('WEBP');
      expect(bytes.length, `${art} size`).toBeLessThan(2048);
    }
  });
});
