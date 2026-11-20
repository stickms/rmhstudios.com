import {
  describe,
  expect,
  it,
} from 'vitest';
import { loadFixture } from '../../test-support';
import { parseFirstTable } from './parse-first';
import { UnexpectedPageError } from './parse-school';

const html =
  loadFixture(
    'first.html',
  );

describe('parseFirstTable', () => {
  const {
    cycleYear,
    rows,
  } =
    parseFirstTable(
      html,
    );

  it('reads the cycle', () =>
    expect(
      cycleYear,
    ).toBe(
      2027,
    ));

  it('parses A.T. Still - Arizona', () => {
    const r =
      rows.find(
        (
          x,
        ) =>
          x.key ===
          'A.T. Still - Arizona',
      )!;
    expect(
      r.degree,
    ).toBe(
      'DO',
    );
    expect(
      r.reg,
    ).toEqual(
      {
        secondaryOn:
          '2026-05-22',
        interviewOn:
          '2026-07-31',
        acceptanceOn:
          '2026-08-25',
      },
    );
    expect(
      r
        .phd
        .secondaryOn,
    ).toBeNull();
  });

  it('degrees are MD or DO and counts match the fixture', () => {
    expect(
      rows.filter(
        (
          r,
        ) =>
          r.degree ===
          'MD',
      ),
    ).toHaveLength(
      182,
    );
    expect(
      rows.filter(
        (
          r,
        ) =>
          r.degree ===
          'DO',
      ),
    ).toHaveLength(
      56,
    );
  });

  it('keeps Canadian rows and decodes keys once', () => {
    expect(
      rows.some(
        (
          r,
        ) =>
          r.key ===
          'Toronto',
      ),
    ).toBe(
      true,
    );
    for (const r of rows)
      expect(
        r.key,
      ).not.toMatch(
        /%|&amp;/,
      );
  });

  it('throws on a missing table or a bad date', () => {
    expect(
      () =>
        parseFirstTable(
          '<html></html>',
        ),
    ).toThrow(
      UnexpectedPageError,
    );
    expect(
      () =>
        parseFirstTable(
          html.replace(
            '05/22/2026',
            '22 May',
          ),
        ),
    ).toThrow(
      UnexpectedPageError,
    );
  });
});
