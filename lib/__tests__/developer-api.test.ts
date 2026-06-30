import { describe, it, expect } from 'vitest';
import { hasScope, normalizeScopes, isValidScope, DEFAULT_SCOPES, ALL_SCOPES, READ_SCOPES } from '@/lib/api/scopes';
import { errorType, defaultStatus, errorBody } from '@/lib/api/errors';
import { buildOpenApiDocument } from '@/lib/api/openapi';
import { ENDPOINTS } from '@/lib/api/registry';
import { signWebhookPayload, verifyWebhookSignature, validateWebhookUrl, generateWebhookSecret, WEBHOOK_SECRET_PREFIX } from '@/lib/webhooks/signature';
import { normalizeWebhookEvents, matchesEvent, isValidWebhookEvent } from '@/lib/webhooks/events';
import { parsePage, page } from '@/lib/api/serializers.server';

describe('scopes', () => {
  it('exact + wildcard matching', () => {
    expect(hasScope(['read:profile'], 'read:profile')).toBe(true);
    expect(hasScope(['read:profile'], 'write:posts')).toBe(false);
    expect(hasScope(['*'], 'write:posts')).toBe(true);
    expect(hasScope(['read:*'], 'read:feed')).toBe(true);
    expect(hasScope(['read:*'], 'write:posts')).toBe(false);
    expect(hasScope(['write:*'], 'write:likes')).toBe(true);
  });

  it('normalizes: drops invalid, trims, dedupes, preserves order', () => {
    expect(normalizeScopes(['read:profile', 'bogus', 'read:profile', ' write:posts '])).toEqual(['read:profile', 'write:posts']);
    expect(normalizeScopes('nope' as unknown)).toEqual([]);
    expect(normalizeScopes([1, 2, 'read:feed'])).toEqual(['read:feed']);
  });

  it('validates scopes + wildcards', () => {
    expect(isValidScope('read:profile')).toBe(true);
    expect(isValidScope('*')).toBe(true);
    expect(isValidScope('read:*')).toBe(true);
    expect(isValidScope('nonsense')).toBe(false);
  });

  it('defaults are read-only and a subset of all', () => {
    expect(DEFAULT_SCOPES).toEqual(READ_SCOPES);
    expect(DEFAULT_SCOPES.every((s) => ALL_SCOPES.includes(s))).toBe(true);
    expect(DEFAULT_SCOPES).not.toContain('write:posts');
  });
});

describe('error envelope', () => {
  it('maps codes to types + statuses, falls back to api_error/500', () => {
    expect(errorType('insufficient_scope')).toBe('authorization_error');
    expect(errorType('rate_limited')).toBe('rate_limit_error');
    expect(errorType('totally_unknown')).toBe('api_error');
    expect(defaultStatus('not_found')).toBe(404);
    expect(defaultStatus('totally_unknown')).toBe(500);
  });

  it('builds a stable body with request_id', () => {
    expect(errorBody('not_found', 'nope', 'req_123')).toEqual({
      error: { type: 'not_found_error', code: 'not_found', message: 'nope', request_id: 'req_123' },
    });
  });
});

describe('openapi document', () => {
  const doc = buildOpenApiDocument() as {
    openapi: string;
    paths: Record<string, Record<string, { 'x-required-scope'?: string; security?: unknown[] }>>;
    components: { securitySchemes: Record<string, unknown>; schemas: { Error: unknown } };
  };

  it('is 3.1 with security schemes + Error schema', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.components.securitySchemes).toHaveProperty('bearerAuth');
    expect(doc.components.securitySchemes).toHaveProperty('apiKeyAuth');
    expect(doc.components.schemas.Error).toBeTruthy();
  });

  it('has a path operation for every registry endpoint', () => {
    for (const ep of ENDPOINTS) {
      const op = doc.paths[ep.path]?.[ep.method.toLowerCase()];
      expect(op, `${ep.method} ${ep.path}`).toBeTruthy();
      if (ep.scope) expect(op['x-required-scope']).toBe(ep.scope);
    }
  });

  it('marks the public meta endpoint as unauthenticated', () => {
    const op = doc.paths['/api/v1/openapi.json']?.get;
    expect(op?.security).toEqual([]);
  });
});

describe('webhook signature', () => {
  it('signs + verifies round-trip', () => {
    const secret = 'whsec_test';
    const body = JSON.stringify({ event: 'post.created' });
    const t = Math.floor(Date.now() / 1000);
    const sig = signWebhookPayload(secret, t, body);
    expect(verifyWebhookSignature(secret, `t=${t},v1=${sig}`, body)).toBe(true);
  });

  it('rejects tampered body, wrong secret, and stale timestamps', () => {
    const secret = 'whsec_test';
    const body = '{"a":1}';
    const t = Math.floor(Date.now() / 1000);
    const sig = signWebhookPayload(secret, t, body);
    expect(verifyWebhookSignature(secret, `t=${t},v1=${sig}`, '{"a":2}')).toBe(false);
    expect(verifyWebhookSignature('whsec_other', `t=${t},v1=${sig}`, body)).toBe(false);
    const old = t - 10_000;
    expect(verifyWebhookSignature(secret, `t=${old},v1=${signWebhookPayload(secret, old, body)}`, body)).toBe(false);
  });

  it('generates prefixed secrets', () => {
    expect(generateWebhookSecret().startsWith(WEBHOOK_SECRET_PREFIX)).toBe(true);
  });
});

describe('webhook url validation (SSRF guard)', () => {
  it('accepts public https, rejects http + private hosts', () => {
    expect(validateWebhookUrl('https://example.com/hook')).toBeNull();
    expect(validateWebhookUrl('http://example.com/hook')).toMatch(/https/);
    expect(validateWebhookUrl('https://localhost/hook')).toMatch(/private/);
    expect(validateWebhookUrl('https://127.0.0.1/hook')).toMatch(/private/);
    expect(validateWebhookUrl('https://10.0.0.5/hook')).toMatch(/private/);
    expect(validateWebhookUrl('https://192.168.1.1/hook')).toMatch(/private/);
    expect(validateWebhookUrl('not a url')).toMatch(/valid/);
  });
});

describe('webhook events', () => {
  it('validates + normalizes + matches', () => {
    expect(isValidWebhookEvent('post.created')).toBe(true);
    expect(isValidWebhookEvent('*')).toBe(true);
    expect(isValidWebhookEvent('nope')).toBe(false);
    expect(normalizeWebhookEvents(['post.created', 'nope', 'post.created'])).toEqual(['post.created']);
    expect(matchesEvent(['*'], 'follow.created')).toBe(true);
    expect(matchesEvent(['post.created'], 'follow.created')).toBe(false);
  });
});

describe('pagination helpers', () => {
  it('parsePage clamps limit + reads cursor', () => {
    expect(parsePage(new URL('https://x/y?limit=10&cursor=abc'))).toEqual({ limit: 10, cursor: 'abc' });
    expect(parsePage(new URL('https://x/y?limit=999')).limit).toBe(50);
    expect(parsePage(new URL('https://x/y?limit=0')).limit).toBe(20);
    expect(parsePage(new URL('https://x/y'))).toEqual({ limit: 20, cursor: null });
    expect(parsePage(new URL('https://x/y?limit=200'), { maxLimit: 100 }).limit).toBe(100);
  });

  it('page builds nextCursor only when full', () => {
    const items = [{ t: 'a' }, { t: 'b' }];
    expect(page(items, 2, (x) => x.t)).toEqual({ data: items, nextCursor: 'b' });
    expect(page(items, 5, (x) => x.t)).toEqual({ data: items, nextCursor: null });
  });
});
