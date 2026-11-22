import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  activeSigningSecrets,
  signatureHeader,
  signWebhookPayload,
  verifyWebhookSignature,
} from '@/lib/webhooks/signature';

const body = '{"event":"ping"}';
const NOW = new Date('2026-11-22T12:00:00Z');
const ts = Math.floor(NOW.getTime() / 1000);

afterEach(() => vi.useRealTimers());

describe('signatureHeader', () => {
  it('carries one v1 signature for one secret, matching signWebhookPayload', () => {
    expect(signatureHeader(['whsec_new'], ts, body)).toBe(`t=${ts},v1=${signWebhookPayload('whsec_new', ts, body)}`);
  });

  it('carries both signatures, newest first, while two secrets are passed', () => {
    const header = signatureHeader(['whsec_new', 'whsec_old'], ts, body);
    expect(header).toBe(
      `t=${ts},v1=${signWebhookPayload('whsec_new', ts, body)},v1=${signWebhookPayload('whsec_old', ts, body)}`,
    );
  });
});

describe('activeSigningSecrets', () => {
  const endpoint = { secret: 'whsec_new', previousSecret: 'whsec_old' };

  it('includes the previous secret until its expiry', () => {
    const expires = new Date(NOW.getTime() + 60_000);
    expect(activeSigningSecrets({ ...endpoint, previousSecretExpiresAt: expires }, NOW)).toEqual([
      'whsec_new',
      'whsec_old',
    ]);
  });

  it('drops the previous secret at and after its expiry', () => {
    expect(activeSigningSecrets({ ...endpoint, previousSecretExpiresAt: NOW }, NOW)).toEqual(['whsec_new']);
    const past = new Date(NOW.getTime() - 1);
    expect(activeSigningSecrets({ ...endpoint, previousSecretExpiresAt: past }, NOW)).toEqual(['whsec_new']);
  });

  it('signs with the current secret alone when nothing was rotated', () => {
    expect(activeSigningSecrets({ secret: 'whsec_new' }, NOW)).toEqual(['whsec_new']);
    expect(
      activeSigningSecrets({ secret: 'whsec_new', previousSecret: null, previousSecretExpiresAt: null }, NOW),
    ).toEqual(['whsec_new']);
  });
});

describe('verifyWebhookSignature', () => {
  it('accepts a single-signature header from the secret that signed it', () => {
    vi.useFakeTimers({ now: NOW });
    expect(verifyWebhookSignature('whsec_a', signatureHeader(['whsec_a'], ts, body), body)).toBe(true);
  });

  it('accepts a dual-signature header from either the new or the old secret', () => {
    vi.useFakeTimers({ now: NOW });
    const header = signatureHeader(['whsec_new', 'whsec_old'], ts, body);
    expect(verifyWebhookSignature('whsec_new', header, body)).toBe(true);
    expect(verifyWebhookSignature('whsec_old', header, body)).toBe(true);
  });

  it('rejects a secret that signed none of the parts, a tampered body and a stale timestamp', () => {
    vi.useFakeTimers({ now: NOW });
    const header = signatureHeader(['whsec_new', 'whsec_old'], ts, body);
    expect(verifyWebhookSignature('whsec_other', header, body)).toBe(false);
    expect(verifyWebhookSignature('whsec_new', header, `${body} `)).toBe(false);
    const stale = signatureHeader(['whsec_new'], ts - 3600, body);
    expect(verifyWebhookSignature('whsec_new', stale, body)).toBe(false);
  });

  it('rejects a header without a timestamp or without any signature', () => {
    vi.useFakeTimers({ now: NOW });
    expect(verifyWebhookSignature('whsec_a', `v1=${signWebhookPayload('whsec_a', ts, body)}`, body)).toBe(false);
    expect(verifyWebhookSignature('whsec_a', `t=${ts}`, body)).toBe(false);
    expect(verifyWebhookSignature('whsec_a', '', body)).toBe(false);
  });
});
