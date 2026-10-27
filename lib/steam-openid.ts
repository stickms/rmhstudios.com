/**
 * Steam's OpenID 2.0 sign-in, as pure functions (no Better Auth, no database),
 * so the security-relevant parts are unit-tested on their own.
 *
 * Flow: send the browser to {@link buildAuthUrl}; Steam sends it back to our
 * `return_to` with signed `openid.*` parameters; {@link verifyAssertion} checks
 * them locally and then asks Steam to confirm the signature
 * (`check_authentication`). Only an assertion Steam itself confirms, for this
 * exact `return_to`, yields a SteamID64.
 */

const ENDPOINT = 'https://steamcommunity.com/openid/login';
const NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = `${NS}/identifier_select`;
const CLAIMED = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function buildAuthUrl({ returnTo, realm }: { returnTo: string; realm: string }): string {
  const q = new URLSearchParams({
    'openid.ns': NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${ENDPOINT}?${q.toString()}`;
}

export interface VerifyOptions {
  /** The exact `return_to` that was sent to Steam, including our state value. */
  returnTo: string;
  fetchImpl?: typeof fetch;
}

/** The SteamID64 Steam vouches for, or null when anything about the assertion is off. */
export async function verifyAssertion(
  params: URLSearchParams,
  { returnTo, fetchImpl = fetch }: VerifyOptions,
): Promise<string | null> {
  if (params.get('openid.ns') !== NS || params.get('openid.mode') !== 'id_res') return null;
  if (params.get('openid.op_endpoint') !== ENDPOINT) return null;
  // The assertion must be for the request we started (blocks reuse on another route or origin).
  if (params.get('openid.return_to') !== returnTo) return null;
  const claimed = params.get('openid.claimed_id') ?? '';
  const steamId = CLAIMED.exec(claimed)?.[1];
  if (!steamId || params.get('openid.identity') !== claimed) return null;
  // These fields must be covered by Steam's signature.
  const signed = (params.get('openid.signed') ?? '').split(',');
  for (const f of ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle']) {
    if (!signed.includes(f)) return null;
  }

  const check = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith('openid.')) check.set(k, v);
  check.set('openid.mode', 'check_authentication');
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: check.toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const valid = text.split('\n').some((l) => l.trim() === 'is_valid:true');
    return valid ? steamId : null;
  } catch {
    return null;
  }
}

export interface SteamProfile {
  name: string;
  image: string | null;
}

/** Name and avatar out of a public profile's `?xml=1` document; null when either is missing. */
export function parseProfileXml(xml: string): SteamProfile | null {
  const name = /<steamID><!\[CDATA\[([\s\S]*?)\]\]><\/steamID>/.exec(xml)?.[1]?.trim();
  if (!name) return null;
  const avatar = /<avatarFull><!\[CDATA\[(https:\/\/[^\]\s]+)\]\]><\/avatarFull>/.exec(xml)?.[1];
  return { name: name.slice(0, 60), image: avatar ?? null };
}

/**
 * Display name and avatar from the player's public profile page. No API key is
 * needed; null when the profile is private, missing or Steam is unreachable
 * (the account is then created with a generic name).
 */
export async function fetchSteamProfile(
  steamId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SteamProfile | null> {
  if (!/^\d{17}$/.test(steamId)) return null;
  try {
    const res = await fetchImpl(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return parseProfileXml(await res.text());
  } catch {
    return null;
  }
}

/** Only same-site relative paths are valid post-sign-in destinations. */
export function safeCallback(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  return raw;
}

/** Steam gives no email; this placeholder can never receive mail and never collides with a real one. */
export const steamPlaceholderEmail = (steamId: string): string =>
  `steam-${steamId}@users.noreply.rmhstudios.com`;
