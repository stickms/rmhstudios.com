import { describe, it, expect } from 'vitest';
import { ORPHAN_TTL_MS } from '@/lib/media/sweep-policy';
import { MEDIA_MAX_BYTES, MAX_MEDIA_PER_POST, validateUpload, attachError } from '@/lib/media/policy';

// Minimal valid magic-byte buffers.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
const JUNK = Buffer.from([0x00, 0x01, 0x02, 0x03]);

describe('validateUpload', () => {
  it('accepts a png and returns its ext', () => {
    expect(validateUpload(PNG)).toEqual({
      ok: true,
      ext: '.png',
    });
  });

  it('rejects oversize buffers', () => {
    const big = Buffer.alloc(MEDIA_MAX_BYTES + 1);
    PNG.copy(big); // valid signature, but too large
    const res = validateUpload(big);
    expect(res.ok).toBe(false);
  });

  it('rejects unknown formats', () => {
    const res = validateUpload(JUNK);
    expect(res.ok).toBe(false);
  });
});

describe('attachError', () => {
  it('returns null when owned and pending', () => {
    expect(
      attachError(
        {
          userId: 'u1',
          status: 'PENDING',
        },
        'u1',
      ),
    ).toBeNull();
  });
  it('rejects missing media', () => {
    expect(attachError(null, 'u1')).toMatch(/not found/i);
  });
  it('rejects foreign-owned media', () => {
    expect(
      attachError(
        {
          userId: 'u2',
          status: 'PENDING',
        },
        'u1',
      ),
    ).toMatch(/not found/i);
  });
  it('rejects already-attached media', () => {
    expect(
      attachError(
        {
          userId: 'u1',
          status: 'ATTACHED',
        },
        'u1',
      ),
    ).toMatch(/already/i);
  });

  it('rejects a pending upload older than the sweep threshold (the scheduled-draft and API attach check)', () => {
    const now = new Date('2026-06-22T12:00:00.000Z');
    const at = (ms: number) => ({ userId: 'u1', status: 'PENDING', createdAt: new Date(now.getTime() - ms) });
    expect(attachError(at(ORPHAN_TTL_MS + 1), 'u1', now)).toMatch(/not found/i);
    expect(attachError(at(ORPHAN_TTL_MS), 'u1', now)).toBeNull();
  });

  it('MAX_MEDIA_PER_POST is 4', () => {
    expect(MAX_MEDIA_PER_POST).toBe(4);
  });
});
