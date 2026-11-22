import { describe, expect, it } from 'vitest';
import {
  FOLDER_NAME_MAX,
  MAX_FOLDERS_PER_MEMBER,
  groupDecks,
  moveWithin,
  normalizeFolderName,
  sameFolderName,
  type DeckFolderSummary,
} from '@/lib/study/folders';
import { createFolderBody, moveDeckBody, updateFolderBody } from '@/lib/study/folders-schema';

const folder = (id: string, position: number): DeckFolderSummary => ({ id, name: id, position, collapsed: false });

describe('folder limits and names', () => {
  it('keeps the specified limits', () => {
    expect(MAX_FOLDERS_PER_MEMBER).toBe(30);
    expect(FOLDER_NAME_MAX).toBe(40);
  });

  it('trims, collapses whitespace and rejects empty or long names', () => {
    expect(normalizeFolderName('  Driving \n test ')).toBe('Driving test');
    expect(normalizeFolderName('   ')).toBeNull();
    expect(normalizeFolderName('x'.repeat(40))).toHaveLength(40);
    expect(normalizeFolderName('x'.repeat(41))).toBeNull();
  });

  it('compares names ignoring case', () => {
    expect(sameFolderName('Spanish', 'sPANISH')).toBe(true);
    expect(sameFolderName('Spanish', 'French')).toBe(false);
  });
});

describe('moveWithin', () => {
  it('moves one step and stops at the ends', () => {
    expect(moveWithin(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveWithin(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
    expect(moveWithin(['a', 'b', 'c'], 'a', 'up')).toEqual(['a', 'b', 'c']);
    expect(moveWithin(['a', 'b', 'c'], 'c', 'down')).toEqual(['a', 'b', 'c']);
  });
  it('returns null for an id that is not there and does not mutate its input', () => {
    const ids = ['a', 'b'];
    expect(moveWithin(ids, 'z', 'up')).toBeNull();
    moveWithin(ids, 'b', 'up');
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('groupDecks', () => {
  const decks = [
    { id: '1', folderId: 'f2', dueCount: 3 },
    { id: '2', folderId: null, dueCount: 1 },
    { id: '3', folderId: 'f1', dueCount: 0 },
    { id: '4', folderId: 'gone', dueCount: 2 },
    { id: '5', dueCount: 4 },
  ];
  it('lists folders in position order, empty ones too, then the decks with no folder', () => {
    const groups = groupDecks(decks, [folder('f2', 1), folder('f1', 0), folder('f3', 2)]);
    expect(groups.map((g) => g.folder?.id ?? null)).toEqual(['f1', 'f2', 'f3', null]);
    expect(groups.map((g) => g.decks.map((d) => d.id))).toEqual([['3'], ['1'], [], ['2', '4', '5']]);
  });
  it('sums due counts per group', () => {
    const groups = groupDecks(decks, [folder('f1', 0), folder('f2', 1)]);
    expect(groups.map((g) => g.due)).toEqual([0, 3, 7]);
  });
  it('with no folders is one flat group', () => {
    const groups = groupDecks(decks, []);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.folder).toBeNull();
    expect(groups[0]!.decks).toHaveLength(5);
  });
});

describe('request schemas', () => {
  it('create takes a trimmed name of 1 to 40 characters', () => {
    expect(createFolderBody.safeParse({ name: ' ok ' }).data).toEqual({ name: 'ok' });
    expect(createFolderBody.safeParse({ name: '' }).success).toBe(false);
    expect(createFolderBody.safeParse({ name: 'x'.repeat(41) }).success).toBe(false);
  });
  it('update takes exactly one change', () => {
    expect(updateFolderBody.safeParse({ collapsed: true }).success).toBe(true);
    expect(updateFolderBody.safeParse({ move: 'up' }).success).toBe(true);
    expect(updateFolderBody.safeParse({ name: 'A' }).success).toBe(true);
    expect(updateFolderBody.safeParse({}).success).toBe(false);
    expect(updateFolderBody.safeParse({ name: 'A', collapsed: true }).success).toBe(false);
    expect(updateFolderBody.safeParse({ move: 'sideways' }).success).toBe(false);
  });
  it('a deck move takes a folder id or null', () => {
    expect(moveDeckBody.safeParse({ folderId: null }).success).toBe(true);
    expect(moveDeckBody.safeParse({ folderId: 'abc_123' }).success).toBe(true);
    expect(moveDeckBody.safeParse({ folderId: 'a b' }).success).toBe(false);
    expect(moveDeckBody.safeParse({}).success).toBe(false);
  });
});
