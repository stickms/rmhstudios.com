/**
 * Cloudflare Turnstile switches on only with both keys, guards exactly sign-up and "Forgot password?" (never
 * sign-in, which the per-address limit guards), and the client sends its token in the header Better Auth's
 * captcha plugin reads.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPTCHA_HEADER, TURNSTILE_ENDPOINTS } from '@/lib/auth/turnstile';
import { turnstileSecretKey, turnstileSiteKey } from '@/lib/auth/turnstile.server';

afterEach(() => vi.unstubAllEnvs());

describe('turnstile configuration', () => {
  it('is off unless both keys are set', () => {
    vi.stubEnv('TURNSTILE_SITE_KEY', 'site');
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    expect(turnstileSiteKey()).toBeNull();
    expect(turnstileSecretKey()).toBeNull();
    vi.stubEnv('TURNSTILE_SITE_KEY', ' ');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    expect(turnstileSiteKey()).toBeNull();
  });

  it('is on with both keys', () => {
    vi.stubEnv('TURNSTILE_SITE_KEY', 'site');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    expect(turnstileSiteKey()).toBe('site');
    expect(turnstileSecretKey()).toBe('secret');
  });

  it('guards sign-up and password reset only', () => {
    expect([...TURNSTILE_ENDPOINTS].sort()).toEqual(['/request-password-reset', '/sign-up/email']);
  });

  it("uses the header Better Auth's captcha plugin reads", () => {
    expect(CAPTCHA_HEADER).toBe('x-captcha-response');
  });
});
