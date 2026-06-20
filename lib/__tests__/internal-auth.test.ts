import { describe, it, expect } from 'vitest';
import { authorizeInternalRequest } from '@/lib/internal-auth';

describe('authorizeInternalRequest', () => {
  it('503 when no secret is configured (feature disabled)', () => {
    expect(authorizeInternalRequest('anything', undefined)).toEqual({ ok: false, status: 503 });
    expect(authorizeInternalRequest('anything', '')).toEqual({ ok: false, status: 503 });
  });
  it('401 when the header is missing', () => {
    expect(authorizeInternalRequest(null, 'sekret')).toEqual({ ok: false, status: 401 });
  });
  it('401 when the header does not match', () => {
    expect(authorizeInternalRequest('nope', 'sekret')).toEqual({ ok: false, status: 401 });
  });
  it('ok when the header matches', () => {
    expect(authorizeInternalRequest('sekret', 'sekret')).toEqual({ ok: true });
  });
});
