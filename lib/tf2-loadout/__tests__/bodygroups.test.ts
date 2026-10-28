import { describe, expect, it } from 'vitest';
import {
  bodygroupsOf,
  CLASS_BODYGROUP,
  classVariant,
  merge,
  selectionKey,
  showsSubmodel,
} from '../bodygroups';

describe('bodygroups', () => {
  it('shows submodel 0 of a group nothing selects, and only the selected one otherwise', () => {
    expect(showsSubmodel({}, 'hat', 0)).toBe(true);
    expect(showsSubmodel({}, 'hat', 1)).toBe(false);
    expect(showsSubmodel({ hat: 1 }, 'hat', 0)).toBe(false);
    expect(showsSubmodel({ hat: 1 }, 'hat', 1)).toBe(true);
    expect(showsSubmodel({ hat: 1 }, 'headphones', 0)).toBe(true);
  });

  it('merges what several worn items select, the higher submodel winning', () => {
    expect(merge([{ hat: 1 }, undefined, { hat: 2, shoes: 1 }])).toEqual({ hat: 2, shoes: 1 });
    expect(merge([])).toEqual({});
  });

  it("adds the worn style's groups to the item's own", () => {
    const item = {
      bg: { hat: 1 },
      st: [
        { k: 0, n: 'a' },
        { k: 1, n: 'b', bg: { headphones: 1 } },
      ],
    };
    expect(bodygroupsOf(item, 0)).toEqual({ hat: 1 });
    expect(bodygroupsOf(item, 1)).toEqual({ hat: 1, headphones: 1 });
    expect(bodygroupsOf(undefined, 1)).toBeUndefined();
  });

  it('keys a selection by its value, not its order', () => {
    expect(selectionKey({ b: 1, a: 2 })).toBe(selectionKey({ a: 2, b: 1 }));
    expect(selectionKey({ a: 1 })).not.toBe(selectionKey({ a: 2 }));
  });

  it("selects a per-class cosmetic's submodel by the wearer's class, as the game does (class number - 1)", () => {
    expect(classVariant('scout')).toEqual({ [CLASS_BODYGROUP]: 0 });
    expect(classVariant('demoman')).toEqual({ [CLASS_BODYGROUP]: 3 });
    expect(classVariant('spy')).toEqual({ [CLASS_BODYGROUP]: 8 });
    expect(classVariant(undefined)).toEqual({});
    expect(showsSubmodel(classVariant('heavy'), CLASS_BODYGROUP, 4)).toBe(true);
    expect(showsSubmodel(classVariant('heavy'), CLASS_BODYGROUP, 0)).toBe(false);
  });
});
