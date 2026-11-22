import { describe, expect, it } from 'vitest';
import { formatJson, jsonStats, sortKeysDeep, validateJson } from '@/lib/toolbox/json';

describe('validateJson', () => {
  it('accepts every kind of valid document', () => {
    for (const doc of ['{}', '[]', '0', '-1.5e+10', '"a\\u00e9\\n"', 'true', 'null', ' {"a":[1,{"b":null}]} ']) {
      expect(validateJson(doc), doc).toBeNull();
    }
  });

  it('agrees with JSON.parse on a set of broken documents', () => {
    for (const doc of [
      '{',
      '[1,]',
      '{"a":1,}',
      "{'a':1}",
      '01',
      '1.',
      '"\\x"',
      '[1 2]',
      '{"a" 1}',
      'tru',
      '"a\tb"',
      '{} x',
      '-',
    ]) {
      expect(() => JSON.parse(doc), doc).toThrow();
      expect(validateJson(doc), doc).not.toBeNull();
    }
  });

  it('reports the line, column and reason of the first error', () => {
    expect(validateJson('{\n  "a": 1,\n  "b" 2\n}')).toEqual({
      code: 'expected-colon',
      offset: 18,
      line: 3,
      column: 7,
      found: '2',
    });
    expect(validateJson('[1,2')).toMatchObject({ code: 'unexpected-end', line: 1, column: 5 });
    expect(validateJson('{"a":1} {}')).toMatchObject({ code: 'trailing-content', column: 9 });
    expect(validateJson('   ')).toMatchObject({ code: 'empty' });
    expect(validateJson('{1:2}')).toMatchObject({ code: 'expected-key', column: 2 });
    expect(validateJson('['.repeat(5000) + ']'.repeat(5000))).toMatchObject({ code: 'too-deep', column: 1001 });
  });
});

describe('formatJson', () => {
  it('indents, minifies and sorts', () => {
    const doc = '{"b":1,"a":[1,2]}';
    expect(formatJson(doc, '2')).toMatchObject({ ok: true, text: '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}' });
    expect(formatJson(doc, 'tab', true)).toMatchObject({
      ok: true,
      text: '{\n\t"a": [\n\t\t1,\n\t\t2\n\t],\n\t"b": 1\n}',
    });
    expect(formatJson(' { "b" : 1 } ', 'minify')).toMatchObject({ ok: true, text: '{"b":1}' });
  });

  it('returns the error instead of throwing', () => {
    expect(formatJson('{', '2')).toMatchObject({ ok: false, error: { code: 'unexpected-end' } });
  });
});

describe('sortKeysDeep', () => {
  it('sorts nested objects and keeps array order', () => {
    expect(JSON.stringify(sortKeysDeep({ z: { y: 1, x: 2 }, a: [{ d: 1, c: 2 }] }))).toBe(
      '{"a":[{"c":2,"d":1}],"z":{"x":2,"y":1}}',
    );
  });
});

describe('jsonStats', () => {
  it('counts every kind of value and the depth', () => {
    expect(jsonStats(JSON.parse('{"a":[1,"x",true,null,{"b":{}}]}'))).toEqual({
      objects: 3,
      arrays: 1,
      keys: 2,
      strings: 1,
      numbers: 1,
      booleans: 1,
      nulls: 1,
      depth: 4,
    });
    expect(jsonStats(5).depth).toBe(0);
  });

  it('survives very deep nesting', () => {
    const deep = JSON.parse('['.repeat(5000) + ']'.repeat(5000));
    expect(jsonStats(deep).depth).toBe(5000);
  });
});
