import {
  describe,
  expect,
  it,
} from 'vitest';
import { SdnPageError } from './guard';
import { parseSummaryPage } from './parse-summary';
import { readFixture } from './test-fixtures';

describe('parseSummaryPage', () => {
  const s =
    parseSummaryPage(
      readFixture(
        'summary-columbia.html',
      ),
    );
  it('summary-columbia parses report count, modes and means', () => {
    expect(
      s.reports,
    ).toBe(
      12,
    );
    expect(
      s.fileType,
    ).toBe(
      'Open file',
    );
    expect(
      s.interviewStyle,
    ).toBe(
      'One-on-one',
    );
    expect(
      s.interviewLength,
    ).toMatch(
      /minutes$/,
    );
    expect(
      s.avgStress,
    ).toBeGreaterThan(
      0,
    );
    expect(
      s.avgStress,
    ).toBeLessThanOrEqual(
      10,
    );
    expect(
      s.avgImpression,
    ).toBeGreaterThanOrEqual(
      -1,
    );
    expect(
      s.avgImpression,
    ).toBeLessThanOrEqual(
      1,
    );
  });
  it('in-state counts come from the rendered card', () => {
    expect(
      [
        s.inStateCount,
        s.outOfStateCount,
      ],
    ).toEqual(
      [
        17,
        76,
      ],
    );
  });
  it('questionBlobs carries only questionsAsked', () => {
    expect(
      s
        .questionBlobs
        .length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      s
        .questionBlobs
        .length,
    ).toBeLessThanOrEqual(
      12,
    );
    expect(
      s
        .questionBlobs[0],
    ).toContain(
      'Most of the questions',
    );
  });
  it('no comments text, search text or report url appears anywhere in the result', () => {
    const dump =
      JSON.stringify(
        s,
      );
    expect(
      dump,
    ).not.toMatch(
      /comment-0\d\d|search-text-|reportUrl|survey\/individual/,
    );
    expect(
      Object.keys(
        s,
      ).sort(),
    ).toEqual(
      [
        'avgImpression',
        'avgStress',
        'fileType',
        'format',
        'inStateCount',
        'interviewLength',
        'interviewStyle',
        'outOfStateCount',
        'questionBlobs',
        'reports',
      ],
    );
  });
  it('the in-state counts are null when the card is absent', () => {
    const html =
      '<script type="application/json" id="interview-feedback-data">[]</script>';
    expect(
      parseSummaryPage(
        html,
      ),
    ).toMatchObject(
      {
        reports: 0,
        inStateCount:
          null,
        outOfStateCount:
          null,
        avgStress:
          null,
      },
    );
  });
  it('challenge or missing array throws', () => {
    expect(
      () =>
        parseSummaryPage(
          readFixture(
            'thread-challenge.html',
          ),
        ),
    ).toThrow(
      SdnPageError,
    );
    expect(
      () =>
        parseSummaryPage(
          '<script id="interview-feedback-data">{</script>',
        ),
    ).toThrow(
      SdnPageError,
    );
  });
});
