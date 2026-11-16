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
import SOURCES from '../../../../../scripts/rmhmusic/sources.json';

interface SourceEntry {
  name: string;
  credit: string;
  homepage: string;
  archive?: {
    url: string;
    file: string;
  };
  zones: {
    src?: string;
    member?: string;
  }[];
}

/** Words a work line may use that name nothing (joining words, "version" before a date). */
const JOINING_WORDS =
  new Set(
    [
      'and',
      'from',
      'the',
      'version',
    ],
  );

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

  // The organ's work line once named the loud stop while the build shipped the quiet one: the
  // credit has to describe the recording the build actually fetches.
  it('name only what the build fetches: every word of a work line is in its sources.json entries', () => {
    const entries =
      Object.values(
        (
          SOURCES as unknown as {
            instruments: Record<
              string,
              SourceEntry
            >;
          }
        )
          .instruments,
      );
    for (const id of CREDIT_ORDER) {
      const mine =
        entries.filter(
          (
            e,
          ) =>
            e.credit ===
            id,
        );
      expect(
        mine.length,
        id,
      ).toBeGreaterThan(
        0,
      );
      // The name, the homepage and the fetched paths; not the zone notes, which also name
      // what was tried and rejected.
      const corpus =
        decodeURIComponent(
          mine
            .flatMap(
              (
                e,
              ) => [
                e.name,
                e.homepage,
                e
                  .archive
                  ?.url ??
                  '',
                e
                  .archive
                  ?.file ??
                  '',
                ...e.zones.map(
                  (
                    z,
                  ) =>
                    z.src ??
                    z.member ??
                    '',
                ),
              ],
            )
            .join(
              ' ',
            ),
        ).toLowerCase();
      const words =
        SOUND_CREDITS[
          id
        ].work
          .toLowerCase()
          .match(
            /[\p{L}\p{N}][\p{L}\p{N}.-]*/gu,
          ) ??
        [];
      const missing =
        words
          .map(
            (
              w,
            ) =>
              w.replace(
                /\.$/,
                '',
              ),
          )
          .filter(
            (
              w,
            ) =>
              w.length >=
                3 &&
              !JOINING_WORDS.has(
                w,
              ) &&
              !corpus.includes(
                w,
              ),
          );
      expect(
        missing,
        `${id}: ${SOUND_CREDITS[id].work}`,
      ).toEqual(
        [],
      );
    }
  });
});
