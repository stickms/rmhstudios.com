import { describe, it, expect } from 'vitest';
import { choicePathHash, type ChoicePathEntry } from '../choice-path';

describe('choicePathHash', () => {
  it('returns empty string for an empty path', () => {
    expect(choicePathHash([])).toBe('');
  });

  it('is deterministic for the same path', () => {
    const path: ChoicePathEntry[] = [
      { chapter: 0, tone: 'kind' },
      { chapter: 1, tone: 'bold' },
    ];
    expect(choicePathHash(path)).toBe(choicePathHash([...path]));
  });

  it('is order-sensitive', () => {
    const a: ChoicePathEntry[] = [{ chapter: 0, tone: 'kind' }, { chapter: 1, tone: 'bold' }];
    const b: ChoicePathEntry[] = [{ chapter: 1, tone: 'bold' }, { chapter: 0, tone: 'kind' }];
    expect(choicePathHash(a)).not.toBe(choicePathHash(b));
  });

  it('differs when a tone differs', () => {
    const a: ChoicePathEntry[] = [{ chapter: 0, tone: 'kind' }];
    const b: ChoicePathEntry[] = [{ chapter: 0, tone: 'guarded' }];
    expect(choicePathHash(a)).not.toBe(choicePathHash(b));
  });

  it('distinguishes same-tone options by label (direction/text)', () => {
    const a: ChoicePathEntry[] = [{ chapter: 0, tone: 'honest', label: 'open up about your loss' }];
    const b: ChoicePathEntry[] = [{ chapter: 0, tone: 'honest', label: 'deflect with a joke' }];
    expect(choicePathHash(a)).not.toBe(choicePathHash(b));
  });
});
