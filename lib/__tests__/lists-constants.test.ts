import { describe, it, expect } from 'vitest';
import {
  listCreateSchema,
  listUpdateSchema,
  listMemberSchema,
  MAX_LISTS,
  MAX_MEMBERS,
} from '@/lib/lists/constants';

describe('list schemas', () => {
  it('validates create', () => {
    expect(listCreateSchema.safeParse({ name: 'Game devs' }).success).toBe(true);
    expect(listCreateSchema.safeParse({ name: 'x', visibility: 'UNLISTED' }).success).toBe(true);
    expect(listCreateSchema.safeParse({ name: '' }).success).toBe(false);
    expect(listCreateSchema.safeParse({ name: 'x', visibility: 'PUBLIC' }).success).toBe(false); // gated
  });

  it('validates update + member', () => {
    expect(listUpdateSchema.safeParse({ pinned: true }).success).toBe(true);
    expect(listUpdateSchema.safeParse({ bio: null }).success).toBe(true);
    expect(listMemberSchema.safeParse({ userId: 'u1' }).success).toBe(true);
    expect(listMemberSchema.safeParse({ userId: '' }).success).toBe(false);
  });

  it('exposes sane caps', () => {
    expect(MAX_LISTS).toBeGreaterThan(0);
    expect(MAX_MEMBERS).toBeGreaterThan(MAX_LISTS);
  });
});
