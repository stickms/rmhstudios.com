import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * B11 — new-device sign-in alerts.
 *
 * The fingerprint table is the part that decides whether this feature is useful
 * or actively harmful. Every entry below is a real User-Agent, because the two
 * ways the table breaks are both invisible in a synthetic string:
 *
 *  - **Substring shadowing.** Edge ships `Chrome/` and `Safari/` in its UA,
 *    Chrome ships `Safari/`, every iOS browser ships `Safari/`, Android ships
 *    `Linux`, ChromeOS ships `X11`. Order the tables wrong and a third of real
 *    traffic gets relabelled — which means real users get "new device" alerts
 *    for the browser they have used for a year, and learn to ignore them.
 *  - **Hostile input.** The UA is an attacker-controlled header that lands in a
 *    varchar(80) column and an HTML email. Garbage, control characters and 4 KB
 *    of binary must produce a short printable label, never an exception on the
 *    sign-in path.
 */

const prismaMock = vi.hoisted(() => ({
  session: { findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const dispatchMock = vi.hoisted(() => ({ dispatch: vi.fn().mockResolvedValue(undefined) }));
const emailMock = vi.hoisted(() => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/notify/dispatch.server', () => ({ dispatch: dispatchMock.dispatch }));
vi.mock('@/lib/email/send.server', () => ({ sendEmail: emailMock.sendEmail }));

import {
  deviceFingerprint,
  deviceFingerprintFromRequest,
  onSessionCreated,
  UNKNOWN_DEVICE,
  SESSION_ALERT_REVOKE_PARAM,
} from '@/lib/auth/session-alert.server';

/* -------------------------------------------------------------------------- */
/* The table                                                                   */
/* -------------------------------------------------------------------------- */

const REAL_USER_AGENTS: ReadonlyArray<readonly [string, string, string]> = [
  [
    'Chrome on macOS',
    'Chrome on macOS',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  ],
  [
    'Chrome on Windows',
    'Chrome on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  ],
  [
    'Safari on macOS (no Chrome token)',
    'Safari on macOS',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  ],
  [
    'Safari on iPhone',
    'Safari on iPhone',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ],
  [
    'Safari on iPad — iPadOS still says Mac OS X',
    'Safari on iPad',
    'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  ],
  [
    'Edge on Windows — its UA contains both Chrome/ and Safari/',
    'Edge on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.3485.66',
  ],
  [
    'Firefox on Windows',
    'Firefox on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  ],
  [
    'Firefox on iOS reports FxiOS, not Firefox',
    'Firefox on iPhone',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/128.0 Mobile/15E148 Safari/605.1.15',
  ],
  [
    'Chrome on iOS reports CriOS, not Chrome',
    'Chrome on iPhone',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  ],
  [
    'Chrome on Android — the UA also says Linux',
    'Chrome on Android',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  ],
  [
    'Samsung Internet is not plain Chrome',
    'Samsung Internet on Android',
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  ],
  [
    'Opera ships OPR/, after Chrome/',
    'Opera on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 OPR/124.0.0.0',
  ],
  [
    'ChromeOS reports CrOS, not Linux',
    'Chrome on ChromeOS',
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  ],
  [
    'Firefox on Linux',
    'Firefox on Linux',
    'Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0',
  ],
];

describe('deviceFingerprint — real User-Agents', () => {
  for (const [name, expected, ua] of REAL_USER_AGENTS) {
    it(`labels ${name}`, () => {
      expect(deviceFingerprint(ua)).toBe(expected);
    });
  }

  it('stays inside the varchar(80) column for every case', () => {
    for (const [, , ua] of REAL_USER_AGENTS) {
      expect(deviceFingerprint(ua).length).toBeLessThanOrEqual(80);
    }
  });

  it('is deliberately low-entropy — a browser VERSION bump is the same device', () => {
    const v140 =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
    const v141 =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.55 Safari/537.36';
    // If this ever fails, every user gets an alert on every Chrome auto-update
    // and stops reading them — the alert becomes worse than nothing.
    expect(deviceFingerprint(v140)).toBe(deviceFingerprint(v141));
  });
});

describe('deviceFingerprint — hostile and empty input', () => {
  const GARBAGE: ReadonlyArray<[string, unknown]> = [
    ['empty string', ''],
    ['whitespace only', '   \t  '],
    ['null', null],
    ['undefined', undefined],
    ['a number (wrong type at runtime)', 12345],
    ['an object', { toString: () => 'Chrome/1' }],
    ['control characters', '\u0000\u0001\u0002\u001f\u007f'],
    ['4 KB of binary', String.fromCharCode(...Array.from({ length: 512 }, (_, i) => i % 256))],
    ['a fake sentence', 'i am definitely a browser, please believe me'],
  ];

  for (const [name, input] of GARBAGE) {
    it(`returns a stable label for ${name}, never throws`, () => {
      const fp = deviceFingerprint(input as string);
      expect(typeof fp).toBe('string');
      expect(fp.length).toBeGreaterThan(0);
      expect(fp.length).toBeLessThanOrEqual(80);
    });
  }

  it('returns exactly "Unknown device" when the UA says nothing', () => {
    expect(deviceFingerprint('')).toBe(UNKNOWN_DEVICE);
    expect(deviceFingerprint(null)).toBe(UNKNOWN_DEVICE);
    expect(deviceFingerprint(undefined)).toBe(UNKNOWN_DEVICE);
    expect(deviceFingerprint('i am definitely a browser')).toBe(UNKNOWN_DEVICE);
  });

  it('falls back to the platform alone when the browser is unrecognised', () => {
    expect(deviceFingerprint('SomeCrawler/2.0 (Windows NT 10.0)')).toBe('Windows');
  });

  it('reads the header off a Request', () => {
    const req = new Request('https://rmhstudios.com/', {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Firefox/130.0' },
    });
    expect(deviceFingerprintFromRequest(req)).toBe('Firefox on Windows');
    expect(deviceFingerprintFromRequest(new Request('https://rmhstudios.com/'))).toBe(
      UNKNOWN_DEVICE,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Alert behaviour                                                             */
/* -------------------------------------------------------------------------- */

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

function signInRequest(ua = CHROME_MAC): Request {
  return new Request('https://rmhstudios.com/api/auth/sign-in', {
    headers: { 'user-agent': ua, 'cf-connecting-ip': '203.0.113.7' },
  });
}

const OLD_ACCOUNT = { email: 'owner@example.com', createdAt: new Date('2024-01-01T00:00:00Z') };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.session.count.mockResolvedValue(3);
  prismaMock.user.findUnique.mockResolvedValue(OLD_ACCOUNT);
});

describe('onSessionCreated', () => {
  it('alerts on an unfamiliar device, bypassing quiet hours', async () => {
    prismaMock.session.findFirst.mockResolvedValue(null);

    const res = await onSessionCreated({ id: 's1', userId: 'u1' }, signInRequest());

    expect(res).toMatchObject({ deviceFp: 'Chrome on macOS', known: false, alerted: true });
    expect(dispatchMock.dispatch).toHaveBeenCalledTimes(1);
    const dispatched = dispatchMock.dispatch.mock.calls[0][0];
    // Critical is the whole point: an unrecognised sign-in held until 07:00 is
    // eight hours of someone else in the account.
    expect(dispatched.urgency).toBe('critical');
    expect(dispatched.category).toBe('system');
    expect(dispatched.link).toContain(`${SESSION_ALERT_REVOKE_PARAM}=s1`);
    expect(emailMock.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('stamps deviceFp + a HASHED ip, never the raw address', async () => {
    prismaMock.session.findFirst.mockResolvedValue(null);
    await onSessionCreated({ id: 's1', userId: 'u1' }, signInRequest());

    const stamp = prismaMock.session.updateMany.mock.calls.at(-1)?.[0];
    expect(stamp.data.deviceFp).toBe('Chrome on macOS');
    expect(stamp.data.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stamp)).not.toContain('203.0.113.7');
    // alertedAt is what makes "at most once per device" hold.
    expect(stamp.data.alertedAt).toBeInstanceOf(Date);
  });

  it('stays silent for a device the account has used before', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ id: 'older-session' });

    const res = await onSessionCreated({ id: 's2', userId: 'u1' }, signInRequest());

    expect(res).toMatchObject({ known: true, alerted: false });
    expect(dispatchMock.dispatch).not.toHaveBeenCalled();
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
    // Still recorded, so the session list can name the device.
    expect(prismaMock.session.updateMany.mock.calls[0][0].data.alertedAt).toBeUndefined();
  });

  it('excludes the session being created from the "seen before" lookup', async () => {
    prismaMock.session.findFirst.mockResolvedValue(null);
    await onSessionCreated({ id: 's1', userId: 'u1' }, signInRequest());
    // Without this, every session matches itself and no alert ever fires.
    expect(prismaMock.session.findFirst.mock.calls[0][0].where.id).toEqual({ not: 's1' });
  });

  it('does not alert on the sign-up itself', async () => {
    prismaMock.session.findFirst.mockResolvedValue(null);
    prismaMock.session.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue({
      email: 'new@example.com',
      createdAt: new Date(),
    });

    const res = await onSessionCreated({ id: 's1', userId: 'u1' }, signInRequest());

    expect(res.alerted).toBe(false);
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });

  it('never rejects — a broken alert must not break sign-in', async () => {
    prismaMock.session.findFirst.mockRejectedValue(new Error('db down'));
    await expect(
      onSessionCreated({ id: 's1', userId: 'u1' }, signInRequest()),
    ).resolves.toMatchObject({ alerted: false });
  });
});
