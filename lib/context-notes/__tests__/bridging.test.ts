import { describe, expect, it } from 'vitest';
import { shouldShowNote, type RaterHistory } from '../bridging';

const ids = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
const rater = (answers: boolean[]) => new Map(ids.map((id, i) => [id, answers[i]]));

describe('shouldShowNote', () => {
  const left = rater([true, true, true, false, false, true]);
  const right = rater([false, false, false, true, true, false]);
  const left2 = rater([true, true, true, false, false, false]);
  const history: RaterHistory = new Map([
    ['a', left],
    ['b', right],
    ['c', left2],
  ]);

  it('shows a note rated helpful by raters who usually disagree', () => {
    expect(shouldShowNote({ helpfulRaters: ['a', 'b', 'c'], notHelpfulCount: 0, history })).toBe(
      true,
    );
  });

  it('hides a note whose helpful raters always agree with each other', () => {
    expect(shouldShowNote({ helpfulRaters: ['a', 'c', 'a'], notHelpfulCount: 0, history })).toBe(
      false,
    );
  });

  it('needs the minimum count and ratio', () => {
    expect(shouldShowNote({ helpfulRaters: ['a', 'b'], notHelpfulCount: 0, history })).toBe(false);
    expect(shouldShowNote({ helpfulRaters: ['a', 'b', 'c'], notHelpfulCount: 5, history })).toBe(
      false,
    );
  });

  it('ignores raters with no history (cannot prove they disagree)', () => {
    expect(
      shouldShowNote({ helpfulRaters: ['x', 'y', 'z'], notHelpfulCount: 0, history: new Map() }),
    ).toBe(false);
  });
});
