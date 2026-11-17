import { describe, it, expect } from 'vitest';
import { planVibeWrite, canEditVibe } from '../ownership';

describe('planVibeWrite', () => {
  it('creates when there is no existing page', () => {
    expect(planVibeWrite({ existing: null, userId: 'u1', fromVersionId: null })).toEqual({
      mode: 'create',
    });
  });
  it('lets the owner edit', () => {
    expect(
      planVibeWrite({ existing: { id: 'p', ownerId: 'u1' }, userId: 'u1', fromVersionId: null }),
    ).toEqual({ mode: 'edit', pageId: 'p' });
  });
  it('remixes for another user', () => {
    expect(
      planVibeWrite({ existing: { id: 'p', ownerId: 'u1' }, userId: 'u2', fromVersionId: null }),
    ).toEqual({ mode: 'remix', sourcePageId: 'p', sourceVersionId: null });
  });
  it('remixes when signed out, owned or not', () => {
    expect(
      planVibeWrite({ existing: { id: 'p', ownerId: 'u1' }, userId: null, fromVersionId: null }).mode,
    ).toBe('remix');
    expect(
      planVibeWrite({ existing: { id: 'p', ownerId: null }, userId: null, fromVersionId: null }).mode,
    ).toBe('remix');
  });
  it('remixes an unowned page for a signed-in user', () => {
    expect(
      planVibeWrite({ existing: { id: 'p', ownerId: null }, userId: 'u1', fromVersionId: null }).mode,
    ).toBe('remix');
  });
  it('carries the source version into a remix', () => {
    expect(
      planVibeWrite({ existing: { id: 'p', ownerId: 'u1' }, userId: 'u2', fromVersionId: 'v3' }),
    ).toEqual({ mode: 'remix', sourcePageId: 'p', sourceVersionId: 'v3' });
  });
});

describe('canEditVibe', () => {
  it('is true only for the owner', () => {
    expect(canEditVibe('u1', 'u1')).toBe(true);
    expect(canEditVibe('u1', 'u2')).toBe(false);
    expect(canEditVibe('u1', null)).toBe(false);
    expect(canEditVibe(null, null)).toBe(false);
    expect(canEditVibe(null, 'u1')).toBe(false);
  });
});
