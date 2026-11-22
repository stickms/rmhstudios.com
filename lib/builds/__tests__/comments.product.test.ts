import { describe, expect, it } from 'vitest';
import { COMMENT_EDIT_WINDOW_MS, commentRights, visibleComment, withinEditWindow } from '@/lib/builds/comments';

const now = new Date('2026-11-20T12:00:00Z');
const base = {
  userId: 'author',
  createdAt: new Date(now.getTime() - 60_000),
  deletedAt: null,
  hiddenAt: null,
};
const viewer = (userId: string | null, isAdmin = false) => ({
  userId,
  isAdmin,
  buildOwnerId: 'creator',
});

describe('commentRights', () => {
  it('the author edits inside the window, not after, and deletes any time', () => {
    expect(commentRights(base, viewer('author'), now)).toEqual({
      canEdit: true,
      canDelete: true,
      canHide: false,
      canReport: false,
    });
    const old = {
      ...base,
      createdAt: new Date(now.getTime() - COMMENT_EDIT_WINDOW_MS - 1),
    };
    expect(commentRights(old, viewer('author'), now)).toMatchObject({
      canEdit: false,
      canDelete: true,
    });
  });
  it('the window is 30 minutes inclusive', () => {
    expect(withinEditWindow(new Date(now.getTime() - 30 * 60_000), now)).toBe(true);
    expect(withinEditWindow(new Date(now.getTime() - 30 * 60_000 - 1), now)).toBe(false);
  });
  it('the creator hides and reports but does not edit or delete others', () => {
    expect(commentRights(base, viewer('creator'), now)).toEqual({
      canEdit: false,
      canDelete: false,
      canHide: true,
      canReport: true,
    });
  });
  it('the creator cannot hide their own comment', () => {
    expect(
      commentRights(
        {
          ...base,
          userId: 'creator',
        },
        viewer('creator'),
        now,
      ).canHide,
    ).toBe(false);
  });
  it('an admin deletes and reports', () => {
    expect(commentRights(base, viewer('admin', true), now)).toEqual({
      canEdit: false,
      canDelete: true,
      canHide: false,
      canReport: true,
    });
  });
  it('another member only reports, and a signed-out viewer or a deleted comment has nothing', () => {
    expect(commentRights(base, viewer('other'), now)).toEqual({
      canEdit: false,
      canDelete: false,
      canHide: false,
      canReport: true,
    });
    expect(commentRights(base, viewer(null), now)).toEqual({
      canEdit: false,
      canDelete: false,
      canHide: false,
      canReport: false,
    });
    expect(
      commentRights(
        {
          ...base,
          deletedAt: now,
        },
        viewer('author'),
        now,
      ).canDelete,
    ).toBe(false);
  });
});

describe('visibleComment', () => {
  it('shows a normal comment', () => {
    expect(visibleComment(base, 'x', false)).toEqual({
      state: 'visible',
      showContent: true,
    });
  });
  it('a deleted comment is dropped, or a placeholder with no text when it has replies', () => {
    const d = {
      ...base,
      deletedAt: now,
    };
    expect(visibleComment(d, 'x', false)).toBeNull();
    expect(visibleComment(d, 'x', true)).toEqual({
      state: 'deleted',
      showContent: false,
    });
  });
  it('a hidden comment is collapsed for everyone but its author', () => {
    const h = {
      ...base,
      hiddenAt: now,
    };
    expect(visibleComment(h, 'x', false)).toEqual({
      state: 'hidden',
      showContent: true,
    });
    expect(visibleComment(h, null, false)?.state).toBe('hidden');
    expect(visibleComment(h, 'author', false)).toEqual({
      state: 'hidden-own',
      showContent: true,
    });
  });
  it('delete wins over hide', () => {
    expect(
      visibleComment(
        {
          ...base,
          hiddenAt: now,
          deletedAt: now,
        },
        'x',
        false,
      ),
    ).toBeNull();
  });
});
