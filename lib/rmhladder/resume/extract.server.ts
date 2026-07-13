import { RESUME_MIME_TYPES } from './schemas';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function validateResumeFile(args: { buffer: Buffer; mimeType: string; filename: string }): void {
  if (!(RESUME_MIME_TYPES as readonly string[]).includes(args.mimeType)) throw new Error('Only PDF and DOCX resumes are supported');
  if (args.mimeType === 'application/pdf' && !args.buffer.subarray(0, 1024).toString('latin1').includes('%PDF')) {
    throw new Error("That file doesn't look like a PDF");
  }
  if (args.mimeType === DOCX_MIME && !args.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new Error("That file doesn't look like a DOCX document");
  }
  if (/[/\\]/.test(args.filename) || args.filename.includes('\0')) throw new Error('Invalid filename');
}

export async function extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'text/plain') {
    return buffer.toString('utf8').split('\0').join('').slice(0, 80_000).trim();
  }
  if (mimeType === DOCX_MIME) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buffer);
    const document = zip.file('word/document.xml');
    if (!document) throw new Error('DOCX document body is missing');
    const expandedBytes = (document as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof expandedBytes === 'number' && expandedBytes > 2 * 1024 * 1024) {
      throw new Error('DOCX document body is too large');
    }
    const xml = await document.async('string');
    if (Buffer.byteLength(xml, 'utf8') > 2 * 1024 * 1024) throw new Error('DOCX document body is too large');
    return xml
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, 80_000).trim();
  }
  if (mimeType !== 'application/pdf') throw new Error('Unsupported resume format');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false }).promise;
  try {
    let text = '';
    const pages = Math.min(doc.numPages, 12);
    for (let pageNumber = 1; pageNumber <= pages && text.length < 80_000; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      text += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`;
    }
    return text.replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').slice(0, 80_000).trim();
  } finally {
    await (doc as unknown as { destroy(): Promise<void> }).destroy();
  }
}
