import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyDiscordSignature } from '../discord';
import type { Env } from '../env';
import worker, { OncallState } from '../index';
import { signRequest, verifySignature } from '../signing';
import { memoryStorage } from './helpers';

// Both doors into the watchdog: Discord's signed button clicks, and the VPS's
// HMAC-signed /v1 calls. Each must reject anything it cannot verify, and a
// captured /v1 request must not work twice (a replayed heartbeat would make a
// dead VPS look alive).

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

const SECRET = 'x'.repeat(40);
const NONCE = 'n0nce-0123456789abcdef';

async function signed(path: string, body: string, opts: { ts?: number; nonce?: string; secret?: string; method?: string } = {}) {
  const method = opts.method ?? 'POST';
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const headers = await signRequest(opts.secret ?? SECRET, method, path, body, ts, opts.nonce ?? NONCE);
  return new Request(`https://oncall.test${path}`, {
    method,
    headers: { ...headers, 'content-type': 'application/json' },
    ...(method === 'GET' ? {} : { body }),
  });
}

describe('signRequest', () => {
  // The same vector is asserted in go-services/pkg/oncall (the status service's
  // sender) and matches `openssl dgst -sha256 -hmac` in deploy/oncall-send.sh.
  // All three signers must agree byte for byte, or the VPS can't page anyone.
  it('matches the cross-language test vector', async () => {
    const h = await signRequest(SECRET, 'POST', '/v1/alert', '{"x":1}', '1800000000', 'abcdefabcdef0123');
    expect(h['x-oncall-signature']).toBe('v1=6028d8faef5cfa9d35313a8bc95430f32c6b7e3ded899c195d927522592095f2');
  });
});

describe('verifySignature', () => {
  const now = 1_800_000_000;
  const body = '{"a":1}';

  it('fails closed without a (long enough) secret', async () => {
    const req = await signed('/v1/alert', body, { ts: now });
    expect(await verifySignature(req, '/v1/alert', body, undefined, now)).toMatchObject({ ok: false, status: 503 });
    expect(await verifySignature(req, '/v1/alert', body, 'short', now)).toMatchObject({ ok: false, status: 503 });
  });

  it('accepts a valid request and rejects every kind of tampering', async () => {
    const req = await signed('/v1/alert', body, { ts: now });
    expect(await verifySignature(req, '/v1/alert', body, SECRET, now)).toEqual({ ok: true, nonce: NONCE });
    // body, path, secret, staleness
    expect(await verifySignature(req, '/v1/alert', '{"a":2}', SECRET, now)).toMatchObject({ reason: 'bad signature' });
    expect(await verifySignature(req, '/v1/heartbeat/status', body, SECRET, now)).toMatchObject({ reason: 'bad signature' });
    expect(await verifySignature(req, '/v1/alert', body, 'y'.repeat(40), now)).toMatchObject({ reason: 'bad signature' });
    expect(await verifySignature(req, '/v1/alert', body, SECRET, now + 3600)).toMatchObject({ reason: 'stale timestamp' });
    expect(await verifySignature(new Request('https://oncall.test/v1/alert'), '/v1/alert', '', SECRET, now)).toMatchObject({
      status: 401,
    });
  });
});

describe('Worker /v1 end to end', () => {
  function harness() {
    const env = {
      SITE_URL: 'https://site.test',
      STATUS_URL: 'https://status.test',
      RUNBOOK_BASE: '',
      DISCORD_APPLICATION_ID: '',
      DISCORD_PUBLIC_KEY: '',
      ONCALL_CHANNEL_ID: 'C',
      ONCALL_ROLE_ID: 'R',
      ONCALL_SIGNING_SECRET: SECRET,
    } as Env;
    const state = new OncallState({ storage: memoryStorage() }, env);
    env.ONCALL_STATE = { idFromName: () => 'id', get: () => ({ fetch: (i, init) => state.fetch(new Request(i, init)) }) };
    return env;
  }

  it('accepts a signed heartbeat once and rejects the replay', async () => {
    const env = harness();
    const first = await worker.fetch(await signed('/v1/heartbeat/status', ''), env);
    expect(first.status).toBe(200);
    const replay = await worker.fetch(await signed('/v1/heartbeat/status', ''), env);
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ error: 'replayed request' });
  });

  it('rejects unsigned and wrongly-signed requests before touching state', async () => {
    const env = harness();
    expect((await worker.fetch(new Request('https://oncall.test/v1/alert', { method: 'POST', body: '{}' }), env)).status).toBe(401);
    expect((await worker.fetch(await signed('/v1/heartbeat/status', '', { secret: 'z'.repeat(40) }), env)).status).toBe(401);
  });

  it('fails closed when the secret is not configured', async () => {
    const env = harness();
    env.ONCALL_SIGNING_SECRET = undefined;
    expect((await worker.fetch(await signed('/v1/heartbeat/status', ''), env)).status).toBe(503);
  });

  it('a signed alert opens an alarm', async () => {
    const env = harness();
    const body = JSON.stringify({ state: 'firing', id: 'T00', sev: 2, title: 'test', source: 'test' });
    const res = await worker.fetch(await signed('/v1/alert', body, { nonce: 'another-nonce-0123456' }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, alarm: { key: 'T00', state: 'firing' } });
  });
});
