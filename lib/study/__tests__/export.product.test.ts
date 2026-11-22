import { describe, expect, it } from 'vitest';
import { buildExport, toCsv, toJson, toTsv } from '@/lib/study/export';
import { parseCards } from '@/lib/study/import';

const cards = [
  { front: 'hello', back: 'bonjour' },
  { front: 'a, b', back: 'has "quotes" and, commas' },
  { front: 'two\nlines', back: 'tab\there' },
  { front: '"quoted"', back: 'plain' },
];

describe('toTsv', () => {
  it('writes one tab-separated row per card', () => {
    expect(toTsv([{ front: 'a', back: 'b' }])).toBe('a\tb\n');
    expect(toTsv([])).toBe('');
  });

  it('round-trips exactly through the importer, tabs, quotes and newlines included', () => {
    const r = parseCards(toTsv(cards));
    expect(r.separator).toBe('tab');
    expect(r.rejected).toEqual([]);
    expect(r.cards).toEqual(cards);
  });

  it('re-exports the same text it imported', () => {
    const tsv = toTsv(cards);
    expect(toTsv(parseCards(tsv).cards)).toBe(tsv);
  });
});

describe('toCsv', () => {
  it('writes a header, CRLF rows and RFC 4180 quoting', () => {
    expect(toCsv([{ front: 'a, b', back: 'say "hi"' }])).toBe('front,back\r\n"a, b","say ""hi"""\r\n');
  });

  it('prefixes formula-looking cells with an apostrophe', () => {
    const csv = toCsv([
      { front: '=SUM(A1)', back: '+1' },
      { front: '-2', back: '@cmd' },
      { front: '\tx', back: '\rx' },
      { front: 'safe=ok', back: 'a-b' },
    ]);
    const rows = csv.split('\r\n');
    expect(rows[1]).toBe("'=SUM(A1),'+1");
    expect(rows[2]).toBe("'-2,'@cmd");
    expect(rows[3].startsWith("'\tx,")).toBe(true);
    expect(csv).toContain('safe=ok,a-b');
  });

  it('is read back by the importer, header skipped', () => {
    const r = parseCards(toCsv(cards), { separator: 'comma', hasHeader: true });
    expect(r.cards).toEqual(cards);
  });
});

describe('toJson', () => {
  it('has title, description and cards with only front and back', () => {
    const out = JSON.parse(toJson({ title: 'T', description: null, cards: [{ front: 'a', back: 'b' }] }));
    expect(out).toEqual({ title: 'T', description: '', cards: [{ front: 'a', back: 'b' }] });
  });
});

describe('buildExport', () => {
  it('names the file after the deck and picks the MIME type', () => {
    const deck = { title: 'Café Français 101!', description: null, cards: [] };
    expect(buildExport('tsv', deck).filename).toBe('cafe-francais-101.tsv');
    expect(buildExport('csv', deck).mime).toContain('text/csv');
    expect(buildExport('json', deck).filename.endsWith('.json')).toBe(true);
    expect(buildExport('csv', { ...deck, title: '***' }).filename).toBe('deck.csv');
  });
});
