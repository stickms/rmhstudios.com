/**
 * Steam sign-in speaks OpenID 2.0, not OAuth 2.0, so Better Auth has no
 * provider for it. This module is the protocol half of `steam.server.ts`: pure
 * functions with no I/O, so every check that decides "is this really that
 * Steam user" is unit-testable (`steam-openid.test.ts`).
 *
 * The flow (OpenID Authentication 2.0, https://openid.net/specs/openid-authentication-2_0.html):
 *   1. Redirect the browser to Steam with `checkid_setup` and our `return_to`.
 *   2. Steam sends the browser back to `return_to` with a signed positive
 *      assertion (`openid.mode=id_res`) naming the Steam ID in `claimed_id`.
 *   3. We do not trust the assertion until Steam itself confirms it: the
 *      parameters are POSTed back to Steam with `mode=check_authentication`
 *      ("direct verification", spec §11.4.2) and Steam answers `is_valid:true`.
 *
 * Steam runs no associations, so direct verification is the only check that
 * proves the signature; everything below that runs before it only refuses
 * assertions that could not be ours (wrong endpoint, wrong return URL, a
 * claimed id that is not a Steam ID), so a forged one never costs a request.
 */

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';

const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** Fields the assertion must have signed; anything unsigned could be swapped. */
const REQUIRED_SIGNED = [
  'op_endpoint',
  'claimed_id',
  'identity',
  'return_to',
  'response_nonce',
  'assoc_handle',
] as const;

/** The URL to send the browser to so Steam can ask the user to sign in. */
export function buildSteamLoginUrl({ returnTo, realm }: { returnTo: string; realm: string }): string {
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

export type SteamAssertion =
  | {
      ok: true;
      /** SteamID64, 17 digits. */
      steamId: string;
      /** The form body to POST to `STEAM_OPENID_ENDPOINT` for direct verification. */
      verificationBody: URLSearchParams;
    }
  | {
      ok: false;
      error: SteamAssertionError;
    };

export type SteamAssertionError =
  'cancelled' | 'not_an_assertion' | 'wrong_endpoint' | 'wrong_return_to' | 'bad_claimed_id' | 'unsigned_fields';

/**
 * Check the callback's `openid.*` parameters against what we asked for.
 * `expectedReturnTo` is the exact `return_to` sent in step 1 (it carries the
 * flow's state, so a match also ties the assertion to this browser's flow).
 */
export function parseSteamAssertion(params: URLSearchParams, expectedReturnTo: string): SteamAssertion {
  const get = (key: string) => params.get(`openid.${key}`);

  if (get('mode') === 'cancel')
    return {
      ok: false,
      error: 'cancelled',
    };
  if (get('ns') !== OPENID_NS || get('mode') !== 'id_res' || !get('sig')) {
    return {
      ok: false,
      error: 'not_an_assertion',
    };
  }
  if (get('op_endpoint') !== STEAM_OPENID_ENDPOINT)
    return {
      ok: false,
      error: 'wrong_endpoint',
    };
  if (get('return_to') !== expectedReturnTo)
    return {
      ok: false,
      error: 'wrong_return_to',
    };

  const claimedId = get('claimed_id');
  const match = claimedId ? CLAIMED_ID.exec(claimedId) : null;
  if (!match?.[1] || get('identity') !== claimedId)
    return {
      ok: false,
      error: 'bad_claimed_id',
    };

  const signed = new Set((get('signed') ?? '').split(','));
  if (!REQUIRED_SIGNED.every((field) => signed.has(field))) {
    return {
      ok: false,
      error: 'unsigned_fields',
    };
  }

  // Every openid.* field Steam sent goes back unchanged except the mode; the
  // non-OpenID parameters on the callback URL (our `state`) are not part of the
  // assertion and are left out.
  const verificationBody = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith('openid.')) verificationBody.set(key, value);
  }
  verificationBody.set('openid.mode', 'check_authentication');

  return {
    ok: true,
    steamId: match[1],
    verificationBody,
  };
}

/**
 * Read Steam's answer to direct verification: key-value form, one `key:value`
 * per line (spec §4.1.1). Only an exact `is_valid:true` counts.
 */
export function isValidVerificationResponse(body: string): boolean {
  let nsOk = false;
  let valid = false;
  for (const line of body.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key === 'ns') nsOk = value === OPENID_NS;
    if (key === 'is_valid') valid = value === 'true';
  }
  return nsOk && valid;
}
