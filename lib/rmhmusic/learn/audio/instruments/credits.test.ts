/**
 * The licence notices that travel with the samples (CC BY 3.0 attribution, the guitar's MIT text)
 * are a legal obligation: the committed CREDITS.txt must be exactly what `credits.ts` generates.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  CREDITS_FILE,
  CREDIT_ORDER,
  SOUND_CREDITS,
  creditsText,
} from './credits';

const ROOT =
  join(
    __dirname,
    '../../../../..',
  );

describe('sound credits', () => {
  it('ship as CREDITS.txt beside the samples, generated from credits.ts (run the build with --credits)', () => {
    expect(
      readFileSync(
        join(
          ROOT,
          'public',
          CREDITS_FILE,
        ),
        'utf8',
      ),
    ).toBe(
      creditsText(),
    );
  });

  it('carry every attribution and the full MIT text', () => {
    const text =
      creditsText();
    for (const id of CREDIT_ORDER)
      expect(
        text,
      ).toContain(
        SOUND_CREDITS[
          id
        ]
          .attribution,
      );
    expect(
      text,
    ).toContain(
      'https://archive.org/details/SalamanderGrandPianoV3',
    );
    expect(
      text,
    ).toContain(
      'SFZ mapping by kinwie',
    );
    expect(
      text,
    ).toContain(
      'Additionally, all alterations which are distributed are to be attributed',
    );
    expect(
      text,
    ).toContain(
      'THE SOFTWARE IS PROVIDED "AS IS"',
    );
  });
});
