import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  isNetAddition,
  netLines,
} from '../../.github/scripts/check-net-lines.mjs';

describe('net-addition gate', () => {
  it('sums added and removed lines across files', () => {
    expect(
      netLines(
        '10\t2\ta.ts\n3\t0\tb.md\n',
      ),
    ).toEqual(
      {
        added: 13,
        removed: 2,
        net: 11,
      },
    );
  });

  it('counts binary files as zero', () => {
    expect(
      netLines(
        '-\t-\tlogo.png\n1\t0\ta.ts\n',
      ),
    ).toEqual(
      {
        added: 1,
        removed: 0,
        net: 1,
      },
    );
  });

  it('passes only when additions exceed deletions', () => {
    expect(
      isNetAddition(
        '5\t4\ta.ts\n',
      ),
    ).toBe(
      true,
    );
    expect(
      isNetAddition(
        '4\t4\ta.ts\n',
      ),
    ).toBe(
      false,
    );
    expect(
      isNetAddition(
        '0\t9\ta.ts\n',
      ),
    ).toBe(
      false,
    );
    expect(
      isNetAddition(
        '',
      ),
    ).toBe(
      false,
    );
  });
});
