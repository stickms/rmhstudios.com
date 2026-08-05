/**
 * Contract tests for the two behaviours added to `defineHandler` in the
 * 2026-08-05 batch: `Idempotency-Key` replay (E5) and `AppError` mapping (D11).
 *
 * Both are security- and money-adjacent, and both fail in ways that are
 * invisible without a test:
 *
 *  - A replay bug does not throw. It silently runs a handler twice, which on a
 *    coin-spending route means the user paid twice and on a post route means a
 *    duplicate appeared. Nothing logs an error.
 *  - An `AppError` mapping bug does not throw either. It degrades a precise
 *    402 "you're out of AI allowance" into a bare 500, which the client renders
 *    as "something went wrong" — the feature looks broken rather than gated.
 *
 * The Prisma-backed idempotency store is mocked here; the point of these tests
 * is the WRAPPER's ordering and status codes, which is the part that has to be
 * right for every route at once.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

const claimIdempotency = vi.fn();
const recordIdempotency = vi.fn();
const releaseIdempotency = vi.fn();
vi.mock('@/lib/api/idempotency.server', () => ({
  claimIdempotency: (...a: unknown[]) => claimIdempotency(...a),
  recordIdempotency: (...a: unknown[]) => recordIdempotency(...a),
  releaseIdempotency: (...a: unknown[]) => releaseIdempotency(...a),
}));

import { defineHandler } from '@/lib/api/handler.server';
import { AppError } from '@/lib/errors/codes';

const SIGNED_IN = { user: { id: 'u1', name: 'Ada', isAdmin: false } };

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://rmhstudios.com/api/test', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `${Math.random()}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SIGNED_IN);
  claimIdempotency.mockReset().mockResolvedValue({ kind: 'claimed' });
  recordIdempotency.mockReset().mockResolvedValue(undefined);
  releaseIdempotency.mockReset().mockResolvedValue(undefined);
});

describe('idempotency', () => {
  const schema = z.object({ amount: z.number() });

  it('runs the handler normally when no key is supplied', async () => {
    const inner = vi.fn(async () => Response.json({ ok: true }));
    const h = defineHandler({ idempotent: true, body: schema }, inner);
    const res = await h({ params: {}, request: post({ amount: 1 }) });

    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
    // No key means no store interaction at all — the feature must be free for
    // the clients that don't use it.
    expect(claimIdempotency).not.toHaveBeenCalled();
    expect(recordIdempotency).not.toHaveBeenCalled();
  });

  it('replays the stored response without running the handler again', async () => {
    claimIdempotency.mockResolvedValue({
      kind: 'replay',
      status: 201,
      body: JSON.stringify({ id: 'post_1' }),
    });
    const inner = vi.fn(async () => Response.json({ id: 'post_2' }, { status: 201 }));
    const h = defineHandler({ idempotent: true, body: schema }, inner);
    const res = await h({ params: {}, request: post({ amount: 1 }, { 'idempotency-key': 'k1' }) });

    expect(res.status).toBe(201);
    expect(res.headers.get('Idempotency-Replayed')).toBe('true');
    // The original id, not the one the second call would have produced.
    await expect(res.json()).resolves.toEqual({ id: 'post_1' });
    expect(inner).not.toHaveBeenCalled();
  });

  it('409s the same key sent with a different body', async () => {
    claimIdempotency.mockResolvedValue({ kind: 'conflict' });
    const inner = vi.fn(async () => Response.json({ ok: true }));
    const h = defineHandler({ idempotent: true, body: schema }, inner);
    const res = await h({ params: {}, request: post({ amount: 9 }, { 'idempotency-key': 'k1' }) });

    expect(res.status).toBe(409);
    expect(inner).not.toHaveBeenCalled();
  });

  it('409s a duplicate that is still in flight, with Retry-After', async () => {
    claimIdempotency.mockResolvedValue({ kind: 'in-flight' });
    const h = defineHandler({ idempotent: true, body: schema }, async () => Response.json({}));
    const res = await h({ params: {}, request: post({ amount: 1 }, { 'idempotency-key': 'k1' }) });

    expect(res.status).toBe(409);
    expect(res.headers.get('Retry-After')).toBe('1');
  });

  it('records the response after a successful handler run', async () => {
    const h = defineHandler({ idempotent: true, body: schema }, async () =>
      Response.json({ id: 'x' }, { status: 201 }),
    );
    const res = await h({ params: {}, request: post({ amount: 1 }, { 'idempotency-key': 'k1' }) });

    expect(res.status).toBe(201);
    // The response the caller receives must still be readable — the wrapper
    // clones to store it, and a botched clone would leave the caller with a
    // consumed stream.
    await expect(res.json()).resolves.toEqual({ id: 'x' });
    expect(recordIdempotency).toHaveBeenCalledWith('u1', 'k1', 201, JSON.stringify({ id: 'x' }));
  });

  it('releases the claim when the handler throws, so a retry can run', async () => {
    const h = defineHandler({ idempotent: true, body: schema }, async () => {
      throw new Error('boom');
    });
    const res = await h({ params: {}, request: post({ amount: 1 }, { 'idempotency-key': 'k1' }) });

    expect(res.status).toBe(500);
    expect(releaseIdempotency).toHaveBeenCalledWith('u1', 'k1');
    expect(recordIdempotency).not.toHaveBeenCalled();
  });

  it('validates before claiming — a malformed request never burns a key', async () => {
    const h = defineHandler({ idempotent: true, body: schema }, async () => Response.json({}));
    const res = await h({
      params: {},
      request: post({ amount: 'not-a-number' }, { 'idempotency-key': 'k1' }),
    });

    expect(res.status).toBe(400);
    expect(claimIdempotency).not.toHaveBeenCalled();
  });

  it('ignores the key for anonymous callers', async () => {
    getSession.mockResolvedValue(null);
    const h = defineHandler(
      { auth: 'optional', idempotent: true },
      async () => Response.json({ ok: true }),
    );
    const res = await h({ params: {}, request: post({}, { 'idempotency-key': 'k1' }) });

    expect(res.status).toBe(200);
    // Keys are scoped to a user; without one there is nothing to scope to, and
    // an IP-scoped key would let one caller replay another's response.
    expect(claimIdempotency).not.toHaveBeenCalled();
  });
});

describe('AppError mapping', () => {
  it('maps a thrown AppError to its status and code', async () => {
    const h = defineHandler({}, async () => {
      throw new AppError('INSUFFICIENT_COINS', { needed: 50 });
    });
    const res = await h({ params: {}, request: post({}) });

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toEqual({
      error: "You don't have enough coins",
      code: 'INSUFFICIENT_COINS',
      detail: { needed: 50 },
    });
  });

  it('still buries an unnamed exception as a bare 500', async () => {
    const h = defineHandler({}, async () => {
      throw new Error('SELECT * FROM user WHERE secret = ...');
    });
    const res = await h({ params: {}, request: post({}) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal Server Error' });
    // The regression that matters: no internals in the response.
    expect(JSON.stringify(body)).not.toContain('SELECT');
  });

  it('carries the code through even without detail', async () => {
    const h = defineHandler({}, async () => {
      throw new AppError('AI_BUDGET_EXCEEDED');
    });
    const res = await h({ params: {}, request: post({}) });

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
  });
});
