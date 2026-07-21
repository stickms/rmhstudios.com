import { describe, it, expect } from 'vitest';
import { withRateLimit } from '@/lib/rate-limit';

// getClientIp reads cf-connecting-ip first, so this pins the derived key.
function reqFrom(ip: string): Request {
  return new Request('https://example.com/api/x', { headers: { 'cf-connecting-ip': ip } });
}

// Exhaust a bucket (effective ceiling is limit × RATE_LIMIT_MULTIPLIER, so a few
// dozen calls trips any small limit regardless of the configured multiplier).
function drain(req: Request, prefix: string, scope?: string): Response | null {
  let blocked: Response | null = null;
  for (let i = 0; i < 60 && !blocked; i++) {
    blocked = withRateLimit(req, 'write', { limit: 1, prefix, scope });
  }
  return blocked;
}

describe('withRateLimit', () => {
  it('allows under the limit, then returns a ready 429 Response with headers', () => {
    const req = reqFrom('10.0.0.1');
    expect(withRateLimit(req, 'write', { limit: 1, prefix: 'wr-a' })).toBeNull();
    const blocked = drain(req, 'wr-a');
    expect(blocked).toBeInstanceOf(Response);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('Retry-After')).toBeTruthy();
    expect(blocked?.headers.get('X-RateLimit-Limit')).toBeTruthy();
    expect(blocked?.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('keys per client IP — one IP hitting the wall does not block another', () => {
    expect(drain(reqFrom('10.0.0.2'), 'wr-b')).toBeInstanceOf(Response);
    expect(withRateLimit(reqFrom('10.0.0.3'), 'write', { limit: 1, prefix: 'wr-b' })).toBeNull();
  });

  it('scope adds a per-subject dimension over the same IP', () => {
    const req = reqFrom('10.0.0.4');
    expect(drain(req, 'wr-c', 'userA')).toBeInstanceOf(Response);
    // Same IP, different scope → independent bucket, still allowed.
    expect(withRateLimit(req, 'write', { limit: 1, prefix: 'wr-c', scope: 'userB' })).toBeNull();
  });
});
