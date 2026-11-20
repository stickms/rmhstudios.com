import {
  describe,
  expect,
  it,
} from 'vitest';
import { loadFixture } from '../../test-support';
import {
  parseSchoolPage,
  UnexpectedPageError,
} from './parse-school';
import { parseSummaryJson } from './parse-summary';

const yaleJson =
  JSON.parse(
    loadFixture(
      'yale-summary.json',
    ),
  ) as unknown;

describe('parseSummaryJson', () => {
  it('matches the school page daily table for the same cycle', () => {
    const [
      table,
      ...rest
    ] =
      parseSummaryJson(
        yaleJson,
      );
    expect(
      rest,
    ).toEqual(
      [],
    );
    expect(
      table,
    ).toMatchObject(
      {
        program:
          'REG',
        cycleYear: 2027,
      },
    );
    const page =
      parseSchoolPage(
        loadFixture(
          'yale.html',
        ),
        'Yale',
      );
    const html =
      page.tables.find(
        (
          t,
        ) =>
          t.program ===
            'REG' &&
          t.cycleYear ===
            2027,
      )!;
    expect(
      table!
        .counts,
    ).toEqual(
      html.counts,
    );
  });

  it('unavailable data is no table, not zero', () => {
    expect(
      parseSummaryJson(
        {
          ...(yaleJson as object),
          availability:
            'unavailable',
          daily:
            [],
        },
      ),
    ).toEqual(
      [],
    );
  });

  it('wrong shape or negative count throws', () => {
    expect(
      () =>
        parseSummaryJson(
          {},
        ),
    ).toThrow(
      UnexpectedPageError,
    );
    expect(
      () =>
        parseSummaryJson(
          null,
        ),
    ).toThrow(
      UnexpectedPageError,
    );
    const bad =
      JSON.parse(
        JSON.stringify(
          yaleJson,
        ),
      ) as {
        daily: {
          observationCounts: Record<
            string,
            number
          >;
        }[];
      };
    bad.daily[0]!.observationCounts.Secondary =
      -1;
    expect(
      () =>
        parseSummaryJson(
          bad,
        ),
    ).toThrow(
      UnexpectedPageError,
    );
  });
});
