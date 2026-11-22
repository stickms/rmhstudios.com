import { describe, expect, it } from 'vitest';
import { patchScheduledSchema } from '../scheduled-schema';
import { MAX_IMAGE_ALT_LENGTH } from '@/lib/rmhark-limits';

describe('patchScheduledSchema (edit dialog fields)', () => {
  it('accepts imageAlts, a warning reason, null to clear it, and isSensitive', () => {
    expect(
      patchScheduledSchema.safeParse({ imageAlts: ['a', ''], contentWarning: 'spoilers', isSensitive: true }).success,
    ).toBe(true);
    expect(patchScheduledSchema.safeParse({ contentWarning: null, isSensitive: false }).success).toBe(true);
    expect(patchScheduledSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a description at the composer bound and rejects one over it', () => {
    expect(patchScheduledSchema.safeParse({ imageAlts: ['x'.repeat(MAX_IMAGE_ALT_LENGTH)] }).success).toBe(true);
    expect(patchScheduledSchema.safeParse({ imageAlts: ['x'.repeat(MAX_IMAGE_ALT_LENGTH + 1)] }).success).toBe(false);
  });

  it('accepts four descriptions and rejects five (a post carries at most four images)', () => {
    expect(patchScheduledSchema.safeParse({ imageAlts: ['a', 'b', 'c', 'd'] }).success).toBe(true);
    expect(patchScheduledSchema.safeParse({ imageAlts: ['a', 'b', 'c', 'd', 'e'] }).success).toBe(false);
  });

  it('rejects a blank, multi-line or over-long warning reason', () => {
    expect(patchScheduledSchema.safeParse({ contentWarning: '   ' }).success).toBe(false);
    expect(patchScheduledSchema.safeParse({ contentWarning: 'a\nb' }).success).toBe(false);
    expect(patchScheduledSchema.safeParse({ contentWarning: 'x'.repeat(400) }).success).toBe(false);
  });
});

describe('an edit bumps updatedAt', () => {
  it('ScheduledPost.updatedAt is @updatedAt, so updateMany in updateScheduledPost re-arms the refused-draft gate', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const schema = readFileSync(join(__dirname, '../../../prisma/schema/social.prisma'), 'utf8');
    const model = schema.slice(schema.indexOf('model ScheduledPost'));
    expect(model.slice(0, model.indexOf('\n}'))).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);
  });
});
