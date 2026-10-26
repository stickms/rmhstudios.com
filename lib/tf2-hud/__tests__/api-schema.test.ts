import { describe, expect, it } from 'vitest';
import { createHudSchema, manifestSchema, updateHudSchema } from '../api-schema';

const sha = 'a'.repeat(40);

describe('API schemas', () => {
  it('requires every entry to be exactly a file or a deletion', () => {
    expect(manifestSchema.safeParse([{ path: 'resource/a.res', sha1: sha }]).success).toBe(true);
    expect(manifestSchema.safeParse([{ path: 'resource/a.res', deleted: true }]).success).toBe(true);
    expect(manifestSchema.safeParse([{ path: 'resource/a.res' }]).success).toBe(false);
    expect(manifestSchema.safeParse([{ path: 'a', sha1: sha, deleted: true }]).success).toBe(false);
    expect(manifestSchema.safeParse([{ path: 'a', sha1: 'XYZ' }]).success).toBe(false);
  });

  it('bounds titles, tags and manifest size', () => {
    const base = { description: '', tags: [], visibility: 'PRIVATE', manifest: [], baseCommit: 'x' };
    expect(createHudSchema.safeParse({ ...base, title: 'ok' }).success).toBe(true);
    expect(createHudSchema.safeParse({ ...base, title: '' }).success).toBe(false);
    expect(createHudSchema.safeParse({ ...base, title: 'x'.repeat(81) }).success).toBe(false);
    expect(createHudSchema.safeParse({ ...base, title: 'ok', tags: ['<script>'] }).success).toBe(false);
    expect(createHudSchema.safeParse({ ...base, title: 'ok', visibility: 'ADMIN' }).success).toBe(false);
    const many = Array.from({ length: 5001 }, (_, i) => ({ path: `resource/${i}.res`, sha1: sha }));
    expect(manifestSchema.safeParse(many).success).toBe(false);
  });

  it('treats every update field as optional', () => {
    expect(updateHudSchema.safeParse({}).success).toBe(true);
    expect(updateHudSchema.safeParse({ autosave: true, visibility: 'PUBLIC' }).success).toBe(true);
  });
});
