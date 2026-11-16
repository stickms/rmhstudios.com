/**
 * The learner's instrument and range as the layout route reads them for the placeholders (one
 * select on `music_learn_profile`): a stale or missing column must never reach the UI.
 */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  DEFAULT_LEARNER_SHAPE,
  toLearnerShape,
} from './learner-shape';

describe('toLearnerShape', () => {
  it('passes a stored instrument and range through', () => {
    expect(
      toLearnerShape(
        {
          instrument:
            'voice',
          voiceRange:
            'alto',
        },
      ),
    ).toEqual(
      {
        instrument:
          'voice',
        voiceRange:
          'alto',
      },
    );
    expect(
      toLearnerShape(
        {
          instrument:
            'guitar',
          voiceRange:
            null,
        },
      ),
    ).toEqual(
      {
        instrument:
          'guitar',
        voiceRange:
          null,
      },
    );
  });

  it('a learner with no profile is a pianist with no range; unknown values fall back', () => {
    expect(
      toLearnerShape(
        null,
      ),
    ).toEqual(
      DEFAULT_LEARNER_SHAPE,
    );
    expect(
      DEFAULT_LEARNER_SHAPE,
    ).toEqual(
      {
        instrument:
          'piano',
        voiceRange:
          null,
      },
    );
    expect(
      toLearnerShape(
        {
          instrument:
            'banjo',
          voiceRange:
            'mezzo',
        },
      ),
    ).toEqual(
      DEFAULT_LEARNER_SHAPE,
    );
  });
});
