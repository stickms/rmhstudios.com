import { RESUME_MIME_TYPES } from './schemas';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function validateResumeFile(args: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): void {
  if (!(RESUME_MIME_TYPES as readonly string[]).includes(args.mimeType))
    throw new Error('Only PDF and DOCX resumes are supported');
  if (
    args.mimeType === 'application/pdf' &&
    !args.buffer.subarray(0, 1024).toString('latin1').includes('%PDF')
  ) {
    throw new Error("That file doesn't look like a PDF");
  }
  if (
    args.mimeType === DOCX_MIME &&
    !args.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  ) {
    throw new Error("That file doesn't look like a DOCX document");
  }
  if (/[/\\]/.test(args.filename) || args.filename.includes('\0'))
    throw new Error('Invalid filename');
}

/** What `extractDocxText` and `extractPdfText` take; the defaults are the resume's. */
export interface ExtractOptions {
  /** Output ceiling in characters. */
  maxChars?: number;
  /** PDF only: pages read. */
  maxPages?: number;
  /** DOCX only: end a table cell with a tab and a table row with a newline, so a table keeps its shape. */
  tableCells?: boolean;
}

const DOCX_PART_MAX_BYTES = 2 * 1024 * 1024;

/** The text of a DOCX body, paragraph by paragraph. Throws when the part is missing or expands past 2 MB. */
export async function extractDocxText(buffer: Buffer, opts: ExtractOptions = {}): Promise<string> {
  const maxChars = opts.maxChars ?? 80_000;
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const document = zip.file('word/document.xml');
  if (!document) throw new Error('DOCX document body is missing');
  const expandedBytes = (document as unknown as { _data?: { uncompressedSize?: number } })._data
    ?.uncompressedSize;
  if (typeof expandedBytes === 'number' && expandedBytes > DOCX_PART_MAX_BYTES) {
    throw new Error('DOCX document body is too large');
  }
  const xml = await document.async('string');
  if (Buffer.byteLength(xml, 'utf8') > DOCX_PART_MAX_BYTES)
    throw new Error('DOCX document body is too large');
  return (opts.tableCells
    ? xml
        .replace(/<\/w:p>\s*<\/w:tc>/g, '</w:tc>')
        .replace(/<\/w:tc>/g, '\t')
        .replace(/<\/w:tr>/g, '\n')
    : xml)
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, maxChars)
    .trim();
}

/** The text layer of a PDF, page by page. A scanned PDF has none and yields an empty string. */
export async function extractPdfText(buffer: Buffer, opts: ExtractOptions = {}): Promise<string> {
  const maxChars = opts.maxChars ?? 80_000;
  const maxPages = opts.maxPages ?? 12;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // The loading task owns the document: `destroy()` is on the task (the document proxy has none in this pdfjs).
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false });
  try {
    const doc = await task.promise;
    let text = '';
    const pages = Math.min(doc.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pages && text.length < maxChars; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      text += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`;
    }
    return text
      .replace(/\s+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .slice(0, maxChars)
      .trim();
  } finally {
    await task.destroy();
  }
}

export async function extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'text/plain') {
    return buffer.toString('utf8').split('\0').join('').slice(0, 80_000).trim();
  }
  if (mimeType === DOCX_MIME) return extractDocxText(buffer);
  if (mimeType !== 'application/pdf') throw new Error('Unsupported resume format');
  return extractPdfText(buffer);
}
