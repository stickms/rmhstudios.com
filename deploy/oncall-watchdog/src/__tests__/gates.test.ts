import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { resetAccessCertCache, verifyAccess } from '../access';
import { verifyDiscordSignature } from '../discord';

// Both doors into the watchdog: Discord's signed button clicks, and the VPS's
// Access-gated /v1 calls. Each must reject anything it cannot verify.

describe('verifyDiscordSignature', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubHex = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32).toString('hex');
  const now = 1_800_000_000;
  const body = '{"type":1}';
  const sigFor = (ts: string, b: string) => sign(null, Buffer.from(ts + b), privateKey).toString('hex');

  it('accepts a valid signature and rejects tampering, staleness and garbage', async () => {
    const ts = String(now);
    expect(await verifyDiscordSignature(pubHex, sigFor(ts, body), ts, body, now)).toBe(true);
    expect(await verifyDiscordSignature(pubHex, sigFor(ts, body), ts, '{"type":3}', now)).toBe(false);
    expect(await verifyDiscordSignature(pubHex, sigFor(ts, body), ts, body, now + 3600)).toBe(false);
    expect(await verifyDiscordSignature(pubHex, 'zz', ts, body, now)).toBe(false);
    expect(await verifyDiscordSignature('', sigFor(ts, body), ts, body, now)).toBe(false);
    expect(await verifyDiscordSignature(pubHex, null, ts, body, now)).toBe(false);
  });
});

describe('verifyAccess', () => {
  const team = 'rmh.cloudflareaccess.com';
  const aud = 'AUD123';
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, string>), kid: 'k1' };
  const certs: typeof fetch = async () => new Response(JSON.stringify({ keys: [jwk] }));
  const now = 1_800_000_000_000;

  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  function token(claims: Record<string, unknown>, kid = 'k1') {
    const h = b64({ alg: 'RS256', kid });
    const p = b64({ aud: [aud], iss: `https://${team}`, exp: now / 1000 + 300, common_name: 'client.access', ...claims });
    return `${h}.${p}.${sign('sha256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`;
  }
  const req = (t?: string) => new Request('https://oncall.test/v1/alert', { headers: t ? { 'cf-access-jwt-assertion': t } : {} });
  const cfg = { teamDomain: team, aud };

  afterEach(() => resetAccessCertCache());

  it('fails closed when unconfigured', async () => {
    expect(await verifyAccess(req(token({})), {}, certs, now)).toMatchObject({ ok: false, status: 503 });
  });

  it('accepts a valid service token', async () => {
    expect(await verifyAccess(req(token({})), cfg, certs, now)).toEqual({ ok: true, subject: 'client.access' });
  });

  it('rejects missing, forged, expired, wrong-audience and human tokens', async () => {
    expect(await verifyAccess(req(), cfg, certs, now)).toMatchObject({ ok: false, status: 401 });
    const forged = token({}).replace(/\.[^.]+$/, '.AAAA');
    expect(await verifyAccess(req(forged), cfg, certs, now)).toMatchObject({ ok: false, reason: 'bad signature' });
    expect(await verifyAccess(req(token({ exp: now / 1000 - 3600 })), cfg, certs, now)).toMatchObject({ reason: 'expired' });
    expect(await verifyAccess(req(token({ aud: ['other'] })), cfg, certs, now)).toMatchObject({ reason: 'wrong audience' });
    expect(await verifyAccess(req(token({ common_name: undefined })), cfg, certs, now)).toMatchObject({ reason: 'not a service token' });
    expect(await verifyAccess(req(token({}, 'k9')), cfg, certs, now)).toMatchObject({ reason: 'unknown signing key' });
  });

  it('pins to one service token when ACCESS_CLIENT_ID is set', async () => {
    const pinned = { ...cfg, clientId: 'someone-else.access' };
    expect(await verifyAccess(req(token({})), pinned, certs, now)).toMatchObject({ reason: 'service token not allowed' });
  });
});
