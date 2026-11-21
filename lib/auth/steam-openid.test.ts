/**
 * Auth (docs/testing.md criterion): these checks decide whether a Steam
 * callback signs someone in as a given Steam ID. A regression here is an
 * account takeover, so each refusal is pinned.
 */
import { describe, expect, it } from 'vitest';
import {
  STEAM_OPENID_ENDPOINT,
  buildSteamLoginUrl,
  isValidVerificationResponse,
  parseSteamAssertion,
} from './steam-openid';
import { isPlaceholderEmail, placeholderEmail } from './providers';

const RETURN_TO = 'https://rmhstudios.com/api/auth/steam/callback?state=abc123';
const STEAM_ID = '76561197960287930';
const CLAIMED = `https://steamcommunity.com/openid/id/${STEAM_ID}`;

function assertion(overrides: Record<string, string | null> = {}): URLSearchParams {
  const fields: Record<string, string | null> = {
    state: 'abc123',
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': CLAIMED,
    'openid.identity': CLAIMED,
    'openid.return_to': RETURN_TO,
    'openid.response_nonce': '2026-11-16T12:00:00Zabcdef',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2lnbmF0dXJl',
    ...overrides,
  };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== null) params.set(k, v);
  return params;
}

describe('buildSteamLoginUrl', () => {
  it('asks Steam to pick the identity and return to our callback', () => {
    const url = new URL(
      buildSteamLoginUrl({
        returnTo: RETURN_TO,
        realm: 'https://rmhstudios.com',
      }),
    );
    expect(url.origin + url.pathname).toBe(STEAM_OPENID_ENDPOINT);
    expect(url.searchParams.get('openid.mode')).toBe('checkid_setup');
    expect(url.searchParams.get('openid.return_to')).toBe(RETURN_TO);
    expect(url.searchParams.get('openid.realm')).toBe('https://rmhstudios.com');
    expect(url.searchParams.get('openid.claimed_id')).toBe('http://specs.openid.net/auth/2.0/identifier_select');
  });
});

describe('parseSteamAssertion', () => {
  it('accepts a well-formed assertion and builds the verification body', () => {
    const result = parseSteamAssertion(assertion(), RETURN_TO);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steamId).toBe(STEAM_ID);
    expect(result.verificationBody.get('openid.mode')).toBe('check_authentication');
    expect(result.verificationBody.get('openid.sig')).toBe('c2lnbmF0dXJl');
    // Our own state is not part of the assertion Steam signed.
    expect(result.verificationBody.has('state')).toBe(false);
  });

  it('reports a cancelled sign-in', () => {
    expect(
      parseSteamAssertion(
        assertion({
          'openid.mode': 'cancel',
        }),
        RETURN_TO,
      ),
    ).toEqual({
      ok: false,
      error: 'cancelled',
    });
  });

  it.each([
    [
      'a non-assertion mode',
      {
        'openid.mode': 'check_authentication',
      },
      'not_an_assertion',
    ],
    [
      'a missing signature',
      {
        'openid.sig': null,
      },
      'not_an_assertion',
    ],
    [
      'the wrong OpenID namespace',
      {
        'openid.ns': 'http://openid.net/signon/1.1',
      },
      'not_an_assertion',
    ],
    [
      'another provider',
      {
        'openid.op_endpoint': 'https://evil.example/openid/login',
      },
      'wrong_endpoint',
    ],
    [
      'a return URL from another flow',
      {
        'openid.return_to': 'https://rmhstudios.com/api/auth/steam/callback?state=other',
      },
      'wrong_return_to',
    ],
    [
      'a return URL on another host',
      {
        'openid.return_to': 'https://evil.example/api/auth/steam/callback?state=abc123',
      },
      'wrong_return_to',
    ],
    [
      'a claimed id on another host',
      {
        'openid.claimed_id': `https://evil.example/openid/id/${STEAM_ID}`,
        'openid.identity': `https://evil.example/openid/id/${STEAM_ID}`,
      },
      'bad_claimed_id',
    ],
    [
      'a claimed id that is not a SteamID64',
      {
        'openid.claimed_id': 'https://steamcommunity.com/openid/id/123',
        'openid.identity': 'https://steamcommunity.com/openid/id/123',
      },
      'bad_claimed_id',
    ],
    [
      'an identity that differs from the claimed id',
      {
        'openid.identity': 'https://steamcommunity.com/openid/id/76561197960287931',
      },
      'bad_claimed_id',
    ],
    [
      'an unsigned claimed id',
      {
        'openid.signed': 'signed,op_endpoint,identity,return_to,response_nonce,assoc_handle',
      },
      'unsigned_fields',
    ],
    [
      'an unsigned return URL',
      {
        'openid.signed': 'signed,op_endpoint,claimed_id,identity,response_nonce,assoc_handle',
      },
      'unsigned_fields',
    ],
  ])('refuses %s', (_label, overrides, error) => {
    expect(parseSteamAssertion(assertion(overrides), RETURN_TO)).toEqual({
      ok: false,
      error,
    });
  });
});

describe('isValidVerificationResponse', () => {
  it('accepts only an explicit is_valid:true', () => {
    expect(isValidVerificationResponse('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n')).toBe(true);
    expect(isValidVerificationResponse('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n')).toBe(false);
    expect(isValidVerificationResponse('ns:http://specs.openid.net/auth/2.0\n')).toBe(false);
    expect(isValidVerificationResponse('is_valid:true\n')).toBe(false);
    expect(isValidVerificationResponse('<html>is_valid:true</html>')).toBe(false);
  });
});

describe('placeholder emails', () => {
  it("matches Better Auth's format and is recognised", () => {
    expect(placeholderEmail('steam', STEAM_ID)).toBe(`${STEAM_ID}@steam.placeholder.invalid`);
    expect(isPlaceholderEmail('12345@twitter.placeholder.invalid')).toBe(true);
    expect(isPlaceholderEmail(' 123@TWITTER.PLACEHOLDER.INVALID ')).toBe(true);
  });

  it('leaves real addresses alone', () => {
    expect(isPlaceholderEmail('someone@example.com')).toBe(false);
    expect(isPlaceholderEmail('placeholder.invalid@example.com')).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
    expect(isPlaceholderEmail(undefined)).toBe(false);
  });
});
