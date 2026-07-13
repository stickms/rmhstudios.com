/**
 * BookReader — a custom, book-style PDF viewer.
 *
 * Loads a PDF with pdfjs-dist and hands its pages to <BookCanvas>, which renders
 * them as a real 3D open book with a drag-follow, Apple-Books-style page-curl turn.
 * This component owns the PDF lifecycle, the page-raster pipeline (PageStore), the
 * toolbar, and the reader's *personal* state — saved position, bookmarks and notes
 * (persisted locally per-device via useBookState). The 3D stage + navigation live in
 * BookCanvas.
 *
 * Lazy + light by design:
 *  - pdfjs (and its worker) are dynamically imported only after mount, so nothing
 *    PDF-related ships in the SSR/first-paint bundle.
 *  - The PDF is fetched with range requests (disableAutoFetch), so only the bytes
 *    for the pages being viewed are downloaded — never the whole (60MB+) file.
 *  - Pages are rasterised to GPU textures on demand by PageStore, which bounds both
 *    GPU and JS memory and renders nearest-first so fast flipping never pauses.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Check,
  Download,
  Info,
  List,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  SlidersHorizontal,
  StickyNote,
  Trash2,
} from 'lucide-react';
import type { LibraryBook } from '@/lib/library/library';
import { PageStore } from '@/lib/library/page-store';
import { useBookState, type Bookmark as BookmarkT, type Note } from '@/lib/library/reader-store';
import { BookCanvas } from './BookCanvas';
import { ReaderDetails } from './ReaderDetails';

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

// Full-quality page raster width (px) per quality level. A page is drawn from this
// bitmap, so a wider raster keeps it sharp on a tall screen and when the user zooms.
// Higher levels cost more GPU memory per resident page, so the menu lets a user dial
// it down on a weak device. Default is the highest.
export type PageQuality = 'low' | 'medium' | 'high';
const QUALITY_WIDTH: Record<PageQuality, number> = {
  low: 1200,
  medium: 1900,
  high: 2600,
};
const QUALITY_LABEL: Record<PageQuality, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
const QUALITY_ORDER: PageQuality[] = ['high', 'medium', 'low'];
const DEFAULT_QUALITY: PageQuality = 'high';

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
  const { t } = useTranslation("c-library");
  const readerRef = useRef<HTMLElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [aspect, setAspect] = useState(0.72); // page width / height (from page 1)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [single, setSingle] = useState(false);
  const [pageLabel, setPageLabel] = useState('');
  const [curPage, setCurPage] = useState(1);
  // Prefer the book's pre-computed TOC (exact, from metadata); fall back to the PDF's
  // embedded outline only when no TOC was supplied.
  const [chapters, setChapters] = useState<Chapter[]>(() =>
    book.toc.map((tc) => ({ title: tc.title, page: tc.page, depth: tc.depth ?? 0 })),
  );
  const [editingPage, setEditingPage] = useState(false);
  const [quality, setQuality] = useState<PageQuality>(DEFAULT_QUALITY);
  const [zoom, setZoom] = useState(1);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const detailsTriggerRef = useRef<HTMLElement | null>(null);

  const hasToc = book.toc.length > 0;

  // The reader's personal, device-local state for this book.
  const marks = useBookState(book.slug);

  // The page-raster pipeline. Created once the PDF is open; owns all page textures.
  const storeRef = useRef<PageStore | null>(null);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const curPageRef = useRef(1);

  // Imperative jump handle published by BookCanvas (page-jump, chapters, bookmarks,
  // scrubber, resume).
  const seek = useRef<((page: number) => void) | null>(null);
  const goToPage = useCallback((page: number) => seek.current?.(page), []);

  const ensurePage = useCallback((n: number) => storeRef.current?.ensure(n), []);
  const getTex = useCallback((n: number) => storeRef.current?.getTexture(n), []);

  // Single vs two-page: one page when the viewport is narrow (mobile) OR when a
  // two-page spread would be letterboxed by width on a tall/portrait screen — in
  // both cases a single page fills far more of the stage.
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

  // Load the PDF (and worker) after mount, then stand up the page store.
  useEffect(() => {
    let cancelled = false;
    // In pdfjs the *loading task* owns destroy(), not the document proxy — calling
    // destroy on the proxy throws ("destroy is not a function"). Track the task.
    let task: { promise: Promise<unknown>; destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const version = pdfjs.version;
        task = pdfjs.getDocument({
          url: book.url,
          // Lazy, range-based loading: pull only the bytes needed for the pages being
          // viewed instead of the whole (potentially 60MB+) file. disableAutoFetch
          // stops the background fetch of the rest; disableStream stays off so range
          // requests are used.
          disableAutoFetch: true,
          disableStream: false,
          rangeChunkSize: 262144, // 256KB range chunks
          cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/standard_fonts/`,
        });
        const pdf = (await task.promise) as unknown as PdfDoc;
        if (cancelled) return; // cleanup destroys the task
        const first = await pdf.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (cancelled) return;
        storeRef.current = new PageStore(pdf, {
          fullWidth: QUALITY_WIDTH[DEFAULT_QUALITY],
          onChange: force,
        });
        setAspect(vp.width / vp.height);
        setNumPages(pdf.numPages);
        setStatus('ready');
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
      storeRef.current?.destroy();
      storeRef.current = null;
      void task?.destroy().catch(() => {});
    };
  }, [book.url, hasToc]);

  // Quality change: widen/narrow the full raster and re-render the pages in view so
  // the change is visible immediately rather than only after navigating.
  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    store.setFullWidth(QUALITY_WIDTH[quality]);
    const c = curPageRef.current;
    for (let d = -1; d <= 4; d++) {
      const p = c + d;
      if (p >= 1 && p <= numPages) store.ensure(p);
    }
  }, [quality, numPages]);

  // Resume where the reader left off, once both the book and saved state are ready.
  // Guarded so it fires exactly once (and never fights the user's own navigation).
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || status !== 'ready' || !marks.ready) return;
    resumed.current = true;
    const p = marks.state.page;
    if (p > 1 && p <= numPages) requestAnimationFrame(() => goToPage(p));
  }, [status, marks.ready, marks.state.page, numPages, goToPage]);

  const onPageChange = useCallback(
    ({ label, page }: { label: string; page: number; k: number }) => {
      setPageLabel(label);
      setCurPage(page);
      curPageRef.current = page;
      storeRef.current?.setFocus(page);
      marks.setPage(page);
    },
    [marks],
  );

  const bookmarked = marks.state.bookmarks.some((b) => b.page === curPage);
  const toggleBookmark = useCallback(() => {
    const chapter = [...chapters].reverse().find((c) => c.page <= curPage);
    const label = chapter ? chapter.title : t('page-n', { page: curPage, defaultValue: `Page ${curPage}` });
    marks.toggleBookmark(curPage, label);
  }, [chapters, curPage, marks, t]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement === readerRef.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await readerRef.current?.requestFullscreen();
    } catch {
      /* Browser policy may deny fullscreen. */
    }
  }, []);

  const setReaderZoom = useCallback((next: number) => {
    setZoom(Math.max(0.8, Math.min(1.5, Math.round(next * 10) / 10)));
  }, []);

  const openDetails = useCallback((trigger: HTMLElement) => {
    detailsTriggerRef.current = trigger;
    setDetailsOpen(true);
  }, []);

  return (
    <main ref={readerRef} className="vibe-screen lib-reader">
      <header className="lib-reader__bar">
        <Link to="/library" aria-label={t("back-to-library", { defaultValue: "Back to library" })} className="vibe-toolbar__icon transition-transform duration-150 active:scale-90">
          <ArrowLeft size={17} />
        </Link>
        <button type="button" className="lib-reader__identity" onClick={(event) => openDetails(event.currentTarget)} aria-label={t('show-book-details', { defaultValue: 'Show book details' })}>
          <span className="lib-reader__eyebrow">{t('now-reading', { defaultValue: 'Now reading' })}</span>
          <span className="lib-reader__title" title={book.title}>{book.title}</span>
        </button>
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
                  title={t("jump-to-page", { defaultValue: "Jump to page" })}
                  aria-label={t("jump-to-a-page", { defaultValue: "Jump to a page" })}
                >
                  {pageLabel}
                </button>
              )
            ))}
          {status === 'ready' && (
            <button
              type="button"
              className={`vibe-toolbar__icon transition-transform duration-150 active:scale-90${bookmarked ? ' is-on' : ''}`}
              onClick={toggleBookmark}
              aria-pressed={bookmarked}
              title={bookmarked ? t('remove-bookmark', { defaultValue: 'Remove bookmark' }) : t('add-bookmark', { defaultValue: 'Bookmark this page' })}
              aria-label={bookmarked ? t('remove-bookmark', { defaultValue: 'Remove bookmark' }) : t('add-bookmark', { defaultValue: 'Bookmark this page' })}
            >
              {bookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            </button>
          )}
          {status === 'ready' && (
            <MarksMenu
              bookmarks={marks.state.bookmarks}
              notes={marks.state.notes}
              curPage={curPage}
              onJump={goToPage}
              onRemoveBookmark={marks.removeBookmark}
              onAddNote={marks.addNote}
              onRemoveNote={marks.removeNote}
            />
          )}
          {status === 'ready' && <QualityMenu quality={quality} onChange={setQuality} />}
          <button type="button" className="vibe-toolbar__icon lib-reader__desktop-action" onClick={(event) => openDetails(event.currentTarget)} aria-label={t('book-details', { defaultValue: 'Book details' })} title={t('book-details', { defaultValue: 'Book details' })}>
            <Info size={16} />
          </button>
          <button type="button" className="vibe-toolbar__icon lib-reader__desktop-action" onClick={toggleFullscreen} aria-label={fullscreen ? t('exit-fullscreen', { defaultValue: 'Exit fullscreen' }) : t('enter-fullscreen', { defaultValue: 'Enter fullscreen' })} title={fullscreen ? t('exit-fullscreen', { defaultValue: 'Exit fullscreen' }) : t('enter-fullscreen', { defaultValue: 'Enter fullscreen' })}>
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <a href={book.url} download className="vibe-toolbar__icon transition-transform duration-150 active:scale-90" aria-label={t("download-pdf", { defaultValue: "Download PDF" })}>
            <Download size={16} />
          </a>
        </div>
      </header>

      <div className="lib-reader__stage">
        {status === 'loading' && (
          <div className="lib-reader__status" role="status" aria-live="polite">
            <Loader2 className="lib-spin" size={22} />
            <span>{t("opening-book", { defaultValue: "Opening book…" })}</span>
          </div>
        )}
        {status === 'error' && (
          <div className="lib-reader__status" role="alert">
            <span>{t("couldnt-open-pdf", { defaultValue: "Couldn't open this PDF." })}</span>
            <a href={book.url} className="lib-reader__fallback" target="_blank" rel="noreferrer">
              {t("open-directly", { defaultValue: "Open it directly →" })}
            </a>
          </div>
        )}
        {status === 'ready' && (
          <>
            <div className="lib-reader__viewport">
              <BookCanvas
                aspect={aspect}
                single={single}
                numPages={numPages}
                getTex={getTex}
                ensurePage={ensurePage}
                seek={seek}
                zoom={zoom}
                onPageChange={onPageChange}
              />
            </div>
            {numPages > 1 && (
              <ScrubBar
                numPages={numPages}
                curPage={curPage}
                bookmarks={marks.state.bookmarks}
                onScrub={goToPage}
                zoom={zoom}
                onZoom={setReaderZoom}
              />
            )}
          </>
        )}
      </div>
      {detailsOpen && (
        <ReaderDetails
          book={book}
          numPages={numPages}
          chapters={chapters}
          portalContainer={readerRef.current}
          returnFocus={detailsTriggerRef.current}
          onJump={goToPage}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </main>
  );
}

/**
 * Bottom scrubber for fast travel through the whole book. Dragging seeks live; the
 * PageStore's low-res preview tier keeps it from ever pausing on a blank page.
 * Bookmark ticks sit under the track so saved spots are easy to land on.
 */
export function ScrubBar({
  numPages,
  curPage,
  bookmarks,
  onScrub,
  zoom,
  onZoom,
}: {
  numPages: number;
  curPage: number;
  bookmarks: BookmarkT[];
  onScrub: (page: number) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
}) {
  const { t } = useTranslation('c-library');
  return (
    <div className="lib-reader__scrub">
      <div className="lib-reader__zoom" aria-label={t('page-size', { defaultValue: 'Page size' })}>
        <button type="button" onClick={() => onZoom(zoom - 0.1)} disabled={zoom <= 0.8} aria-label={t('make-pages-smaller', { defaultValue: 'Make pages smaller' })}><Minus size={14} /></button>
        <button type="button" className="lib-reader__zoom-value" onClick={() => onZoom(1)} aria-label={t('reset-page-size', { defaultValue: 'Reset page size' })}>{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => onZoom(zoom + 0.1)} disabled={zoom >= 1.5} aria-label={t('make-pages-larger', { defaultValue: 'Make pages larger' })}><Plus size={14} /></button>
      </div>
      <span className="lib-reader__scrub-num" aria-hidden="true">
        {Math.min(curPage, numPages)}
      </span>
      <div className="lib-reader__scrub-track">
        {bookmarks.map((b) => (
          <span
            key={b.id}
            className="lib-reader__scrub-tick"
            style={{ left: `${((b.page - 1) / Math.max(1, numPages - 1)) * 100}%` }}
            aria-hidden="true"
          />
        ))}
        <input
          type="range"
          min={1}
          max={numPages}
          value={Math.min(curPage, numPages)}
          onChange={(e) => onScrub(Number(e.target.value))}
          className="lib-reader__scrub-input"
          aria-label={t('scrub-pages', { defaultValue: 'Scrub through pages' })}
        />
      </div>
      <span className="lib-reader__scrub-num" aria-hidden="true">
        {numPages}
      </span>
    </div>
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
  const { t } = useTranslation("c-library");
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
        aria-label={t("go-to-page", { defaultValue: "Go to page (1–{{numPages}})", numPages })}
        className="lib-reader__jump-input"
      />
      <span className="lib-reader__jump-total">/ {numPages}</span>
    </form>
  );
}

/** A reusable dropdown shell: a toolbar icon button that toggles a popover menu and
 *  closes on outside-click / Escape. */
export function Dropdown({
  icon,
  label,
  on,
  children,
  wide,
  panelRole = 'menu',
}: {
  icon: React.ReactNode;
  label: string;
  on?: boolean;
  children: (close: () => void) => React.ReactNode;
  wide?: boolean;
  panelRole?: 'menu' | 'dialog';
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

  return (
    <div className="lib-reader__chapters" ref={ref}>
      <button
        type="button"
        className={`vibe-toolbar__icon transition-transform duration-150 active:scale-90${on ? ' is-on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup={panelRole}
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        {icon}
      </button>
      {open && (
        <div className={`lib-reader__chapters-menu${wide ? ' lib-reader__marks-menu' : ''}`} role={panelRole} aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Bookmarks + personal notes panel. Lets a reader jump to, add, and remove both. */
export function MarksMenu({
  bookmarks,
  notes,
  curPage,
  onJump,
  onRemoveBookmark,
  onAddNote,
  onRemoveNote,
}: {
  bookmarks: BookmarkT[];
  notes: Note[];
  curPage: number;
  onJump: (page: number) => void;
  onRemoveBookmark: (id: string) => void;
  onAddNote: (page: number, text: string) => void;
  onRemoveNote: (id: string) => void;
}) {
  const { t } = useTranslation('c-library');
  const [draft, setDraft] = useState('');
  const count = bookmarks.length + notes.length;

  return (
    <Dropdown
      wide
      on={count > 0}
      panelRole="dialog"
      icon={<StickyNote size={16} />}
      label={t('bookmarks-notes', { defaultValue: 'Bookmarks & notes' })}
    >
      {(close) => (
        <div className="lib-marks">
          <section className="lib-marks__section">
            <h3 className="lib-marks__head">{t('bookmarks', { defaultValue: 'Bookmarks' })}</h3>
            {bookmarks.length === 0 ? (
              <p className="lib-marks__empty">{t('no-bookmarks', { defaultValue: 'No bookmarks yet.' })}</p>
            ) : (
              <ul className="lib-marks__list">
                {bookmarks.map((b) => (
                  <li key={b.id} className="lib-marks__item">
                    <button
                      type="button"
                      className="lib-marks__jump"
                      onClick={() => {
                        onJump(b.page);
                        close();
                      }}
                    >
                      <span className="lib-marks__item-title">{b.label}</span>
                      <span className="lib-marks__item-page">{b.page}</span>
                    </button>
                    <button
                      type="button"
                      className="lib-marks__del"
                      onClick={() => onRemoveBookmark(b.id)}
                      aria-label={t('remove-bookmark', { defaultValue: 'Remove bookmark' })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="lib-marks__section">
            <h3 className="lib-marks__head">{t('notes', { defaultValue: 'Notes' })}</h3>
            <form
              className="lib-marks__compose"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                onAddNote(curPage, draft);
                setDraft('');
              }}
            >
              <textarea
                className="lib-marks__textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('note-placeholder', { page: curPage, defaultValue: `Add a note for page ${curPage}…` })}
                rows={2}
              />
              <button type="submit" className="lib-marks__add" disabled={!draft.trim()}>
                <Plus size={14} /> {t('add-note', { defaultValue: 'Add note' })}
              </button>
            </form>
            {notes.length > 0 && (
              <ul className="lib-marks__list">
                {notes.map((n) => (
                  <li key={n.id} className="lib-marks__item lib-marks__item--note">
                    <button
                      type="button"
                      className="lib-marks__jump"
                      onClick={() => {
                        onJump(n.page);
                        close();
                      }}
                    >
                      <span className="lib-marks__note-text">{n.text}</span>
                      <span className="lib-marks__item-page">{t('page-n', { page: n.page, defaultValue: `Page ${n.page}` })}</span>
                    </button>
                    <button
                      type="button"
                      className="lib-marks__del"
                      onClick={() => onRemoveNote(n.id)}
                      aria-label={t('remove-note', { defaultValue: 'Remove note' })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dropdown>
  );
}

/** Dropdown to pick the page raster quality (sharpness vs. memory). Defaults high. */
function QualityMenu({ quality, onChange }: { quality: PageQuality; onChange: (q: PageQuality) => void }) {
  const { t } = useTranslation("c-library");
  return (
    <Dropdown icon={<SlidersHorizontal size={16} />} label={t('page-quality', { defaultValue: 'Page quality' })}>
      {(close) => (
        <ul className="lib-reader__quality-menu" aria-label={t('page-quality', { defaultValue: 'Page quality' })}>
          {QUALITY_ORDER.map((q) => (
            <li key={q}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={q === quality}
                className={`lib-reader__chapter${q === quality ? ' is-active' : ''}`}
                onClick={() => {
                  onChange(q);
                  close();
                }}
              >
                <span className="lib-reader__chapter-title">{t(`quality-${q}`, { defaultValue: QUALITY_LABEL[q] })}</span>
                {q === quality && <Check size={14} className="lib-reader__chapter-page" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dropdown>
  );
}

/** Dropdown listing the parsed TOC; jumps to a chapter's page on select. */
export function ChapterMenu({
  chapters,
  curPage,
  onJump,
}: {
  chapters: Chapter[];
  curPage: number;
  onJump: (page: number) => void;
}) {
  const { t } = useTranslation("c-library");

  // Active chapter = the last one whose start page we've reached.
  let activeIdx = -1;
  chapters.forEach((c, i) => {
    if (c.page <= curPage) activeIdx = i;
  });

  return (
    <Dropdown icon={<List size={16} />} label={t('chapters', { defaultValue: 'Chapters' })}>
      {(close) => (
        <ul className="lib-reader__chapters-list" aria-label={t('chapters', { defaultValue: 'Chapters' })}>
          {chapters.map((c, i) => (
            <li key={`${c.page}-${i}`}>
              <button
                type="button"
                role="menuitem"
                aria-current={i === activeIdx ? 'page' : undefined}
                className={`lib-reader__chapter${i === activeIdx ? ' is-active' : ''}`}
                style={{ paddingLeft: `${14 + c.depth * 14}px` }}
                onClick={() => {
                  onJump(c.page);
                  close();
                }}
              >
                <span className="lib-reader__chapter-title">{c.title}</span>
                <span className="lib-reader__chapter-page">{c.page}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dropdown>
  );
}
