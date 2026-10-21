// Request signing for the /v1 (VPS → watchdog) endpoints.
//
// Same idea as the GitHub → VPS deploy webhook (webhook-server.cjs), plus the
// replay protection that one doesn't need: a signed heartbeat replayed every
// minute would make a dead VPS look alive, and a replayed "resolved" would
// clear a real alarm.
//
//   X-Oncall-Timestamp: <unix seconds>
//   X-Oncall-Nonce:     <16–64 chars of [A-Za-z0-9_-], random per request>
//   X-Oncall-Signature: v1=<hex HMAC-SHA256(secret, "v1:<ts>:<nonce>:<METHOD>:<path>:<body>")>
//
// Method and path are signed so a heartbeat for one name can't be replayed as
// another, nor an alert body posted to a different endpoint. The timestamp
// bounds the window; the nonce (checked once, inside the Durable Object) closes it.
//
// FAIL CLOSED: with ONCALL_SIGNING_SECRET unset or shorter than 32 chars,
// every /v1 request is rejected. There is no bypass switch.

export const SIGNATURE_WINDOW_SECONDS = 5 * 60;
export const MIN_SECRET_LENGTH = 32;
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;

export type SignatureResult = { ok: true; nonce: string } | { ok: false; status: 401 | 503; reason: string };

export function signingString(ts: string, nonce: string, method: string, path: string, body: string): string {
  return `v1:${ts}:${nonce}:${method.toUpperCase()}:${path}:${body}`;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string compare (both are fixed-length hex here, but don't rely on it). */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** For tests and for any TS caller; the VPS side signs with openssl / Go's crypto/hmac. */
export async function signRequest(secret: string, method: string, path: string, body: string, ts: string, nonce: string) {
  return {
    'x-oncall-timestamp': ts,
    'x-oncall-nonce': nonce,
    'x-oncall-signature': `v1=${await hmacHex(secret, signingString(ts, nonce, method, path, body))}`,
  };
}

/**
 * Verify signature + freshness. Does NOT check the nonce has not been seen — that
 * must happen in the Durable Object, the only place a check-and-set is atomic.
 */
export async function verifySignature(
  request: Request,
  path: string,
  body: string,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SignatureResult> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return { ok: false, status: 503, reason: 'signing secret not configured' };
  const ts = request.headers.get('x-oncall-timestamp') ?? '';
  const nonce = request.headers.get('x-oncall-nonce') ?? '';
  const sig = request.headers.get('x-oncall-signature') ?? '';
  if (!/^\d{1,12}$/.test(ts) || !NONCE_RE.test(nonce) || !sig.startsWith('v1=')) {
    return { ok: false, status: 401, reason: 'missing or malformed signature headers' };
  }
  if (Math.abs(nowSeconds - Number(ts)) > SIGNATURE_WINDOW_SECONDS) return { ok: false, status: 401, reason: 'stale timestamp' };
  const expected = `v1=${await hmacHex(secret, signingString(ts, nonce, request.method, path, body))}`;
  if (!safeEqual(sig, expected)) return { ok: false, status: 401, reason: 'bad signature' };
  return { ok: true, nonce };
}
