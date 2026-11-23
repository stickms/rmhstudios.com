import { describe, expect, it } from 'vitest';
import { askBody } from './qa-schemas';

describe('askBody think (R20)', () => {
  it('is optional, and a boolean when present', () => {
    expect(askBody.parse({ question: 'What is the median?' }).think).toBeUndefined();
    expect(askBody.parse({ question: 'What is the median?', think: true }).think).toBe(true);
    expect(askBody.parse({ question: 'What is the median?', think: false }).think).toBe(false);
  });
  it('rejects anything that is not a boolean', () => {
    for (const think of ['true', 1, null, {}]) {
      expect(askBody.safeParse({ question: 'What is the median?', think }).success, String(think)).toBe(false);
    }
  });
});
