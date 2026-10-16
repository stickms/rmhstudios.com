import { describe, expect, it } from 'vitest';
import { sandboxResponse, findEndpoint } from '@/lib/api/test-mode';
import { DISCORD_WEBHOOK_RE } from '@/lib/devplatform/recipes';

const id = () => 'abc';

describe('test-mode sandbox', () => {
  it('answers reads with the documented fixture, not live data', () => {
    const r = sandboxResponse('GET', '/api/v1/me', null, id);
    expect(r?.status).toBe(200);
    expect(r?.body).toMatchObject({ handle: 'ada' });
  });

  it('acknowledges writes with the registry status and flags them as sandbox', () => {
    const r = sandboxResponse('POST', '/api/v1/posts', { content: 'hi' }, id);
    expect(r?.status).toBe(201);
    expect(r?.body).toMatchObject({
      content: 'hi',
      id: 'test_abc',
      sandbox: true,
      livemode: false,
    });
  });

  it('returns no body for 204 deletes and null for unknown endpoints', () => {
    expect(sandboxResponse('DELETE', '/api/v1/posts/ck_1', null, id)).toEqual({
      status: 204,
      body: null,
    });
    expect(sandboxResponse('GET', '/api/v1/nope', null, id)).toBeNull();
    expect(findEndpoint('GET', '/api/v1/users/ada')?.operationId).toBe('getUser');
  });
});

describe('recipe Discord webhook allowlist', () => {
  const ok = 'https://discord.com/api/webhooks/123456789012345678/' + 'a'.repeat(40);
  it('accepts real Discord webhooks only', () => {
    expect(DISCORD_WEBHOOK_RE.test(ok)).toBe(true);
    expect(
      DISCORD_WEBHOOK_RE.test('http://discord.com/api/webhooks/123456789/' + 'a'.repeat(40)),
    ).toBe(false);
    expect(
      DISCORD_WEBHOOK_RE.test('https://evil.com/api/webhooks/123456789/' + 'a'.repeat(40)),
    ).toBe(false);
    expect(
      DISCORD_WEBHOOK_RE.test(
        'https://discord.com.evil.com/api/webhooks/123456789/' + 'a'.repeat(40),
      ),
    ).toBe(false);
    expect(DISCORD_WEBHOOK_RE.test('https://169.254.169.254/')).toBe(false);
  });
});
