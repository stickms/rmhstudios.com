import {
  describe,
  expect,
  it,
} from 'vitest';
import { focusOf } from './focus';

describe('where focus goes in a sprint run', () => {
  it('Start before the run, the sheet during it', () => {
    expect(
      focusOf(
        'ready',
      ),
    ).toBe(
      'start',
    );
    for (const k of [
      'countdown',
      'asking',
      'feedback',
    ] as const)
      expect(
        focusOf(
          k,
        ),
      ).toBe(
        'sheet',
      );
  });
  it('the end action once it can be pressed — not while saving, when Play again is disabled', () => {
    expect(
      focusOf(
        'saving',
      ),
    ).toBeNull();
    for (const k of [
      'complete',
      'saved',
      'failed',
      'signed-out',
    ] as const)
      expect(
        focusOf(
          k,
        ),
      ).toBe(
        'end',
      );
  });
});
