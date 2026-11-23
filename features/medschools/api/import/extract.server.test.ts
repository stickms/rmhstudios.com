import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors/codes';
import { IMPORT_LIMITS } from '../../engine/import';
import { extractFile, extractPasted, parseCsv } from './extract.server';
import { serialToIso } from './xlsx.server';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name));
const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  csv: 'text/csv',
  txt: 'text/plain',
};
const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as AppError).code;

describe('extraction from the committed fixtures', () => {
  it('xlsx: first sheet rows with " | " between cells, date cells as ISO days, later sheets under their names', async () => {
    const r = await extractFile({ buffer: fixture('cycle.xlsx'), mimeType: MIME.xlsx, filename: 'cycle.xlsx' });
    expect(r.kind).toBe('xlsx');
    expect(r.text).toContain('Sheet: Cycle 2027');
    expect(r.text).toContain('School | Program | Submitted | Complete | Secondary received | Interview | Decision');
    // 46185 in a date-formatted cell is 2026-06-12, not the serial.
    expect(r.text).toContain('Harvard Medical School | MD | 2026-06-12 | 2026-07-08 | 2026-07-20 | 2026-10-05 | Accepted 2026-12-15');
    expect(r.text).not.toContain('46185');
    expect(r.text).toContain('Sheet: Notes');
    expect(r.text).toContain('Nothing here has a school in it');
    expect(r.truncated).toBe(false);
  });

  it('csv: rows, quoted cells and empty cells', async () => {
    const r = await extractFile({ buffer: fixture('cycle.csv'), mimeType: MIME.csv, filename: 'cycle.csv' });
    expect(r.text.split('\n')).toHaveLength(4);
    expect(r.text).toContain('Johns Hopkins University School of Medicine | MD | 2026-06-12 | 2026-07-09 | 2026-08-01');
  });

  it('docx: paragraphs, and a table keeps its rows and cells', async () => {
    const r = await extractFile({ buffer: fixture('cycle.docx'), mimeType: MIME.docx, filename: 'cycle.docx' });
    expect(r.text).toContain('Why medicine?');
    expect(r.text).toContain('Harvard Medical School | MD | 2026-06-12 | 2026-07-08 | 2026-07-20 | 2026-10-05 | Accepted 2026-12-15');
  });

  it('pdf: the text layer', async () => {
    const r = await extractFile({ buffer: fixture('cycle.pdf'), mimeType: MIME.pdf, filename: 'cycle.pdf' });
    expect(r.text).toContain('Harvard Medical School');
    expect(r.text).toContain('Secondary 2026-07-20');
  });

  it('txt and pasted text', async () => {
    const r = await extractFile({ buffer: fixture('cycle.txt'), mimeType: MIME.txt, filename: 'cycle.txt' });
    expect(r.text).toContain('submitted 6/12/2026');
    expect(extractPasted('Harvard 6/12\0 secondary 7/20').text).toBe('Harvard 6/12 secondary 7/20');
  });
});

describe('what is refused', () => {
  const ok = fixture('cycle.csv');
  it('a file over 2 MB is too large, whatever it is', async () => {
    const big = Buffer.alloc(IMPORT_LIMITS.fileBytes + 1, 0x61);
    expect(await code(extractFile({ buffer: big, mimeType: MIME.txt, filename: 'a.txt' }))).toBe('MEDSCHOOLS_IMPORT_TOO_LARGE');
  });
  it('an unsupported type or extension', async () => {
    expect(await code(extractFile({ buffer: ok, mimeType: 'image/png', filename: 'a.png' }))).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
    expect(await code(extractFile({ buffer: ok, mimeType: 'application/octet-stream', filename: 'a.exe' }))).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
    // a specific type that disagrees with the name
    expect(await code(extractFile({ buffer: ok, mimeType: MIME.csv, filename: 'a.pdf' }))).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
  });
  it('a renamed file: magic bytes must match the type', async () => {
    expect(await code(extractFile({ buffer: Buffer.from('not a pdf'), mimeType: MIME.pdf, filename: 'a.pdf' }))).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
    expect(await code(extractFile({ buffer: Buffer.from('not a zip'), mimeType: MIME.xlsx, filename: 'a.xlsx' }))).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
    expect(await code(extractFile({ buffer: Buffer.from('not a zip'), mimeType: MIME.docx, filename: 'a.docx' }))).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
    expect(await code(extractFile({ buffer: fixture('cycle.pdf'), mimeType: MIME.csv, filename: 'a.csv' }))).not.toBe('MEDSCHOOLS_IMPORT_TOO_LARGE');
  });
  it('a binary renamed .csv or .txt', async () => {
    const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 1, 2, 3]);
    expect(await code(extractFile({ buffer: bin, mimeType: MIME.csv, filename: 'a.csv' }))).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
    expect(await code(extractFile({ buffer: bin, mimeType: MIME.txt, filename: 'a.txt' }))).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
  });
  it('a zip that is no workbook, and a damaged one', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    expect(await code(extractFile({ buffer, mimeType: MIME.xlsx, filename: 'a.xlsx' }))).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
    const damaged = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('garbage garbage')]);
    expect(await code(extractFile({ buffer: damaged, mimeType: MIME.docx, filename: 'a.docx' }))).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
  });
  it('a CSV with the generic Windows type is read only when named .csv', async () => {
    expect((await extractFile({ buffer: ok, mimeType: 'application/vnd.ms-excel', filename: 'x.csv' })).kind).toBe('csv');
    expect(await code(extractFile({ buffer: ok, mimeType: 'application/vnd.ms-excel', filename: 'x.xls' }))).toBe('MEDSCHOOLS_IMPORT_UNSUPPORTED');
    expect((await extractFile({ buffer: ok, mimeType: '', filename: 'x.csv' })).kind).toBe('csv');
  });
});

describe('limits', () => {
  it('text is cut to the character limit and the cut is reported', () => {
    const r = extractPasted('Harvard 6/12 '.repeat(5_000));
    expect(r.text.length).toBe(IMPORT_LIMITS.chars);
    expect(r.truncated).toBe(true);
    expect(extractPasted('short').truncated).toBe(false);
  });

  it('a CSV keeps its first 300 rows and says it dropped the rest', async () => {
    const csv = Array.from({ length: 800 }, (_, i) => `School ${i},2026-06-12`).join('\n');
    const r = await extractFile({ buffer: Buffer.from(csv), mimeType: MIME.csv, filename: 'big.csv' });
    expect(r.text.split('\n')).toHaveLength(IMPORT_LIMITS.rows);
    expect(r.truncated).toBe(true);
  });

  it('a workbook keeps its first 300 rows across sheets', async () => {
    const rows = Array.from({ length: 700 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>S${i}</t></is></c></row>`).join('');
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="A" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>${rows}</sheetData></worksheet>`);
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const r = await extractFile({ buffer, mimeType: MIME.xlsx, filename: 'big.xlsx' });
    expect(r.text.split('\n')).toHaveLength(IMPORT_LIMITS.rows);
    expect(r.truncated).toBe(true);
  });
});

describe('csv parsing and serial dates', () => {
  it('handles quotes, doubled quotes, embedded newlines and semicolon files', () => {
    expect(parseCsv('a,"b,c","d ""q"""\n1,2,3', 10).rows).toEqual([
      ['a', 'b,c', 'd "q"'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('a;b\n"x\ny";z', 10).rows).toEqual([
      ['a', 'b'],
      ['x\ny', 'z'],
    ]);
  });
  it('an Excel serial is a day (1900 and 1904 systems)', () => {
    expect(serialToIso(46185, false)).toBe('2026-06-12');
    expect(serialToIso(46185 - 1462, true)).toBe('2026-06-12');
    expect(serialToIso(0, false)).toBeNull();
  });
});
