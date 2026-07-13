import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { extractResumeText, validateResumeFile } from './extract.server';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('resume document extraction', () => {
  it('extracts paragraphs and escaped text from DOCX without a new parser dependency', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Experience</w:t></w:r></w:p><w:p><w:r><w:t>Built &amp; shipped services</w:t></w:r></w:p></w:body></w:document>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    validateResumeFile({ buffer, mimeType: DOCX_MIME, filename: 'resume.docx' });
    await expect(extractResumeText(buffer, DOCX_MIME)).resolves.toContain('Built & shipped services');
  });

  it('rejects a renamed non-DOCX file', () => {
    expect(() => validateResumeFile({ buffer: Buffer.from('not a zip'), mimeType: DOCX_MIME, filename: 'resume.docx' })).toThrow(/DOCX/);
  });
});

