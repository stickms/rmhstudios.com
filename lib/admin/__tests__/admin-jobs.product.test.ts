/** s05-02 background jobs console: the pure shaping (queue order, error line, redaction, truncation, ids). */
import { describe, expect, it } from 'vitest';
import {
  MAX_ERROR_LINE,
  MAX_FIELD_BYTES,
  actionsFor,
  errorFirstLine,
  filterQueues,
  formatUtc,
  parseIdList,
  redactSecrets,
  sortQueues,
  toJsonField,
  truncateJson,
} from '@/lib/admin/jobs';

const q = (name: string, failed = 0) => ({
  name,
  failed,
});

describe('sortQueues', () => {
  it('puts queues with failures first, then orders each group by name', () => {
    const out = sortQueues([q('zeta'), q('beta', 2), q('alpha'), q('omega', 9), q('gamma')]);
    expect(out.map((x) => x.name)).toEqual(['beta', 'omega', 'alpha', 'gamma', 'zeta']);
  });
  it('does not mutate its input', () => {
    const input = [q('b'), q('a', 1)];
    sortQueues(input);
    expect(input.map((x) => x.name)).toEqual(['b', 'a']);
  });
});

describe('filterQueues', () => {
  it('narrows by name, ignoring case and surrounding space', () => {
    expect(filterQueues([q('digest.send'), q('Email.digest'), q('clean')], ' DIGEST ').map((x) => x.name)).toEqual([
      'digest.send',
      'Email.digest',
    ]);
    expect(filterQueues([q('a')], '')).toHaveLength(1);
  });
});

describe('errorFirstLine', () => {
  it('takes the first non-empty line of the message', () => {
    expect(
      errorFirstLine({
        message: '\n  Connection refused\n  at foo',
      }),
    ).toBe('Connection refused');
  });
  it('reads a bare string output', () => {
    expect(errorFirstLine('timeout\nstack')).toBe('timeout');
  });
  it('is null for no error, a non-text message or an empty one', () => {
    expect(errorFirstLine(null)).toBeNull();
    expect(
      errorFirstLine({
        ok: true,
      }),
    ).toBeNull();
    expect(
      errorFirstLine({
        message: 42,
      }),
    ).toBeNull();
    expect(errorFirstLine('  \n ')).toBeNull();
  });
  it('caps a long line with an ellipsis', () => {
    const line = errorFirstLine({
      message: 'x'.repeat(1000),
    })!;
    expect(line).toHaveLength(MAX_ERROR_LINE);
    expect(line.endsWith('…')).toBe(true);
  });
});

describe('redactSecrets', () => {
  it('masks secret-looking keys at any depth and leaves the rest', () => {
    expect(
      redactSecrets({
        to: 'a@b.c',
        Authorization: 'Bearer x',
        list: [
          {
            api_key: 'k',
            n: 1,
          },
        ],
        nested: {
          passwordHash: 'h',
        },
      }),
    ).toEqual({
      to: 'a@b.c',
      Authorization: '[redacted]',
      list: [
        {
          api_key: '[redacted]',
          n: 1,
        },
      ],
      nested: {
        passwordHash: '[redacted]',
      },
    });
  });
  it('stops at a bounded depth', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 20; i++)
      deep = {
        a: deep,
      };
    expect(JSON.stringify(redactSecrets(deep))).toContain('[too deep]');
  });
});

describe('truncateJson', () => {
  it('leaves small values whole and formats them indented', () => {
    expect(
      truncateJson({
        a: 1,
      }),
    ).toEqual({
      text: '{\n  "a": 1\n}',
      truncated: false,
    });
  });
  it('cuts at 8 KB of UTF-8 and says so', () => {
    const out = truncateJson({
      s: 'x'.repeat(50_000),
    });
    expect(out.truncated).toBe(true);
    expect(new TextEncoder().encode(out.text).length).toBeLessThanOrEqual(MAX_FIELD_BYTES);
  });
  it('never leaves half a character at the cut', () => {
    const out = truncateJson('é'.repeat(10_000), 101);
    expect(out.truncated).toBe(true);
    expect(out.text).not.toContain('�');
    expect(new TextEncoder().encode(out.text).length).toBeLessThanOrEqual(101);
  });
  it('writes undefined as null', () => {
    expect(truncateJson(undefined).text).toBe('null');
  });
});

describe('toJsonField', () => {
  it('is null for a missing value, redacted and capped otherwise', () => {
    expect(toJsonField(null)).toBeNull();
    expect(toJsonField(undefined)).toBeNull();
    expect(
      toJsonField({
        token: 't',
      })!.text,
    ).toContain('[redacted]');
  });
});

describe('formatUtc', () => {
  it('is a fixed UTC rendering, empty for nothing or a bad date', () => {
    expect(formatUtc('2026-11-21T14:03:11.456Z')).toBe('2026-11-21 14:03:11 UTC');
    expect(formatUtc(null)).toBe('');
    expect(formatUtc('nope')).toBe('');
  });
});

describe('parseIdList', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  it('lowercases, trims and de-duplicates', () => {
    expect(parseIdList(` ${id(1).toUpperCase()}, ${id(2)},${id(1)}`)).toEqual([id(1), id(2)]);
  });
  it('takes 100 and refuses 101, an empty entry and a non-UUID', () => {
    expect(
      parseIdList(
        Array.from(
          {
            length: 100,
          },
          (_, i) => id(i),
        ).join(','),
      ),
    ).toHaveLength(100);
    expect(
      parseIdList(
        Array.from(
          {
            length: 101,
          },
          (_, i) => id(i),
        ).join(','),
      ),
    ).toBeNull();
    expect(parseIdList('')).toBeNull();
    expect(parseIdList(`${id(1)},`)).toBeNull();
    expect(parseIdList('abc')).toBeNull();
  });
});

describe('actionsFor', () => {
  it('offers retry and delete on a failed job, cancel on a queued, retrying or active one', () => {
    expect(actionsFor('failed')).toEqual(['retry', 'delete']);
    expect(actionsFor('created')).toEqual(['cancel']);
    expect(actionsFor('retry')).toEqual(['cancel']);
    expect(actionsFor('active')).toEqual(['cancel']);
    expect(actionsFor('completed')).toEqual([]);
    expect(actionsFor('cancelled')).toEqual(['delete']);
  });
});
