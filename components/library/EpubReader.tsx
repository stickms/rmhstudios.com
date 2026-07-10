/**
 * EpubReader — reads an EPUB inside the same 3D page-curl book as PDFs.
 *
 * EPUBs are reflowable, so they can't be dropped into the fixed-page 3D book
 * directly. Instead the EpubRasterStore (epub.js + html2canvas) paginates the book
 * and rasterises each page to a GPU texture, which we hand to <BookCanvas> — the
 * exact same drag-follow curl renderer the PDF reader uses. The reader therefore
 * shares the PDF toolbar, navigation, scrubber and personalization (resume,
 * bookmarks, notes), and adds a light/sepia/dark page theme.
 *
 * Client-only; mounted by the library reader route when a book's format is "epub".
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Bookmark, BookmarkCheck, Download, Loader2, Palette } from 'lucide-react';
import type { LibraryBook } from '@/lib/library/library';
import { EpubRasterStore, type EpubTheme, type EpubToc } from '@/lib/library/epub-raster';
import { useBookState } from '@/lib/library/reader-store';
import { BookCanvas } from './BookCanvas';
import { Dropdown, MarksMenu, ChapterMenu, type Chapter } from './BookReader';

const THEME_KEY = 'rmh-epub-theme';
const THEMES: EpubTheme[] = ['light', 'sepia', 'dark'];

function loadTheme(): EpubTheme {
  try {
    const v = typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'sepia' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function EpubReader({ book }: { book: LibraryBook }) {
  const { t } = useTranslation('c-library');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [numPages, setNumPages] = useState(0);
  const [aspect, setAspect] = useState(0.64);
  const [single, setSingle] = useState(true);
  const [pageLabel, setPageLabel] = useState('');
  const [curPage, setCurPage] = useState(1);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [theme, setTheme] = useState<EpubTheme>(() => loadTheme());

  const marks = useBookState(book.slug);
  const storeRef = useRef<EpubRasterStore | null>(null);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const curPageRef = useRef(1);

  const seek = useRef<((page: number) => void) | null>(null);
  const goToPage = useCallback((page: number) => seek.current?.(page), []);
  const ensurePage = useCallback((n: number) => storeRef.current?.ensure(n), []);
  const getTex = useCallback((n: number) => storeRef.current?.getTexture(n), []);

  // Single vs two-page spread — same responsive rule as the PDF reader.
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

  // Load + paginate the EPUB, then stand up the raster store.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const res = await fetch(book.url);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const buf = await res.arrayBuffer();
        const init = await EpubRasterStore.open(buf, { theme: loadTheme(), onChange: force });
        if (cancelled) {
          init.store.destroy();
          return;
        }
        storeRef.current = init.store;
        setAspect(init.aspect);
        setNumPages(init.numPages);
        // Prefer the book's pre-computed TOC; else the EPUB's own nav mapped to pages.
        const toc: Chapter[] = book.toc.length
          ? book.toc.map((tc) => ({ title: tc.title, page: tc.page, depth: tc.depth ?? 0 }))
          : init.toc.map((e: EpubToc) => ({ title: e.title, page: e.page, depth: e.depth }));
        setChapters(toc);
        setStatus('ready');
      } catch (err) {
        console.error('Failed to load EPUB', err);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      storeRef.current?.destroy();
      storeRef.current = null;
    };
  }, [book.url, book.toc]);

  // Resume once both the book and saved state are ready.
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

  const changeTheme = useCallback((next: EpubTheme) => {
    setTheme(next);
    storeRef.current?.setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const bookmarked = marks.state.bookmarks.some((b) => b.page === curPage);
  const toggleBookmark = useCallback(() => {
    const ch = [...chapters].reverse().find((c) => c.page <= curPage);
    const label = ch ? ch.title : t('page-n', { page: curPage, defaultValue: `Page ${curPage}` });
    marks.toggleBookmark(curPage, label);
  }, [chapters, curPage, marks, t]);

  return (
    <main className="vibe-screen lib-reader">
      <header className="lib-reader__bar">
        <Link to="/library" aria-label={t('back-to-library', { defaultValue: 'Back to library' })} className="vibe-toolbar__icon transition-transform duration-150 active:scale-90">
          <ArrowLeft size={17} />
        </Link>
        <span className="lib-reader__title" title={book.title}>
          {book.title}
        </span>
        <div className="lib-reader__actions">
          {status === 'ready' && chapters.length > 0 && (
            <ChapterMenu chapters={chapters} curPage={curPage} onJump={goToPage} />
          )}
          {status === 'ready' && pageLabel && (
            <span className="lib-reader__count">{pageLabel}</span>
          )}
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
          {status === 'ready' && <ThemeMenu theme={theme} onChange={changeTheme} />}
          <a href={book.url} download className="vibe-toolbar__icon transition-transform duration-150 active:scale-90" aria-label={t('download-book', { defaultValue: 'Download book' })}>
            <Download size={16} />
          </a>
        </div>
      </header>

      <div className="lib-reader__stage">
        {status === 'loading' && (
          <div className="lib-reader__status">
            <Loader2 className="lib-spin" size={22} />
            <span>{t('opening-book', { defaultValue: 'Opening book…' })}</span>
          </div>
        )}
        {status === 'error' && (
          <div className="lib-reader__status">
            <span>{t('couldnt-open-epub', { defaultValue: "Couldn't open this EPUB." })}</span>
            <a href={book.url} className="lib-reader__fallback" download>
              {t('download-book', { defaultValue: 'Download book' })}
            </a>
          </div>
        )}
        {status === 'ready' && (
          <>
            <BookCanvas
              aspect={aspect}
              single={single}
              numPages={numPages}
              getTex={getTex}
              ensurePage={ensurePage}
              seek={seek}
              onPageChange={onPageChange}
            />
            {numPages > 1 && (
              <div className="lib-reader__scrub">
                <span className="lib-reader__scrub-num" aria-hidden="true">{Math.min(curPage, numPages)}</span>
                <div className="lib-reader__scrub-track">
                  {marks.state.bookmarks.map((b) => (
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
                    onChange={(e) => goToPage(Number(e.target.value))}
                    className="lib-reader__scrub-input"
                    aria-label={t('scrub-pages', { defaultValue: 'Scrub through pages' })}
                  />
                </div>
                <span className="lib-reader__scrub-num" aria-hidden="true">{numPages}</span>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** Light / sepia / dark page-theme picker for the EPUB reader. */
function ThemeMenu({ theme, onChange }: { theme: EpubTheme; onChange: (t: EpubTheme) => void }) {
  const { t } = useTranslation('c-library');
  return (
    <Dropdown icon={<Palette size={16} />} label={t('theme', { defaultValue: 'Theme' })}>
      {(close) => (
        <div className="lib-epub__settings">
          <div className="lib-epub__set-row">
            <span className="lib-marks__head">{t('theme', { defaultValue: 'Theme' })}</span>
            <div className="lib-epub__themes">
              {THEMES.map((th) => (
                <button
                  key={th}
                  type="button"
                  className={`lib-epub__theme lib-epub__theme--${th}${theme === th ? ' is-active' : ''}`}
                  onClick={() => {
                    onChange(th);
                    close();
                  }}
                  aria-label={t(`theme-${th}`, { defaultValue: th })}
                  aria-pressed={theme === th}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </Dropdown>
  );
}
