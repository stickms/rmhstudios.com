import { describe, expect, it, vi } from 'vitest';
import {
  buildAuthUrl,
  safeCallback,
  steamPlaceholderEmail,
  verifyAssertion,
} from '../steam-openid';

const RETURN_TO = 'https://rmhstudios.com/api/auth/steam/callback?s=abc';
const ID = '76561198000000000';

function assertion(over: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${ID}`,
    'openid.return_to': RETURN_TO,
    'openid.response_nonce': '2026-10-27T00:00:00Zabc',
    'openid.assoc_handle': '1234',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'xyz',
    ...over,
  });
}
const steamSays = (body: string) =>
  vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

describe('verifyAssertion', () => {
  it('returns the SteamID64 when Steam confirms the assertion', async () => {
    const f = steamSays('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
    expect(await verifyAssertion(assertion(), { returnTo: RETURN_TO, fetchImpl: f })).toBe(ID);
    const sent = new URLSearchParams(String((f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].body));
    expect(sent.get('openid.mode')).toBe('check_authentication');
  });

  it('rejects when Steam says the signature is invalid', async () => {
    const f = steamSays('is_valid:false\n');
    expect(await verifyAssertion(assertion(), { returnTo: RETURN_TO, fetchImpl: f })).toBeNull();
  });

  it.each([
    ['another return_to', { 'openid.return_to': 'https://evil.example/cb?s=abc' }],
    ['another provider', { 'openid.op_endpoint': 'https://evil.example/openid/login' }],
    ['a forged claimed_id host', { 'openid.claimed_id': `https://evil.example/openid/id/${ID}`, 'openid.identity': `https://evil.example/openid/id/${ID}` }],
    ['a short SteamID', { 'openid.claimed_id': 'https://steamcommunity.com/openid/id/123', 'openid.identity': 'https://steamcommunity.com/openid/id/123' }],
    ['identity != claimed_id', { 'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000001' }],
    ['a cancelled login', { 'openid.mode': 'cancel' }],
    ['an unsigned return_to', { 'openid.signed': 'signed,op_endpoint,claimed_id,identity,response_nonce,assoc_handle' }],
  ])('never reaches Steam for %s', async (_n, over) => {
    const f = steamSays('is_valid:true\n');
    expect(await verifyAssertion(assertion(over), { returnTo: RETURN_TO, fetchImpl: f })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('fails closed when Steam is unreachable', async () => {
    const f = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect(await verifyAssertion(assertion(), { returnTo: RETURN_TO, fetchImpl: f })).toBeNull();
  });
});

describe('helpers', () => {
  it('builds an identifier_select request for our callback', () => {
    const u = new URL(buildAuthUrl({ returnTo: RETURN_TO, realm: 'https://rmhstudios.com' }));
    expect(u.origin + u.pathname).toBe('https://steamcommunity.com/openid/login');
    expect(u.searchParams.get('openid.return_to')).toBe(RETURN_TO);
    expect(u.searchParams.get('openid.mode')).toBe('checkid_setup');
  });

  it.each(['//evil.example', 'https://evil.example', '\\\\evil', '/a\\b', '', null, undefined])(
    'safeCallback rejects %j',
    (v) => expect(safeCallback(v)).toBe('/'),
  );
  it('safeCallback keeps a local path', () => expect(safeCallback('/tf2/loadout?x=1')).toBe('/tf2/loadout?x=1'));
  it('uses a non-routable placeholder email', () =>
    expect(steamPlaceholderEmail(ID)).toBe(`steam-${ID}@users.noreply.rmhstudios.com`));
});
