import { describe, expect, it } from 'vitest';
import { signNetTicket, verifyNetTicketSignature } from '../net-ticket.server';

// The hub accepts a ticket through verifyNetTicketSignature plus its ticket book (expiry is the
// book's decision: server/rmhos-net/__tests__/tickets.test.ts), so that is what is tested here.
describe('net ticket', () => {
  const t = signNetTicket('user_1', 's3cret', 1_000);

  it('verifies the signature and reports the expiry', () => {
    expect(verifyNetTicketSignature(t, 's3cret')).toEqual({
      ok: true,
      userId: 'user_1',
      expiry: 1_000 + 60_000,
    });
  });
  it('rejects a different secret', () => {
    expect(verifyNetTicketSignature(t, 'other')).toEqual({ ok: false, reason: 'bad_signature' });
  });
  it('rejects a swapped user id', () => {
    const forged = t.replace(/^[^.]+/, Buffer.from('user_2').toString('base64url'));
    expect(verifyNetTicketSignature(forged, 's3cret')).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });
  it('rejects an extended expiry with the old signature', () => {
    const [id, , sig] = t.split('.');
    expect(verifyNetTicketSignature(`${id}.${1_000 + 600_000}.${sig}`, 's3cret')).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });
  it('throws on an empty secret', () => {
    expect(() => signNetTicket('user_1', '', 1_000)).toThrow('rmhos net ticket secret is empty');
    expect(() => verifyNetTicketSignature(t, '')).toThrow('rmhos net ticket secret is empty');
  });
  it('rejects garbage', () => {
    expect(verifyNetTicketSignature('garbage', 's3cret')).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyNetTicketSignature('a.notanumber.c', 's3cret')).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifyNetTicketSignature('x.y', 's3cret')).toEqual({ ok: false, reason: 'malformed' });
  });
});
