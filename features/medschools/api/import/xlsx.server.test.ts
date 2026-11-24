import { deflateRawSync } from 'node:zlib';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { ZipLimitError, openZip } from '@/lib/zip/bounded-zip.server';
import { readXlsx } from './xlsx.server';

const WORKBOOK =
  '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>';
const RELS = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';

async function workbookWith(parts: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', WORKBOOK);
  zip.file('xl/_rels/workbook.xml.rels', RELS);
  for (const [path, xml] of Object.entries(parts)) zip.file(path, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const timed = async <T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> => {
  const t = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - t };
};

describe('xlsx reader is linear on pathological parts', () => {
  const SIZE = 12_000_000;

  it('12 MB of unclosed <row> finishes at once', async () => {
    const buf = await workbookWith({ 'xl/worksheets/sheet1.xml': '<row>'.repeat(SIZE / 5) });
    const { value, ms } = await timed(() => readXlsx(buf, 500));
    expect(value[0]?.rows).toEqual([]);
    expect(ms).toBeLessThan(1_000);
  });

  it('12 MB of unclosed <c> inside one row finishes at once', async () => {
    const buf = await workbookWith({ 'xl/worksheets/sheet1.xml': `<row>${'<c>'.repeat(SIZE / 3)}` });
    const { ms } = await timed(() => readXlsx(buf, 500));
    expect(ms).toBeLessThan(1_000);
  });

  it('12 MB of unclosed <si> and <t> finishes at once', async () => {
    const buf = await workbookWith({
      'xl/worksheets/sheet1.xml': '<row r="1"><c r="A1" t="s"><v>0</v></c></row>',
      'xl/sharedStrings.xml': `<sst>${'<si><t>'.repeat(SIZE / 7)}`,
    });
    const { value, ms } = await timed(() => readXlsx(buf, 500));
    expect(value[0]?.rows.length).toBeLessThanOrEqual(1);
    expect(ms).toBeLessThan(1_000);
  });

  it('12 MB of unclosed <rPh> and <v> finishes at once', async () => {
    const buf = await workbookWith({
      'xl/worksheets/sheet1.xml': `<row><c r="A1">${'<v>'.repeat(SIZE / 3)}`,
      'xl/sharedStrings.xml': `<sst><si>${'<rPh>'.repeat(SIZE / 5)}`,
    });
    const { ms } = await timed(() => readXlsx(buf, 500));
    expect(ms).toBeLessThan(1_000);
  });

  it('a real small sheet still reads', async () => {
    const buf = await workbookWith({
      'xl/worksheets/sheet1.xml':
        '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Duke</t></is></c><c r="B1"><v>7</v></c></row></sheetData>',
    });
    expect((await readXlsx(buf, 500))[0]?.rows).toEqual([['Duke', '7']]);
  });
});

/** A one-entry zip whose headers say `declared` bytes while the deflate stream holds `actual`. */
function lyingZip(name: string, actual: number, declared: number): Buffer {
  const data = deflateRawSync(Buffer.alloc(actual, 0x61));
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(declared, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(declared, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  const localPart = Buffer.concat([local, nameBuf, data]);
  const dir = Buffer.concat([central, nameBuf]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, dir, end]);
}

describe('zip bomb with a lying header', () => {
  it('declares 1 KB, inflates to 40 MB: refused at the cap', () => {
    const zip = openZip(lyingZip('xl/workbook.xml', 40 * 1024 * 1024, 1024), { maxTotalBytes: 24 * 1024 * 1024 });
    expect(() => zip.read('xl/workbook.xml', 12 * 1024 * 1024)).toThrow(ZipLimitError);
    expect(zip.inflatedBytes).toBe(0);
  });

  it('reads an honest entry', () => {
    const zip = openZip(lyingZip('a.xml', 1000, 1000), { maxTotalBytes: 1 << 20 });
    expect(zip.read('a.xml', 5000)?.length).toBe(1000);
    expect(zip.read('missing.xml', 5000)).toBeNull();
  });

  it('caps the total across parts', async () => {
    const z = new JSZip();
    z.file('a.xml', 'x'.repeat(600));
    z.file('b.xml', 'y'.repeat(600));
    const zip = openZip(await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), { maxTotalBytes: 1000 });
    expect(zip.read('a.xml', 5000)?.length).toBe(600);
    expect(() => zip.read('b.xml', 5000)).toThrow(ZipLimitError);
  });

  it('readXlsx refuses a workbook part that lies', async () => {
    await expect(readXlsx(lyingZip('xl/workbook.xml', 40 * 1024 * 1024, 1024), 500)).rejects.toThrow('too large');
  });
});
