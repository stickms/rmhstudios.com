/**
 * Webhook URL validation, masking, and the reminder-due decision.
 *
 * In the suite because both halves are security- or correctness-critical in a
 * way that is invisible at runtime:
 *
 *  * `validateWebhookUrl` is the **only** thing standing between a settings
 *    field and an arbitrary server-side POST. A hole in it is an SSRF, and the
 *    interesting cases are the ones that *look* like Discord URLs.
 *  * `maskWebhookUrl` decides what leaves the server. A bug that returns too
 *    much leaks a bearer credential for the group's Discord channel to anyone
 *    holding the page's link.
 *  * `isReminderDue` decides whether a scheduled job posts to that channel. It
 *    runs six times an hour against real dates; four boundary conditions are
 *    far easier to be sure of here than in production.
 */

import { describe, it, expect } from 'vitest';
import {
  buildReminderPayload,
  maskWebhookUrl,
  validateWebhookUrl,
  type ReminderSession,
} from './discord.server';
import { isReminderDue, reminderInstantFor, REMINDER_GRACE_HOURS } from './reminders.server';

const GOOD = 'https://discord.com/api/webhooks/123456789012345678/abcDEF-ghiJKL_mnoPQR';

describe('validateWebhookUrl', () => {
  it('accepts a real Discord webhook URL', () => {
    const result = validateWebhookUrl(GOOD);
    expect(result.ok).toBe(true);
    expect(result.url).toBe(GOOD);
  });

  it('accepts the legacy and release-channel hosts', () => {
    for (const host of ['discordapp.com', 'ptb.discord.com', 'canary.discord.com']) {
      const url = GOOD.replace('discord.com', host);
      expect(validateWebhookUrl(url).ok, host).toBe(true);
    }
  });

  it('accepts a versioned API path', () => {
    expect(validateWebhookUrl(GOOD.replace('/api/', '/api/v10/')).ok).toBe(true);
  });

  it('strips query and fragment so the stored URL is exactly what we POST to', () => {
    expect(validateWebhookUrl(`${GOOD}?wait=true#x`).url).toBe(GOOD);
    expect(validateWebhookUrl(`${GOOD}/`).url).toBe(GOOD);
  });

  /**
   * The whole point of the module. Each of these is a URL someone could
   * plausibly paste or plant, and every one must be refused — the check is on
   * the PARSED hostname, so none of the substring tricks work.
   */
  it.each([
    ['a look-alike domain', 'https://discord.com.evil.test/api/webhooks/1/tok'],
    ['a subdomain of an attacker domain', 'https://evil.test/discord.com/api/webhooks/1/tok'],
    ['userinfo smuggling the host', 'https://discord.com@evil.test/api/webhooks/1/tok'],
    ['plain http', 'http://discord.com/api/webhooks/123/tok'],
    ['localhost', 'https://127.0.0.1/api/webhooks/123/tok'],
    ['link-local metadata', 'https://169.254.169.254/api/webhooks/123/tok'],
    ['a file URL', 'file:///etc/passwd'],
    ['a channel link, not a webhook', 'https://discord.com/channels/123/456'],
    ['the right host but wrong path', 'https://discord.com/api/users/@me'],
    ['not a URL at all', 'webhook please'],
    ['empty', ''],
  ])('rejects %s', (_label, url) => {
    expect(validateWebhookUrl(url).ok).toBe(false);
  });

  it('always explains itself when it refuses', () => {
    for (const url of ['', 'nope', 'https://evil.test/x', 'https://discord.com/channels/1/2']) {
      const result = validateWebhookUrl(url);
      expect(result.ok).toBe(false);
      expect(result.error, url).toBeTruthy();
    }
  });

  it('refuses an absurdly long string before parsing it', () => {
    expect(validateWebhookUrl(`${GOOD}${'a'.repeat(600)}`).ok).toBe(false);
  });
});

describe('maskWebhookUrl', () => {
  it('never returns the token', () => {
    const masked = maskWebhookUrl(GOOD);
    expect(masked).toBeTruthy();
    expect(masked).not.toContain('abcDEF-ghiJKL_mnoPQR');
    // The last four are shown so the group can tell two webhooks apart.
    expect(masked).toContain('PQR');
    expect(masked).toContain('123456789012345678');
  });

  it('returns null for no webhook', () => {
    expect(maskWebhookUrl(null)).toBeNull();
    expect(maskWebhookUrl(undefined)).toBeNull();
    expect(maskWebhookUrl('')).toBeNull();
  });

  it('degrades to a placeholder rather than echoing an unparseable value', () => {
    expect(maskWebhookUrl('total nonsense')).toBe('a webhook');
  });
});

describe('reminderInstantFor', () => {
  const settings = { reminderMinutes: 9 * 60, reminderTimeZone: 'America/New_York' };

  it('lands at the configured local time on the session s own date', () => {
    // 8pm ET on Wed 2026-08-12 → the reminder is 9am ET that same morning.
    const session = new Date('2026-08-13T00:00:00Z');
    expect(reminderInstantFor(session, settings).toISOString()).toBe('2026-08-12T13:00:00.000Z');
  });

  it('tracks DST, so 9am is 9am in December too', () => {
    const session = new Date('2026-12-17T01:00:00Z'); // 8pm ET Wed 12-16
    expect(reminderInstantFor(session, settings).toISOString()).toBe('2026-12-16T14:00:00.000Z');
  });

  it('uses the session s LOCAL date, not the UTC one', () => {
    // The session is 2026-08-13 in UTC but 2026-08-12 in New York; the morning
    // reminder belongs to the 12th, and getting this wrong sends it a day early.
    const session = new Date('2026-08-13T00:00:00Z');
    const instant = reminderInstantFor(session, settings);
    expect(instant.toISOString().slice(0, 10)).toBe('2026-08-12');
  });
});

describe('isReminderDue', () => {
  const settings = { reminderMinutes: 9 * 60, reminderTimeZone: 'America/New_York' };
  const base = {
    startsAt: new Date('2026-08-13T00:00:00Z'), // 8pm ET on the 12th
    endsAt: new Date('2026-08-13T04:00:00Z'),
    canceledAt: null as Date | null,
    reminderSentAt: null as Date | null,
  };
  const due = new Date('2026-08-12T13:00:00Z'); // 9am ET

  it('is due exactly at the reminder time', () => {
    expect(isReminderDue(base, settings, due)).toBe(true);
  });

  it('is not due a minute early', () => {
    expect(isReminderDue(base, settings, new Date(due.getTime() - 60_000))).toBe(false);
  });

  it('is still due a few hours late (a worker that was down catches up)', () => {
    expect(isReminderDue(base, settings, new Date(due.getTime() + 3_600_000))).toBe(true);
  });

  it('gives up past the grace window rather than posting a stale reminder', () => {
    const past = new Date(due.getTime() + (REMINDER_GRACE_HOURS + 1) * 3_600_000);
    expect(isReminderDue(base, settings, past)).toBe(false);
  });

  it('never fires for a session that has already started', () => {
    // Enabling reminders at 9pm must not announce the game everyone is at.
    const started = new Date('2026-08-13T00:30:00Z');
    expect(isReminderDue(base, settings, started)).toBe(false);
  });

  it('never fires twice', () => {
    expect(isReminderDue({ ...base, reminderSentAt: due }, settings, due)).toBe(false);
  });

  it('never fires for a cancelled session', () => {
    expect(isReminderDue({ ...base, canceledAt: new Date() }, settings, due)).toBe(false);
  });

  it('follows the configured zone', () => {
    // 9am Pacific is three hours later in UTC than 9am Eastern.
    const pacific = { reminderMinutes: 9 * 60, reminderTimeZone: 'America/Los_Angeles' };
    expect(isReminderDue(base, pacific, due)).toBe(false);
    expect(isReminderDue(base, pacific, new Date('2026-08-12T16:00:00Z'))).toBe(true);
  });
});

describe('buildReminderPayload', () => {
  const session: ReminderSession = {
    id: 'abc',
    title: 'Pathfinder 2e session',
    notes: 'bring backup characters',
    location: 'https://foundry.example.test',
    startsAt: new Date('2026-08-13T00:00:00Z'),
    endsAt: new Date('2026-08-13T04:00:00Z'),
    responses: [
      { status: 'GOING', name: 'Ada', note: null },
      { status: 'TENTATIVE', name: 'Bo', note: 'might be late' },
    ],
  };

  it('suppresses mentions so a session note cannot ping the server', () => {
    // The title and notes are user-authored and this posts from a cron nobody
    // is watching; `@everyone` in a note must be inert.
    const payload = buildReminderPayload(
      { ...session, notes: 'reminder @everyone bring dice' },
      'https://example.test/pf2ecal',
    ) as { allowed_mentions: { parse: string[] } };
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });

  it('carries both zones and a Discord timestamp', () => {
    const payload = buildReminderPayload(session, 'https://example.test/pf2ecal') as {
      embeds: Array<{ fields: Array<{ name: string; value: string }> }>;
    };
    const when = payload.embeds[0].fields.find((f) => f.name === 'When')!;
    expect(when.value).toContain('8:00 PM Eastern');
    expect(when.value).toContain('7:00 PM CDT');
    // `<t:…:F>` renders in each reader's own timezone — the one conversion
    // Discord will do per-person.
    expect(when.value).toMatch(/<t:\d+:F>/);
  });

  it('counts each availability bucket', () => {
    const payload = buildReminderPayload(session, 'https://example.test/pf2ecal') as {
      embeds: Array<{ fields: Array<{ name: string; value: string }> }>;
    };
    const names = payload.embeds[0].fields.map((f) => f.name);
    expect(names).toContain('In (1)');
    expect(names).toContain('Maybe (1)');
    expect(names).toContain('Out (0)');
  });

  it('says so when nobody has replied — the reason the reminder exists', () => {
    const payload = buildReminderPayload(
      { ...session, responses: [] },
      'https://example.test/pf2ecal',
    ) as { embeds: Array<{ fields: Array<{ name: string; value: string }> }> };
    expect(payload.embeds[0].fields.some((f) => f.value.includes('Nobody has answered'))).toBe(true);
  });
});
