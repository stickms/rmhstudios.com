/**
 * Admin email campaigns and email preferences: the parts that decide who gets
 * mail (consent) and what an admin's text can do inside an email (injection).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { audienceWhere, preferenceWhere } from '@/lib/email/audience';
import { renderCampaignEmail } from '@/lib/email/campaign-render';
import { EMAIL_DEFAULTS, resolveEmailPrefs } from '@/lib/email/preferences';
import { audienceSchema } from '@/lib/email/campaign-schema';
import { signUnsubToken, verifyUnsubToken } from '@/lib/email/unsubscribe';

const NOW = new Date('2026-11-17T12:00:00Z');

describe('email preference defaults', () => {
  it('turns the important mail on and the optional mail off', () => {
    expect(EMAIL_DEFAULTS).toEqual({
      security: true,
      announcements: true,
      product: false,
      digest: false,
    });
  });

  it('reads a missing row as the defaults and a stored choice over them', () => {
    expect(resolveEmailPrefs(null)).toEqual(EMAIL_DEFAULTS);
    expect(resolveEmailPrefs({ emailSecurity: false, emailProduct: true })).toEqual({
      security: false,
      announcements: true,
      product: true,
      digest: false,
    });
  });
});

describe('audienceWhere', () => {
  const floor = (where: ReturnType<typeof audienceWhere>) => JSON.stringify(where);

  it('never includes bots, missing or placeholder addresses, or banned accounts', () => {
    const where = floor(audienceWhere({ mode: 'all' }, { now: NOW }));
    expect(where).toContain('"isBot":false');
    expect(where).toContain('"email":{"not":null}');
    expect(where).toContain('.placeholder.invalid');
    expect(where).toContain('"bannedUntil":null');
  });

  it('applies the same floor to a manual selection', () => {
    const where = audienceWhere({ mode: 'manual', userIds: ['a', 'b', 'a'] }, { now: NOW });
    const json = floor(where);
    expect(json).toContain('"isBot":false');
    expect(json).toContain('"bannedUntil":null');
    expect(json).toContain('"id":{"in":["a","b"]}');
  });

  it('includes banned accounts only when asked', () => {
    const where = floor(
      audienceWhere({ mode: 'filter', filters: { includeBanned: true } }, { now: NOW }),
    );
    expect(where).not.toContain('bannedUntil');
  });

  it('maps filters to conditions', () => {
    const json = floor(
      audienceWhere(
        {
          mode: 'filter',
          filters: {
            activeWithinDays: 7,
            joinedBefore: '2026-01-31',
            role: 'non-admins',
            membership: 'members',
            minFollowers: 10,
            emailDomain: 'example.com',
          },
        },
        { now: NOW, memberIds: ['m1'] },
      ),
    );
    expect(json).toContain('"lastSeenAt":{"gte":"2026-11-10T12:00:00.000Z"}');
    // joinedBefore is inclusive of the whole day.
    expect(json).toContain('"createdAt":{"lt":"2026-02-01T00:00:00.000Z"}');
    expect(json).toContain('"isAdmin":false');
    expect(json).toContain('"id":{"in":["m1"]}');
    expect(json).toContain('"followerCount":{"gte":10}');
    expect(json).toContain('"endsWith":"@example.com"');
  });

  it('rejects unknown filters and an empty manual list', () => {
    expect(audienceSchema.safeParse({ mode: 'filter', filters: { isBot: true } }).success).toBe(false);
    expect(audienceSchema.safeParse({ mode: 'manual', userIds: [] }).success).toBe(false);
  });
});

describe('preferenceWhere', () => {
  it('leaves out people who turned off an on-by-default list', () => {
    expect(preferenceWhere('announcements')).toEqual({
      NOT: { notificationPreference: { is: { emailAnnouncements: false } } },
    });
  });

  it('includes only people who turned on an off-by-default list', () => {
    expect(preferenceWhere('product')).toEqual({
      notificationPreference: { is: { emailProduct: true } },
    });
  });

  it('ignores preferences only for a required service notice', () => {
    expect(preferenceWhere('service')).toBeNull();
  });
});

describe('list-bound unsubscribe tokens', () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET ||= 'test-secret-for-unsubscribe-tokens';
  });

  it('a token only unsubscribes from the list it was minted for', () => {
    const announcements = signUnsubToken('user-1', undefined, 'announcements');
    expect(verifyUnsubToken(announcements, 'announcements')).toBe('user-1');
    expect(verifyUnsubToken(announcements, 'product')).toBeNull();
    expect(verifyUnsubToken(announcements)).toBeNull();
  });

  it('digest tokens keep working with no list named', () => {
    const digest = signUnsubToken('user-1');
    expect(verifyUnsubToken(digest)).toBe('user-1');
    expect(verifyUnsubToken(digest, 'announcements')).toBeNull();
  });
});

describe('renderCampaignEmail', () => {
  const base = {
    reason: 'Because.',
    settingsUrl: 'https://rmhstudios.com/settings/notifications',
  };

  it('escapes the admin text and links bare URLs', () => {
    const out = renderCampaignEmail({
      ...base,
      subject: 'Hi <b>{{name}}</b>',
      body: '<script>alert(1)</script>\n\nSee https://rmhstudios.com/news?a=1&b=2.',
      name: 'Ada "Lovelace"',
      unsubscribeUrl: 'https://rmhstudios.com/api/email/unsubscribe?token=x&list=announcements',
    });
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('Hi &lt;b&gt;Ada &quot;Lovelace&quot;&lt;/b&gt;');
    expect(out.html).toContain('href="https://rmhstudios.com/news?a=1&amp;b=2"');
    // Trailing punctuation stays outside the link.
    expect(out.html).toContain('</a>.');
    expect(out.html).toContain('Unsubscribe');
    expect(out.text).toContain('Unsubscribe: https://rmhstudios.com/api/email/unsubscribe');
  });

  it('carries no unsubscribe link on a required notice', () => {
    const out = renderCampaignEmail({ ...base, subject: 'S', body: 'B', unsubscribeUrl: null });
    expect(out.html).not.toContain('Unsubscribe');
    expect(out.text).not.toContain('Unsubscribe');
  });

  it('keeps the subject on one line', () => {
    const out = renderCampaignEmail({
      ...base,
      subject: 'Line one\r\nBcc: someone',
      body: 'B',
      unsubscribeUrl: null,
    });
    expect(out.subject).toBe('Line one Bcc: someone');
  });
});
