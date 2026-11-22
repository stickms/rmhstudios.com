import { describe, expect, it } from 'vitest';
import { detectDelimiter, inferValue, jsonToRows, parseCsv, rowsToJson, writeCsv } from '@/lib/toolbox/csv';

describe('parseCsv', () => {
  it('reads quoted fields with delimiters, doubled quotes and line breaks', () => {
    const { rows } = parseCsv('name,quote\r\n"Smith, J","He said ""hi""\nthen left"\r\nLee,ok');
    expect(rows).toEqual([
      ['name', 'quote'],
      ['Smith, J', 'He said "hi"\nthen left'],
      ['Lee', 'ok'],
    ]);
  });

  it('keeps empty fields, skips blank lines and strips a BOM', () => {
    expect(parseCsv('\uFEFFa,,c\n\n,b,\n').rows).toEqual([
      ['a', '', 'c'],
      ['', 'b', ''],
    ]);
  });

  it('reports an unterminated quote with its line', () => {
    const r = parseCsv('a,b\n"open,field\nmore');
    expect(r.unterminatedQuoteAt).toEqual({ line: 2 });
  });

  it('takes any delimiter', () => {
    expect(parseCsv('a;b\n1;2', ';').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('detectDelimiter', () => {
  it('finds semicolon, tab, pipe and comma', () => {
    expect(detectDelimiter('a;b;c\n1;2,5;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectDelimiter('a|b\n1|2')).toBe('|');
    expect(detectDelimiter('a,b\n1,2')).toBe(',');
    expect(detectDelimiter('single column')).toBe(',');
  });
});

describe('writeCsv', () => {
  it('quotes only what needs it and round-trips', () => {
    const rows = [
      ['plain', 'with,comma', 'with "quote"', 'line\nbreak', ' padded '],
      ['', 'x', 'y', 'z', 'w'],
    ];
    const text = writeCsv(rows);
    expect(text.split('\r\n')[0]).toBe('plain,"with,comma","with ""quote""","line\nbreak"," padded "');
    expect(parseCsv(text).rows).toEqual(rows);
  });
});

describe('rowsToJson', () => {
  it('keys rows by a header, renaming duplicate and blank names', () => {
    expect(
      rowsToJson([
        ['id', 'id', ''],
        ['1', '2', '3'],
      ]),
    ).toEqual([{ id: '1', id_2: '2', column3: '3' }]);
  });

  it('infers numbers, booleans and nulls when asked', () => {
    expect(
      rowsToJson(
        [
          ['n', 'b', 'e', 's'],
          ['1.5', 'true', '', '007'],
        ],
        { infer: true },
      ),
    ).toEqual([{ n: 1.5, b: true, e: null, s: '007' }]);
    expect(inferValue('12345678901234567890')).toBe('12345678901234567890');
  });

  it('writes arrays without a header', () => {
    expect(rowsToJson([['a', 'b']], { header: false })).toEqual([['a', 'b']]);
  });
});

describe('jsonToRows', () => {
  it('writes the union of keys as a header and nested values as JSON', () => {
    expect(jsonToRows('[{"a":1,"b":{"x":true}},{"c":null,"a":"two"}]')).toEqual({
      ok: true,
      rows: [
        ['a', 'b', 'c'],
        ['1', '{"x":true}', ''],
        ['two', '', ''],
      ],
    });
  });

  it('accepts arrays of arrays and rejects what is not an array', () => {
    expect(jsonToRows('[[1,2],[3]]')).toEqual({ ok: true, rows: [['1', '2'], ['3']] });
    expect(jsonToRows('{"a":1}')).toEqual({ ok: false, reason: 'not-array' });
    expect(jsonToRows('{')).toEqual({ ok: false, reason: 'invalid-json' });
  });
});
