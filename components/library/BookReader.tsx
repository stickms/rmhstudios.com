/**
 * BookReader — a custom, book-style PDF viewer.
 *
 * Loads a PDF with pdfjs-dist and hands its pages to <BookCanvas>, which renders
 * them as a real 3D open book with a drag-follow, Apple-Books-style page-curl turn.
 * This component owns the PDF lifecycle, lazy page rasterisation, and the toolbar;
 * the 3D stage + navigation live in BookCanvas.
 *
 * Lazy by design:
 *  - pdfjs (and its worker) are dynamically imported only after mount, so nothing
 *    PDF-related ships in the SSR/first-paint bundle.
 *  - The PDF is fetched with range requests (disableAutoFetch), so only the bytes
 *    for the pages being viewed are downloaded — never the whole (60MB+) file.
 *  - Pages are rasterised to images on demand and cached; only the visible spread
 *    and its neighbours are ever rendered.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import type { LibraryBook } from '@/lib/library/library';
import { BookCanvas } from './BookCanvas';

// Minimal shape of the pdfjs document we use — avoids a hard type dep on pdfjs.
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
};
type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas?: HTMLCanvasElement }) => {
    promise: Promise<void>;
  };
};

const RENDER_WIDTH = 1100; // px width each page is rasterised at (retina-friendly)
const PENDING = '__pending__';

export function BookReader({ book }: { book: LibraryBook }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [aspect, setAspect] = useState(0.72); // page width / height (from page 1)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [single, setSingle] = useState(false);
  const [pageLabel, setPageLabel] = useState('');

  // Rendered page images, keyed by page number. PENDING guards against double work.
  const images = useRef<Map<number, string>>(new Map());
  const [, force] = useReducer((n: number) => n + 1, 0);

  // Single vs two-page based on viewport width.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const apply = () => setSingle(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Load the PDF (and worker) after mount.
  useEffect(() => {
    let cancelled = false;
    // In pdfjs the *loading task* owns destroy(), not the document proxy — calling
    // destroy on the proxy throws ("destroy is not a function"), which is what blew
    // up on back-navigation. Track the task and tear that down instead.
    let task: { promise: Promise<unknown>; destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const version = pdfjs.version;
        task = pdfjs.getDocument({
          url: book.url,
          // Lazy, range-based loading: pull only the bytes needed for the pages
          // being viewed instead of downloading the whole (potentially 60MB+) file
          // up front. disableAutoFetch stops pdfjs from background-fetching the rest;
          // disableStream stays off so range requests are used. Requires the static
          // server to honour HTTP Range (it does); if not, pdfjs falls back to a
          // full fetch automatically.
          disableAutoFetch: true,
          disableStream: false,
          rangeChunkSize: 262144, // 256KB range chunks
          // CDN-hosted character maps + standard fonts so non-Latin and embedded
          // fonts (e.g. the Arabic title) render correctly.
          cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/standard_fonts/`,
        });
        const pdf = (await task.promise) as unknown as PdfDoc;
        if (cancelled) return; // cleanup destroys the task
        const first = await pdf.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setAspect(vp.width / vp.height);
        setNumPages(pdf.numPages);
        setDoc(pdf);
        setStatus('ready');
      } catch (err) {
        console.error('Failed to load PDF', err);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy().catch(() => {});
    };
  }, [book.url]);

  // Render a page to an image (lazy + cached).
  const ensurePage = useCallback(
    (n: number) => {
      if (!doc || n < 1 || n > numPages || images.current.has(n)) return;
      images.current.set(n, PENDING);
      void (async () => {
        try {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = RENDER_WIDTH / base.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no 2d context');
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          images.current.set(n, canvas.toDataURL('image/jpeg', 0.86));
          force();
        } catch (err) {
          console.error(`Failed to render page ${n}`, err);
          images.current.delete(n);
        }
      })();
    },
    [doc, numPages],
  );

  const getImg = useCallback((n: number): string | undefined => {
    const v = images.current.get(n);
    return v && v !== PENDING ? v : undefined;
  }, []);

  return (
    <main className="vibe-screen lib-reader">
      <header className="lib-reader__bar">
        <Link to="/library" aria-label="Back to library" className="vibe-toolbar__icon">
          <ArrowLeft size={17} />
        </Link>
        <span className="lib-reader__title" title={book.title}>
          {book.title}
        </span>
        <div className="lib-reader__actions">
          {status === 'ready' && pageLabel && <span className="lib-reader__count">{pageLabel}</span>}
          <a href={book.url} download className="vibe-toolbar__icon" aria-label="Download PDF">
            <Download size={16} />
          </a>
        </div>
      </header>

      <div className="lib-reader__stage">
        {status === 'loading' && (
          <div className="lib-reader__status">
            <Loader2 className="lib-spin" size={22} />
            <span>Opening book…</span>
          </div>
        )}
        {status === 'error' && (
          <div className="lib-reader__status">
            <span>Couldn&apos;t open this PDF.</span>
            <a href={book.url} className="lib-reader__fallback" target="_blank" rel="noreferrer">
              Open it directly →
            </a>
          </div>
        )}
        {status === 'ready' && (
          <BookCanvas
            aspect={aspect}
            single={single}
            numPages={numPages}
            getImg={getImg}
            ensurePage={ensurePage}
            onPageChange={(label) => setPageLabel(label)}
          />
        )}
      </div>
    </main>
  );
}
