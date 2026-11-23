import { openZip, ZipLimitError } from '@/lib/zip/bounded-zip.server';
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
  /** PDF only: wall-clock budget for the whole read, in milliseconds (default 15 s). */
  deadlineMs?: number;
  /** PDF only: ends the read when it fires (a request that was abandoned). */
  signal?: AbortSignal;
}

const DOCX_PART_MAX_BYTES = 2 * 1024 * 1024;
const PDF_DEADLINE_MS = 15_000;

/**
 * The text of a DOCX body, paragraph by paragraph. Throws when the part is missing or inflates past 2 MB. The limit is
 * counted on the bytes really inflated (`lib/zip/bounded-zip.server.ts`), never on the size the archive declares.
 */
export async function extractDocxText(buffer: Buffer, opts: ExtractOptions = {}): Promise<string> {
  const maxChars = opts.maxChars ?? 80_000;
  const zip = openZip(buffer, { maxTotalBytes: DOCX_PART_MAX_BYTES });
  let bytes: Buffer | null;
  try {
    bytes = zip.read('word/document.xml', DOCX_PART_MAX_BYTES);
  } catch (err) {
    if (err instanceof ZipLimitError) throw new Error('DOCX document body is too large', { cause: err });
    throw err;
  }
  if (!bytes) throw new Error('DOCX document body is missing');
  const xml = bytes.toString('utf8');
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
    // Tabs are cell boundaries in a table: collapsing `\t\t` would merge an empty cell into its neighbours.
    .replace(opts.tableCells ? / {2,}/g : /[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, maxChars)
    .trim();
}

/** Thrown when a PDF read passes its deadline or its caller gives up. Fixed text: nothing from the file. */
export class PdfTimeoutError extends Error {
  constructor() {
    super('PDF read timed out');
    this.name = 'PdfTimeoutError';
  }
}

/**
 * The text layer of a PDF, page by page. A scanned PDF has none and yields an empty string. The read has a wall-clock
 * deadline and the caller's signal, checked between pages and raced against every operation, plus the page and
 * character caps; the loading task is always destroyed.
 */
export async function extractPdfText(buffer: Buffer, opts: ExtractOptions = {}): Promise<string> {
  const maxChars = opts.maxChars ?? 80_000;
  const maxPages = opts.maxPages ?? 12;
  const until = Date.now() + (opts.deadlineMs ?? PDF_DEADLINE_MS);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // The loading task owns the document: `destroy()` is on the task (the document proxy has none in this pdfjs).
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const expired = new Promise<never>((_, reject) => {
    const fire = () => reject(new PdfTimeoutError());
    timer = setTimeout(fire, Math.max(0, until - Date.now()));
    if (opts.signal) {
      if (opts.signal.aborted) fire();
      else {
        onAbort = fire;
        opts.signal.addEventListener('abort', fire, { once: true });
      }
    }
  });
  expired.catch(() => undefined);
  const step = <T,>(p: Promise<T>): Promise<T> => {
    if (Date.now() >= until || opts.signal?.aborted) {
      p.catch(() => undefined);
      throw new PdfTimeoutError();
    }
    return Promise.race([p, expired]);
  };
  try {
    const doc = await step(task.promise);
    let text = '';
    const pages = Math.min(doc.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pages && text.length < maxChars; pageNumber += 1) {
      const page = await step(doc.getPage(pageNumber));
      const content = await step(page.getTextContent());
      text += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`;
    }
    return text
      .replace(/\s+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .slice(0, maxChars)
      .trim();
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort && opts.signal) opts.signal.removeEventListener('abort', onAbort);
    await task.destroy().catch(() => undefined);
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
