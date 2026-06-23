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
