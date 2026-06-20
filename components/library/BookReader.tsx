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
import { ArrowLeft, Download, List, Loader2 } from 'lucide-react';
import type { LibraryBook } from '@/lib/library/library';
import { BookCanvas, warmPageTexture } from './BookCanvas';

// Minimal shape of the pdfjs document we use — avoids a hard type dep on pdfjs.
type OutlineNode = { title: string; dest: string | unknown[] | null; items: OutlineNode[] };
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  getOutline: () => Promise<OutlineNode[] | null>;
  getDestination: (id: string) => Promise<unknown[] | null>;
  getPageIndex: (ref: unknown) => Promise<number>;
};

/** A flattened table-of-contents entry resolved to a 1-based page number. */
export type Chapter = { title: string; page: number; depth: number };
type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas?: HTMLCanvasElement }) => {
    promise: Promise<void>;
  };
};

// px width each page is rasterised at. Sized generously so a page stays sharp when
// the book fills a tall screen AND when the user zooms in (browser/trackpad zoom
// redraws the canvas larger from this same bitmap — too small a source and it softens).
// Capped to keep the bounded GPU texture cache (see TEX_CACHE_CAP) within budget.
const RENDER_WIDTH = 1600;
const PENDING = '__pending__';

/**
 * Flatten a PDF's outline (bookmarks / table of contents) into chapter markers,
 * resolving each entry's destination to a 1-based page number. Entries that don't
 * resolve to a page are skipped; nested items keep their depth for indentation.
 */
async function buildChapters(pdf: PdfDoc): Promise<Chapter[]> {
  let outline: OutlineNode[] | null = null;
  try {
    outline = await pdf.getOutline();
  } catch {
    return [];
  }
  if (!outline?.length) return [];

  const out: Chapter[] = [];
  const walk = async (nodes: OutlineNode[], depth: number) => {
    for (const node of nodes) {
      try {
        let dest = node.dest;
        if (typeof dest === 'string') dest = await pdf.getDestination(dest);
        const ref = Array.isArray(dest) ? dest[0] : null;
        if (ref) {
          const page = (await pdf.getPageIndex(ref)) + 1;
          if (node.title?.trim()) out.push({ title: node.title.trim(), page, depth });
        }
      } catch {
        /* unresolvable destination — skip this entry */
      }
      if (node.items?.length) await walk(node.items, depth + 1);
    }
  };
  await walk(outline, 0);
  return out;
}

export function BookReader({ book }: { book: LibraryBook }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [aspect, setAspect] = useState(0.72); // page width / height (from page 1)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [single, setSingle] = useState(false);
  const [pageLabel, setPageLabel] = useState('');
  const [curPage, setCurPage] = useState(1);
  // Prefer the book's pre-computed TOC (exact, from metadata); fall back to the PDF's
  // embedded outline only when no TOC was supplied.
  const [chapters, setChapters] = useState<Chapter[]>(() =>
    book.toc.map((t) => ({ title: t.title, page: t.page, depth: t.depth ?? 0 })),
  );
  const [editingPage, setEditingPage] = useState(false);

  const hasToc = book.toc.length > 0;

  // Imperative jump handle published by BookCanvas (page-jump input + chapter menu).
  const seek = useRef<((page: number) => void) | null>(null);
  const goToPage = useCallback((page: number) => seek.current?.(page), []);

  // Rendered page images, keyed by page number. PENDING guards against double work.
  const images = useRef<Map<number, string>>(new Map());
  const [, force] = useReducer((n: number) => n + 1, 0);

  // Single vs two-page: one page when the viewport is narrow (mobile) OR when a
  // two-page spread would be letterboxed by width on a tall/portrait screen — in
  // both cases a single page fills far more of the stage. `aspect` is the page
  // ratio (≈0.72), so `2*aspect` is the spread's width/height; if the viewport is
  // narrower than that, the spread can't fill the height and one page reads bigger.
  useEffect(() => {
    const apply = () => {
      const tooNarrow = window.innerWidth <= 820;
      const tallerThanSpread = window.innerWidth / window.innerHeight < 2 * aspect;
      setSingle(tooNarrow || tallerThanSpread);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [aspect]);

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
          // disableStream stays off so range requests are used.
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
        // If the book didn't ship a pre-computed TOC, fall back to the PDF's embedded
        // outline, resolving each bookmark's destination to a 1-based page number.
        // Best-effort: a PDF with no outline simply yields no chapters (dropdown hidden).
        if (!hasToc) {
          void buildChapters(pdf).then((ch) => {
            if (!cancelled) setChapters(ch);
          });
        }
      } catch (err) {
        console.error('Failed to load PDF', err);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy().catch(() => {});
    };
  }, [book.url, hasToc]);

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
          const url = canvas.toDataURL('image/jpeg', 0.86);
          images.current.set(n, url);
          // Decode the GPU texture now, while the page is merely prefetched, so a turn
          // that later reveals it never flashes the blank fallback waiting on decode.
          warmPageTexture(url);
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
          {status === 'ready' && chapters.length > 0 && (
            <ChapterMenu chapters={chapters} curPage={curPage} onJump={goToPage} />
          )}
          {status === 'ready' &&
            (editingPage ? (
              <PageJump
                numPages={numPages}
                curPage={curPage}
                onJump={(p) => {
                  goToPage(p);
                  setEditingPage(false);
                }}
                onCancel={() => setEditingPage(false)}
              />
            ) : (
              pageLabel && (
                <button
                  type="button"
                  className="lib-reader__count lib-reader__count--btn"
                  onClick={() => setEditingPage(true)}
                  title="Jump to page"
                  aria-label="Jump to a page"
                >
                  {pageLabel}
                </button>
              )
            ))}
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
            seek={seek}
            onPageChange={({ label, page }) => {
              setPageLabel(label);
              setCurPage(page);
            }}
          />
        )}
      </div>
    </main>
  );
}

/** Inline page-number editor shown in place of the counter when jumping to a page. */
function PageJump({
  numPages,
  curPage,
  onJump,
  onCancel,
}: {
  numPages: number;
  curPage: number;
  onJump: (page: number) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(String(curPage));
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const n = Number.parseInt(val, 10);
    if (Number.isFinite(n)) onJump(Math.max(1, Math.min(numPages, n)));
    else onCancel();
  };

  return (
    <form
      className="lib-reader__jump"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        ref={ref}
        type="number"
        min={1}
        max={numPages}
        inputMode="numeric"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            done.current = true;
            onCancel();
          }
        }}
        onBlur={commit}
        aria-label={`Go to page (1–${numPages})`}
        className="lib-reader__jump-input"
      />
      <span className="lib-reader__jump-total">/ {numPages}</span>
    </form>
  );
}

/** Dropdown listing the parsed TOC; jumps to a chapter's page on select. */
function ChapterMenu({
  chapters,
  curPage,
  onJump,
}: {
  chapters: Chapter[];
  curPage: number;
  onJump: (page: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Active chapter = the last one whose start page we've reached.
  let activeIdx = -1;
  chapters.forEach((c, i) => {
    if (c.page <= curPage) activeIdx = i;
  });

  return (
    <div className="lib-reader__chapters" ref={ref}>
      <button
        type="button"
        className="vibe-toolbar__icon"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Chapters"
        title="Chapters"
      >
        <List size={16} />
      </button>
      {open && (
        <ul className="lib-reader__chapters-menu" role="listbox" aria-label="Chapters">
          {chapters.map((c, i) => (
            <li key={`${c.page}-${i}`} role="option" aria-selected={i === activeIdx}>
              <button
                type="button"
                className={`lib-reader__chapter${i === activeIdx ? ' is-active' : ''}`}
                style={{ paddingLeft: `${14 + c.depth * 14}px` }}
                onClick={() => {
                  onJump(c.page);
                  setOpen(false);
                }}
              >
                <span className="lib-reader__chapter-title">{c.title}</span>
                <span className="lib-reader__chapter-page">{c.page}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
