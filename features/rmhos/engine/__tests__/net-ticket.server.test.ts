import { describe, expect, it } from 'vitest';
import { signNetTicket, verifyNetTicket } from '../net-ticket.server';

describe('net ticket', () => {
  const t = signNetTicket('user_1', 's3cret', 1_000);

  it('verifies within the ttl', () => {
    expect(verifyNetTicket(t, 's3cret', 1_000 + 59_999)).toEqual({
      ok: true,
      userId: 'user_1',
    });
  });
  it('expires after the ttl', () => {
    expect(verifyNetTicket(t, 's3cret', 1_000 + 60_001)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
  it('rejects a different secret', () => {
    expect(verifyNetTicket(t, 'other', 1_000)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });
  it('rejects a swapped user id', () => {
    const forged = t.replace(/^[^.]+/, Buffer.from('user_2').toString('base64url'));
    expect(verifyNetTicket(forged, 's3cret', 1_000)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });
  it('rejects an extended expiry with the old signature', () => {
    const [id, , sig] = t.split('.');
    expect(verifyNetTicket(`${id}.${1_000 + 600_000}.${sig}`, 's3cret', 1_000)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });
  it('throws on an empty secret', () => {
    expect(() => signNetTicket('user_1', '', 1_000)).toThrow('rmhos net ticket secret is empty');
    expect(() => verifyNetTicket(t, '', 1_000)).toThrow('rmhos net ticket secret is empty');
  });
  it('rejects garbage', () => {
    expect(verifyNetTicket('garbage', 's3cret')).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifyNetTicket('a.notanumber.c', 's3cret')).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});
