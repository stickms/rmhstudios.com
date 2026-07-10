/**
 * RMH Studios — Library upload, client-side PDF analysis.
 *
 * Runs only in the browser. Uses pdf.js (dynamically imported, same worker setup
 * as the reader) to derive a page count, a first-page cover JPEG, and a text
 * snippet for the AI draft — so the server never has to rasterize or parse PDFs.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

async function loadPdfjs(): Promise<any> {
  const pdfjs: any = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

export type PdfAnalysis = {
  /** Total pages in the document. */
  pages: number;
  /** First page rendered to a JPEG blob, or null if rendering failed. */
  cover: Blob | null;
  /** Concatenated text from the opening pages (for AI metadata drafting). */
  text: string;
};

/** Analysis of an uploaded book, of either supported format. */
export type BookAnalysis = PdfAnalysis & { format: 'pdf' | 'epub' };

async function renderCover(doc: any, targetWidth: number): Promise<Blob | null> {
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = targetWidth / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82));
  } catch {
    return null;
  }
}

async function extractText(doc: any, maxPages: number, maxChars: number): Promise<string> {
  let out = '';
  const n = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= n && out.length < maxChars; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it: any) => ('str' in it ? it.str : '')).join(' ') + '\n';
    } catch {
      /* skip unreadable page */
    }
  }
  return out.slice(0, maxChars).trim();
}

/** Read a PDF File into a page count, a cover JPEG, and an opening-text snippet. */
export async function analyzePdf(
  file: File,
  opts: { coverWidth?: number; textPages?: number; maxChars?: number } = {}
): Promise<PdfAnalysis> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const pages = doc.numPages;
    const cover = await renderCover(doc, opts.coverWidth ?? 800);
    const text = await extractText(doc, opts.textPages ?? 8, opts.maxChars ?? 6000);
    return { pages, cover, text };
  } finally {
    await doc.destroy?.();
  }
}

/** Read an EPUB File into a section count, its declared cover, and an opening-text snippet. */
async function analyzeEpub(file: File, maxChars: number): Promise<PdfAnalysis> {
  const { EpubBook } = await import('./epub');
  const book = await EpubBook.open(await file.arrayBuffer());
  try {
    const cover = await book.coverBlob().catch(() => null);
    const text = await book.text(maxChars).catch(() => '');
    return { pages: Math.max(1, book.spineLength), cover, text };
  } finally {
    book.revoke();
  }
}

/** True when a file looks like an EPUB (by extension or MIME), not a PDF. */
export function isEpubFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.epub') || file.type === 'application/epub+zip';
}

/**
 * Analyse an uploaded book of either format, returning the detected `format`
 * alongside the page/section count, cover and text snippet.
 */
export async function analyzeBook(
  file: File,
  opts: { coverWidth?: number; textPages?: number; maxChars?: number } = {}
): Promise<BookAnalysis> {
  const maxChars = opts.maxChars ?? 6000;
  if (isEpubFile(file)) {
    return { ...(await analyzeEpub(file, maxChars)), format: 'epub' };
  }
  return { ...(await analyzePdf(file, opts)), format: 'pdf' };
}
