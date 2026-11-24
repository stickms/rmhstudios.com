import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { extractDocxText, extractPdfText, extractResumeText, PdfTimeoutError, validateResumeFile } from './extract.server';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('resume document extraction', () => {
  it('extracts paragraphs and escaped text from DOCX without a new parser dependency', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Experience</w:t></w:r></w:p><w:p><w:r><w:t>Built &amp; shipped services</w:t></w:r></w:p></w:body></w:document>',
    );
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
    });
    validateResumeFile({
      buffer,
      mimeType: DOCX_MIME,
      filename: 'resume.docx',
    });
    await expect(extractResumeText(buffer, DOCX_MIME)).resolves.toContain('Built & shipped services');
  });

  it('rejects a renamed non-DOCX file', () => {
    expect(() =>
      validateResumeFile({
        buffer: Buffer.from('not a zip'),
        mimeType: DOCX_MIME,
        filename: 'resume.docx',
      }),
    ).toThrow(/DOCX/);
  });

  it('table mode keeps an empty cell as a cell, resume mode is unchanged', async () => {
    const zip = new JSZip();
    const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
    zip.file('word/document.xml', `<w:document><w:body><w:tbl><w:tr>${cell('Duke')}${cell('')}${cell('')}${cell('7/20')}</w:tr></w:tbl></w:body></w:document>`);
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    expect(await extractDocxText(buffer, { tableCells: true })).toBe('Duke\t\t\t7/20');
    const flat = new JSZip();
    flat.file('word/document.xml', '<w:document><w:p><w:r><w:t>a</w:t></w:r><w:tab/><w:tab/><w:r><w:t>b</w:t></w:r></w:p></w:document>');
    expect(await extractDocxText(await flat.generateAsync({ type: 'nodebuffer' }))).toBe('a b');
  });

  it('refuses a DOCX whose header says 1 KB and whose body inflates past 2 MB', async () => {
    const data = deflateRawSync(Buffer.alloc(30 * 1024 * 1024, 0x61));
    const name = Buffer.from('word/document.xml');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(1024, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(1024, 24);
    central.writeUInt16LE(name.length, 28);
    const body = Buffer.concat([local, name, data]);
    const dir = Buffer.concat([central, name]);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(dir.length, 12);
    end.writeUInt32LE(body.length, 16);
    await expect(extractDocxText(Buffer.concat([body, dir, end]))).rejects.toThrow('too large');
  });
});

describe('pdf reading has a deadline', () => {
  const pdf = () => readFileSync('features/medschools/api/import/__fixtures__/cycle.pdf');

  it('reads within the deadline', async () => {
    expect(await extractPdfText(pdf())).toContain('Harvard Medical School');
  });

  it('a spent deadline ends the read', async () => {
    await expect(extractPdfText(pdf(), { deadlineMs: 0 })).rejects.toBeInstanceOf(PdfTimeoutError);
  });

  it('an aborted signal ends the read', async () => {
    const c = new AbortController();
    c.abort();
    await expect(extractPdfText(pdf(), { signal: c.signal })).rejects.toBeInstanceOf(PdfTimeoutError);
  });
});
