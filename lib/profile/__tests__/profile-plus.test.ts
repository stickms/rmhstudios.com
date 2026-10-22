import { describe, it, expect } from 'vitest';
import { sniffAudioContainer } from '@/lib/profile/audio-sniff';
import { judgeStampImage, STAMP_MAX_EDGE, STAMP_MAX_UPLOAD_BYTES } from '@/lib/profile/stamps';
import { visitorHash } from '@/lib/profile/visitor-hash.server';
import {
  isValidTimeZone,
  nowIsStale,
  NOW_STALE_DAYS,
  splitNowText,
} from '@/lib/profile/plus';
import { plusUpdateSchema } from '@/lib/profile/plus-schema';
import { MAX_MODULES } from '@/lib/profile/modules';
import { moduleSchema, withModule, type ProfileModule } from '@/lib/profile/modules-schema';
import { qrMatrix } from '@/lib/profile/qr';
import { ringSlugBase } from '@/lib/profile/webrings';

/**
 * Scope per docs/testing.md: only the parts that decide what untrusted input is
 * stored, what is stored about a visitor, or whether saved layout data survives
 * an edit.
 */

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

describe('pronunciation upload: container sniffing', () => {
  it('identifies the containers MediaRecorder produces', () => {
    expect(sniffAudioContainer(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe('webm');
    expect(sniffAudioContainer(bytes(0x4f, 0x67, 0x67, 0x53))).toBe('ogg');
    expect(sniffAudioContainer(bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70))).toBe('mp4');
  });

  it('refuses anything else, whatever the client claimed', () => {
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(sniffAudioContainer(html)).toBeNull();
    expect(sniffAudioContainer(svg)).toBeNull();
    expect(sniffAudioContainer(new Uint8Array(4))).toBeNull();
  });
});

describe('stamp limits', () => {
  const ok = { bytes: 4_000, mime: 'image/png', width: 88, height: 31 };

  it('accepts a classic 88x31 button and a small square', () => {
    expect(judgeStampImage(ok)).toBeNull();
    expect(judgeStampImage({ ...ok, width: 64, height: 64 })).toBeNull();
  });

  it('refuses oversize files, oversize dimensions and other formats', () => {
    expect(judgeStampImage({ ...ok, bytes: STAMP_MAX_UPLOAD_BYTES + 1 })).toBe('too-large');
    expect(judgeStampImage({ ...ok, width: STAMP_MAX_EDGE + 1 })).toBe('too-big-dimensions');
    expect(judgeStampImage({ ...ok, mime: 'image/svg+xml' })).toBe('format');
    expect(judgeStampImage({ ...ok, mime: null })).toBe('format');
    expect(judgeStampImage({ ...ok, bytes: 0 })).toBe('empty');
    expect(judgeStampImage({ ...ok, width: 4, height: 4 })).toBe('too-small');
  });
});

describe('visitor counter: what is stored about a visitor', () => {
  const day = '2026-10-12';

  it('is stable for the same visitor, profile and day (so a revisit dedupes)', () => {
    expect(visitorHash('ip:1.2.3.4|ua', 'p1', day)).toBe(visitorHash('ip:1.2.3.4|ua', 'p1', day));
  });

  it('cannot be joined across profiles or days', () => {
    const a = visitorHash('ip:1.2.3.4|ua', 'p1', day);
    expect(visitorHash('ip:1.2.3.4|ua', 'p2', day)).not.toBe(a);
    expect(visitorHash('ip:1.2.3.4|ua', 'p1', '2026-10-13')).not.toBe(a);
  });

  it('never contains the raw IP', () => {
    expect(visitorHash('ip:1.2.3.4|ua', 'p1', day)).not.toContain('1.2.3.4');
    expect(visitorHash('ip:1.2.3.4|ua', 'p1', day)).toHaveLength(32);
  });
});

describe('/now text', () => {
  it('greys out after exactly the stale window', () => {
    const now = Date.UTC(2026, 9, 12);
    const day = 24 * 60 * 60 * 1000;
    expect(nowIsStale(new Date(now - (NOW_STALE_DAYS - 1) * day), now)).toBe(false);
    expect(nowIsStale(new Date(now - (NOW_STALE_DAYS + 1) * day), now)).toBe(true);
    expect(nowIsStale(null, now)).toBe(false);
  });

  it('only ever links http(s) URLs', () => {
    const segs = splitNowText(
      'see https://example.com/a, and javascript:alert(1) or data:text/html,x',
    );
    const links = segs.filter((s) => s.type === 'link');
    expect(links).toEqual([
      { type: 'link', value: 'https://example.com/a', href: 'https://example.com/a' },
    ]);
    expect(segs.map((s) => s.value).join('')).toBe(
      'see https://example.com/a, and javascript:alert(1) or data:text/html,x',
    );
  });

  it('caps the length', () => {
    expect(plusUpdateSchema.safeParse({ nowText: 'x'.repeat(501) }).success).toBe(false);
    expect(plusUpdateSchema.safeParse({ nowText: 'x'.repeat(500) }).success).toBe(true);
  });
});

describe('timezone and pronouns validation', () => {
  it('accepts IANA zones and refuses everything else', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('<script>')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('rejects markup in pronouns', () => {
    expect(plusUpdateSchema.safeParse({ pronouns: 'she/her' }).success).toBe(true);
    expect(plusUpdateSchema.safeParse({ pronouns: '<b>x</b>' }).success).toBe(false);
  });
});

describe('withModule (saved showcase layouts survive settings toggles)', () => {
  const about: ProfileModule = { kind: 'about', config: { text: 'hello' } };

  it('appends once, keeps order and existing config, and removes cleanly', () => {
    const added = withModule([about], 'now', true);
    expect(added.map((m) => m.kind)).toEqual(['about', 'now']);
    expect(withModule(added, 'now', true)).toHaveLength(2);
    const removed = withModule(added, 'now', false);
    expect(removed).toEqual([about]);
  });

  it('never exceeds the cap', () => {
    const full = Array.from({ length: MAX_MODULES }, () => moduleSchema.parse({ kind: 'stats' }));
    expect(withModule(full, 'now', true)).toHaveLength(MAX_MODULES);
  });
});

describe('profile card QR', () => {
  it('encodes a profile URL as a square symbol with finder patterns', () => {
    const m = qrMatrix('https://rmhstudios.com/u/ana');
    expect(m.length).toBe(29); // version 3, error correction M
    expect(m.every((row) => row.length === m.length)).toBe(true);
    // The three 7x7 finder patterns: dark ring, light ring, dark 3x3 core.
    for (const [r, c] of [
      [0, 0],
      [0, m.length - 7],
      [m.length - 7, 0],
    ] as const) {
      expect(m[r]![c]).toBe(true);
      expect(m[r + 1]![c + 1]).toBe(false);
      expect(m[r + 3]![c + 3]).toBe(true);
      expect(m[r + 6]![c + 6]).toBe(true);
    }
  });
});

describe('webring slugs', () => {
  it('are lowercase ascii words', () => {
    expect(ringSlugBase('Pixel Artists!')).toBe('pixel-artists');
    expect(ringSlugBase('Café Racers')).toBe('cafe-racers');
    expect(ringSlugBase('日本語')).toBe('ring');
  });
});
