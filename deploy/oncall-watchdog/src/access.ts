// Cloudflare Access gate for the /v1 (VPS → watchdog) endpoints.
//
// Access sits in front of `/v1/*` and only lets a request through with a valid
// service token (CF-Access-Client-Id / -Secret); it then forwards a signed JWT
// in `Cf-Access-Jwt-Assertion`. This verifies that JWT itself — signature against
// the team's published keys, audience, issuer, expiry — rather than trusting
// that the header exists, so the endpoint stays closed even if the Access policy
// is ever detached or the Worker is reached by another route.
//
// FAIL CLOSED: with ACCESS_TEAM_DOMAIN or ACCESS_AUD unset, every /v1 request is
// rejected. There is no bypass switch.

export interface AccessConfig {
  teamDomain?: string;
  aud?: string;
  /** If set, the token's `common_name` (the service token Client ID) must match. */
  clientId?: string;
}

export type AccessResult = { ok: true; subject: string } | { ok: false; status: 401 | 403 | 503; reason: string };

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

const CERTS_TTL_MS = 10 * 60 * 1000;
let certCache: { domain: string; at: number; keys: Jwk[] } | null = null;

/** Test seam. */
export function resetAccessCertCache(): void {
  certCache = null;
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function loadKeys(domain: string, fetchImpl: typeof fetch, now: number, force = false): Promise<Jwk[]> {
  if (!force && certCache && certCache.domain === domain && now - certCache.at < CERTS_TTL_MS) return certCache.keys;
  const res = await fetchImpl(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const keys = ((await res.json()) as { keys?: Jwk[] }).keys ?? [];
  certCache = { domain, at: now, keys };
  return keys;
}

export async function verifyAccess(
  request: Request,
  cfg: AccessConfig,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<AccessResult> {
  if (!cfg.teamDomain || !cfg.aud) return { ok: false, status: 503, reason: 'access gate not configured' };
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(cfg.teamDomain)) return { ok: false, status: 503, reason: 'bad team domain' };

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return { ok: false, status: 401, reason: 'missing access token' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, reason: 'malformed token' };
  const [h, p, s] = parts as [string, string, string];
  const header = b64urlJson(h);
  const payload = b64urlJson(p);
  if (!header || !payload || header.alg !== 'RS256' || typeof header.kid !== 'string') {
    return { ok: false, status: 401, reason: 'unsupported token' };
  }

  let keys: Jwk[];
  try {
    keys = await loadKeys(cfg.teamDomain, fetchImpl, now);
    // A key rotation: refetch once before giving up on an unknown kid.
    if (!keys.some((k) => k.kid === header.kid)) keys = await loadKeys(cfg.teamDomain, fetchImpl, now, true);
  } catch {
    return { ok: false, status: 503, reason: 'could not load access keys' };
  }
  const jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) return { ok: false, status: 401, reason: 'unknown signing key' };

  let valid: boolean;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, status: 401, reason: 'bad signature' };

  const nowS = Math.floor(now / 1000);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(cfg.aud)) return { ok: false, status: 403, reason: 'wrong audience' };
  if (payload.iss !== `https://${cfg.teamDomain}`) return { ok: false, status: 403, reason: 'wrong issuer' };
  if (typeof payload.exp !== 'number' || payload.exp < nowS - 30) return { ok: false, status: 401, reason: 'expired' };
  if (typeof payload.nbf === 'number' && payload.nbf > nowS + 30) return { ok: false, status: 401, reason: 'not yet valid' };

  const subject = typeof payload.common_name === 'string' ? payload.common_name : '';
  // A service token carries `common_name` (its Client ID); a human login does not.
  if (!subject) return { ok: false, status: 403, reason: 'not a service token' };
  if (cfg.clientId && subject !== cfg.clientId) return { ok: false, status: 403, reason: 'service token not allowed' };
  return { ok: true, subject };
}
