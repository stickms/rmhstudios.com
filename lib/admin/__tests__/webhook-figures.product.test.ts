/**
 * s10-15 pure logic: the failure rate and the median in the 24-hour figures, an endpoint's status, and the URL
 * redaction every admin path relies on (path tokens, query keys, userinfo and fragments removed; an IDN host kept).
 */
import { describe, expect, it } from 'vitest';
import {
  adminErrorText,
  decodeCursor,
  encodeCursor,
  failureRate,
  figuresFromRow,
  redactDeliveryError,
  redactWebhookUrl,
  webhookHost,
  webhookStatus,
} from '@/lib/admin/webhooks';

describe('figures', () => {
  it('the failure rate is failed over settled, and pending deliveries count for neither', () => {
    expect(failureRate(7, 3)).toBe(0.3);
    expect(failureRate(0, 4)).toBe(1);
    expect(failureRate(5, 0)).toBe(0);
    expect(failureRate(0, 0)).toBeNull();
  });

  it('turns the grouped query row into numbers: bigint counts, a rounded median, nulls kept', () => {
    expect(figuresFromRow({ total: 12n, delivered: 8n, failed: 2n, medianMs: 141.6 })).toEqual({
      deliveries: 12,
      failed: 2,
      failureRate: 0.2,
      medianMs: 142,
    });
    expect(figuresFromRow({ total: '3', delivered: '0', failed: '0', medianMs: null })).toEqual({
      deliveries: 3,
      failed: 0,
      failureRate: null,
      medianMs: null,
    });
    expect(figuresFromRow({ total: 1, delivered: 1, failed: 0, medianMs: '250' }).medianMs).toBe(250);
  });
});

describe('status', () => {
  const at = new Date('2026-12-01T00:00:00Z');
  it('tells admin-disabled, auto-disabled, owner-disabled, failing and active apart', () => {
    expect(webhookStatus({ enabled: false, failureCount: 20, adminDisabledAt: at })).toBe('admin_disabled');
    expect(webhookStatus({ enabled: false, failureCount: 20, adminDisabledAt: null })).toBe('auto_disabled');
    expect(webhookStatus({ enabled: false, failureCount: 2, adminDisabledAt: null })).toBe('disabled');
    expect(webhookStatus({ enabled: false, failureCount: 0, adminDisabledAt: null })).toBe('disabled');
    expect(webhookStatus({ enabled: true, failureCount: 1, adminDisabledAt: null })).toBe('failing');
    expect(webhookStatus({ enabled: true, failureCount: 0, adminDisabledAt: null })).toBe('active');
  });
});

describe('redactWebhookUrl', () => {
  it('keeps the scheme, host and first path segment, and marks what it cut', () => {
    expect(redactWebhookUrl('https://hooks.example.com/services/T000/B000/XXXX')).toBe(
      'https://hooks.example.com/services…',
    );
  });

  it('drops a path token past the first segment, a query string and a fragment', () => {
    expect(redactWebhookUrl('https://example.com/hook?key=abc123#frag')).toBe('https://example.com/hook…');
    expect(redactWebhookUrl('https://example.com/?token=abc')).toBe('https://example.com…');
    expect(redactWebhookUrl('https://example.com/a/b/c/d')).not.toContain('/b');
  });

  it('drops userinfo', () => {
    const out = redactWebhookUrl('https://user:p4ss@example.com/hook');
    expect(out).toBe('https://example.com/hook…');
    expect(out).not.toContain('p4ss');
    expect(out).not.toContain('@');
  });

  it('adds no ellipsis when nothing was cut', () => {
    expect(redactWebhookUrl('https://example.com/hook')).toBe('https://example.com/hook');
    expect(redactWebhookUrl('https://example.com')).toBe('https://example.com');
    expect(redactWebhookUrl('https://example.com/hook/')).toBe('https://example.com/hook');
  });

  it('keeps an IDN host and a port, lower-cased', () => {
    expect(redactWebhookUrl('https://Bücher.Example/hook/secret')).toBe('https://bücher.example/hook…');
    expect(redactWebhookUrl('https://example.com:8443/hook/secret')).toBe('https://example.com:8443/hook…');
    expect(webhookHost('https://Bücher.Example/hook/secret')).toBe('bücher.example');
  });

  it('answers null for text that is not an http(s) URL', () => {
    expect(redactWebhookUrl('not a url')).toBeNull();
    expect(redactWebhookUrl('ftp://example.com/x')).toBeNull();
    expect(webhookHost('')).toBeNull();
  });
});

describe('redactDeliveryError', () => {
  const url = 'https://hooks.example.com/services/T0KEN-abc/more?key=QKEY123&x=1';

  it('removes the full URL, its path and its query wherever they appear', () => {
    const out =
      redactDeliveryError(`POST ${url} failed; path /services/T0KEN-abc/more; query key=QKEY123&x=1`, url) ?? '';
    expect(out).not.toContain('T0KEN');
    expect(out).not.toContain('QKEY123');
    expect(out).not.toContain('/more');
    expect(out).toContain('https://hooks.example.com/services…');
  });

  it('reduces any other URL in the text the same way (a redirect target)', () => {
    const out = redactDeliveryError('redirected to https://other.example/a/SECRETPART?k=v', url) ?? '';
    expect(out).toBe('redirected to https://other.example/a…');
  });

  it('leaves text without the URL alone, and keeps null', () => {
    expect(redactDeliveryError('HTTP 500', url)).toBe('HTTP 500');
    expect(redactDeliveryError(null, url)).toBeNull();
  });

  it('redacts before it truncates, so a token cut by the limit cannot survive', () => {
    const long = `${'x'.repeat(190)}${url}`;
    const out = adminErrorText(long, url) ?? '';
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).not.toContain('T0KEN');
    expect(out).not.toContain('QKEY');
    // The redacted text is cut, never the other way round: a raw cut at 200 would have left "https://hooks.example.com/ser".
    expect(adminErrorText('y'.repeat(300), url)).toHaveLength(200);
  });
});

describe('cursor', () => {
  it('round-trips and rejects what it did not issue', () => {
    const c = encodeCursor({ createdAt: new Date(1_700_000_000_000), id: 'abc123' });
    expect(decodeCursor(c)).toEqual({ at: new Date(1_700_000_000_000), id: 'abc123' });
    expect(decodeCursor(undefined)).toBeUndefined();
    expect(decodeCursor('x_y_z')).toBeNull();
    expect(decodeCursor('12')).toBeNull();
  });
});

describe('token-shaped text', () => {
  it('a token in the first path segment is dropped, a word stays', () => {
    expect(redactWebhookUrl('https://hooks.example.com/services/T0/B1/x')).toBe('https://hooks.example.com/services…');
    expect(redactWebhookUrl('https://hooks.example.com/a1b2c3d4e5f6a7b8c9d0')).toBe('https://hooks.example.com/…');
  });

  it('an error that echoes only a path segment, a query value or a bearer value loses it', () => {
    const url = 'https://h.example.com/services/Tabc12345XYZ?key=sekret99';
    const out = redactDeliveryError('bad Tabc12345XYZ then sekret99 and Bearer abcdef123456', url) ?? '';
    expect(out).not.toMatch(/Tabc12345XYZ|sekret99|abcdef123456/);
  });
});
