import { afterEach, describe, expect, it, vi } from 'vitest';
import { resumeReadinessError, resumeSubsystemReadiness } from './readiness.server';

const S3_VARS = ['S3_BUCKET', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

function setS3(): void {
  for (const v of S3_VARS) vi.stubEnv(v, 'configured');
}
function clearS3(): void {
  for (const v of S3_VARS) vi.stubEnv(v, '');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resumeSubsystemReadiness', () => {
  it('is ready when object storage and encryption key are configured', () => {
    setS3();
    vi.stubEnv('LADDER_RESUME_ENCRYPTION_KEY', 'a'.repeat(32));
    const r = resumeSubsystemReadiness();
    expect(r.ready).toBe(true);
    expect(r.objectStorageConfigured).toBe(true);
    expect(r.encryptionKeyConfigured).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('reports object storage missing', () => {
    clearS3();
    vi.stubEnv('LADDER_RESUME_ENCRYPTION_KEY', 'a'.repeat(32));
    const r = resumeSubsystemReadiness();
    expect(r.objectStorageConfigured).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.missing.some((m) => m.includes('object storage'))).toBe(true);
  });

  it('reports encryption key missing (production, no fallback)', () => {
    setS3();
    vi.stubEnv('LADDER_RESUME_ENCRYPTION_KEY', '');
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    const r = resumeSubsystemReadiness();
    expect(r.encryptionKeyConfigured).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.missing.some((m) => m.includes('LADDER_RESUME_ENCRYPTION_KEY'))).toBe(true);
  });

  it('is ready via the BETTER_AUTH_SECRET fallback in development', () => {
    setS3();
    vi.stubEnv('LADDER_RESUME_ENCRYPTION_KEY', '');
    vi.stubEnv('BETTER_AUTH_SECRET', 'x'.repeat(32));
    vi.stubEnv('NODE_ENV', 'development');
    const r = resumeSubsystemReadiness();
    expect(r.encryptionKeyConfigured).toBe(true);
    expect(r.ready).toBe(true);
  });
});

describe('resumeReadinessError', () => {
  it('is empty when ready', () => {
    expect(
      resumeReadinessError({
        ready: true,
        objectStorageConfigured: true,
        encryptionKeyConfigured: true,
        missing: [],
      }),
    ).toBe('');
  });

  it('names missing capabilities', () => {
    const msg = resumeReadinessError({
      ready: false,
      objectStorageConfigured: false,
      encryptionKeyConfigured: true,
      missing: ['object storage (S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)'],
    });
    expect(msg).toContain('object storage');
    expect(msg.toLowerCase()).toContain('not configured');
  });
});
