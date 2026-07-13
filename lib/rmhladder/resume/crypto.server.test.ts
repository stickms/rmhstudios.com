import { describe, expect, it } from 'vitest';
import { decryptResumeFile, decryptResumeText, encryptResumeFile, encryptResumeText } from './crypto.server';

describe('resume text encryption', () => {
  const secret = 'test-only-resume-encryption-secret-that-is-long-enough';

  it('round-trips with authenticated context and randomized ciphertext', () => {
    const first = encryptResumeText('private resume text', { secret, aad: 'user:version' });
    const second = encryptResumeText('private resume text', { secret, aad: 'user:version' });
    expect(first).not.toBe(second);
    expect(decryptResumeText(first, { secret, aad: 'user:version' })).toBe('private resume text');
  });

  it('rejects the wrong owner context', () => {
    const encrypted = encryptResumeText('private', { secret, aad: 'owner-a' });
    expect(() => decryptResumeText(encrypted, { secret, aad: 'owner-b' })).toThrow();
  });

  it('encrypts uploaded file bytes at rest', () => {
    const original = Buffer.from('%PDF-1.7 private resume');
    const encrypted = encryptResumeFile(original, { secret, aad: 'owner:file' });
    expect(encrypted.includes(original)).toBe(false);
    expect(decryptResumeFile(encrypted, { secret, aad: 'owner:file' })).toEqual(original);
  });
});
