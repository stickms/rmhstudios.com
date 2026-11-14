import {
  describe,
  expect,
  it,
} from 'vitest';
import { pickNativeClip } from './sourceModels';

describe('pickNativeClip', () => {
  it('takes the first preferred clip the class has', () => {
    expect(
      pickNativeClip(
        [
          'run_primary',
          'run_melee',
        ],
        [
          'run_melee',
          'run_primary',
        ],
      ),
    ).toBe(
      'run_melee',
    );
    expect(
      pickNativeClip(
        [
          'run_secondary',
        ],
        [
          'run_melee',
          'run_primary',
          'run_secondary',
        ],
      ),
    ).toBe(
      'run_secondary',
    );
  });
  it('returns null when the index or clip is missing', () => {
    expect(
      pickNativeClip(
        undefined,
        [
          'run_melee',
        ],
      ),
    ).toBeNull();
    expect(
      pickNativeClip(
        [
          'stand_melee',
        ],
        [
          'run_melee',
        ],
      ),
    ).toBeNull();
  });
});
