/**
 * EpubReader — a paginated reader for EPUB books.
 *
 * EPUBs are reflowable (HTML, not fixed pages), so unlike the 3D PDF book they're
 * laid out live: each spine chapter is rendered into a sandboxed same-origin iframe
 * and split into pages with CSS multicolumn layout, navigated with a smooth
 * horizontal slide. Text stays real (crisp + selectable), images/fonts/styles are
 * served from in-memory blob URLs by the EpubBook engine, and the same personal
 * state as the PDF reader applies — resume position, bookmarks and notes — plus
 * reader settings (font size + light/sepia/dark theme).
 *
 * Client-only; mounted by the library reader route when a book's format is "epub".
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Minus,
  Plus,
  Type,
} from 'lucide-react';
import type { LibraryBook } from '@/lib/library/library';
import { EpubBook } from '@/lib/library/epub';
import { useBookState } from '@/lib/library/reader-store';
import { Dropdown, MarksMenu, ChapterMenu, type Chapter } from './BookReader';

type Theme = 'light' | 'sepia' | 'dark';
type Settings = { fontScale: number; theme: Theme };

const THEMES: Record<Theme, { bg: string; fg: string }> = {
  light: { bg: '#f7f6f3', fg: '#1a1a1a' },
  sepia: { bg: '#f4ecd8', fg: '#3a2f23' },
  dark: { bg: '#16161a', fg: '#d7d7db' },
};
const DEFAULT_SETTINGS: Settings = { fontScale: 1, theme: 'dark' };
const SETTINGS_KEY = 'rmh-epub-settings';

function loadSettings(): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

/** Build the standalone HTML document for one chapter, laid out into columns. */
function buildDoc(chapterHtml: string, s: Settings, cols: number): string {
  const { bg, fg } = THEMES[s.theme];
  const fontPct = Math.round(s.fontScale * 100);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: ${bg}; }
  body { color: ${fg}; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  #vp { position: fixed; inset: 0; overflow: hidden; }
  #cols {
    height: 100vh;
    box-sizing: border-box;
    padding: clamp(20px, 5vh, 56px) clamp(22px, 6vw, 80px);
    column-count: ${cols};
    column-gap: clamp(28px, 6vw, 72px);
    column-fill: auto;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: ${fontPct}%;
    line-height: 1.6;
    text-align: justify;
    hyphens: auto;
    will-change: transform;
    transition: transform 0.34s cubic-bezier(0.16, 1, 0.3, 1);
  }
  #cols :first-child { margin-top: 0; }
  img, svg, video, table { max-width: 100%; height: auto; }
  img, figure, table, pre, blockquote { break-inside: avoid; }
  h1, h2, h3, h4 { break-after: avoid; line-height: 1.25; }
  p { margin: 0 0 1em; orphans: 2; widows: 2; }
  a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  pre { white-space: pre-wrap; word-wrap: break-word; }
</style></head>
<body><div id="vp"><div id="cols">${chapterHtml}</div></div></body></html>`;
}

export function EpubReader({ book }: { book: LibraryBook }) {
  const { t } = useTranslation('c-library');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [spineLen, setSpineLen] = useState(0);
  const [chapter, setChapter] = useState(0);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [, force] = useReducer((n: number) => n + 1, 0);

  const marks = useBookState(book.slug);

  const bookRef = useRef<EpubBook | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Live mirrors read by event handlers attached inside the iframe.
  const stateRef = useRef({ chapter: 0, page: 0, pages: 1 });
  stateRef.current = { chapter, page, pages };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const resumed = useRef(false);

  const cols = useColumns();

  // ── Load the EPUB ───────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    (async () => {
      try {
        const res = await fetch(book.url);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const buf = await res.arrayBuffer();
        const epub = await EpubBook.open(buf);
        if (!alive) {
          epub.revoke();
          return;
        }
        bookRef.current = epub;
        setSpineLen(epub.spineLength);
        // Prefer the book's pre-computed TOC; else the EPUB's own nav/NCX, mapped to
        // 1-based spine "pages" so it shares the PDF ChapterMenu.
        const toc: Chapter[] = book.toc.length
          ? book.toc.map((tc) => ({ title: tc.title, page: tc.page, depth: tc.depth ?? 0 }))
          : epub.toc
              .map((e) => {
                const idx = epub.spineIndexForHref(e.href);
                return idx >= 0 ? { title: e.title, page: idx + 1, depth: e.depth } : null;
              })
              .filter((c): c is Chapter => c !== null);
        setChapters(toc);
        setStatus('ready');
      } catch (err) {
        console.error('Failed to load EPUB', err);
        if (alive) setStatus('error');
      }
    })();
    return () => {
      alive = false;
      bookRef.current?.revoke();
      bookRef.current = null;
    };
  }, [book.url, book.toc]);

  // ── Pagination measurement + transform ──────────────────────────────────────
  const colsEl = useCallback((): HTMLElement | null => {
    return iframeRef.current?.contentDocument?.getElementById('cols') ?? null;
  }, []);

  const applyTransform = useCallback((p: number, animate: boolean) => {
    const el = colsEl();
    const doc = iframeRef.current?.contentDocument;
    if (!el || !doc) return;
    const pageW = doc.documentElement.clientWidth || 1;
    el.style.transition = animate ? '' : 'none';
    el.style.transform = `translateX(${-p * pageW}px)`;
    if (!animate) {
      // Re-enable the transition on the next frame so subsequent flips animate.
      requestAnimationFrame(() => {
        if (el) el.style.transition = '';
      });
    }
  }, [colsEl]);

  const measure = useCallback(() => {
    const el = colsEl();
    const doc = iframeRef.current?.contentDocument;
    if (!el || !doc) return;
    const pageW = doc.documentElement.clientWidth || 1;
    const total = Math.max(1, Math.round(el.scrollWidth / pageW));
    const clamped = Math.min(stateRef.current.page, total - 1);
    setPages(total);
    if (clamped !== stateRef.current.page) setPage(clamped);
    applyTransform(clamped, false);
  }, [colsEl, applyTransform]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  // `go` either flips within the loaded chapter (cheap) or loads another chapter at
  // a target page (0 = start, -1 = last page). Held in a ref so iframe-side handlers
  // always call the freshest version.
  const goRef = useRef<(toChapter: number, toPage: number) => void>(() => {});
  const renderChapter = useCallback(
    async (index: number, targetPage: number) => {
      const epub = bookRef.current;
      const iframe = iframeRef.current;
      if (!epub || !iframe) return;
      const idx = Math.max(0, Math.min(epub.spineLength - 1, index));
      const { html } = await epub.chapter(idx);
      setChapter(idx);
      setPage(targetPage < 0 ? 0 : targetPage); // corrected after measure if 'last'
      iframe.srcdoc = buildDoc(html, settingsRef.current, cols);
      // onLoad (wired below) measures, positions, and re-wires handlers.
      iframe.dataset.targetPage = String(targetPage);
    },
    [cols],
  );

  goRef.current = (toChapter: number, toPage: number) => {
    const { chapter: cur, pages: curPages } = stateRef.current;
    if (toChapter === cur && toPage >= 0 && toPage < curPages) {
      setPage(toPage);
      applyTransform(toPage, true);
      return;
    }
    void renderChapter(toChapter, toPage);
  };

  const next = useCallback(() => {
    const { chapter: c, page: p, pages: tp } = stateRef.current;
    if (p < tp - 1) goRef.current(c, p + 1);
    else if (c < (bookRef.current?.spineLength ?? 1) - 1) goRef.current(c + 1, 0);
  }, []);
  const prev = useCallback(() => {
    const { chapter: c, page: p } = stateRef.current;
    if (p > 0) goRef.current(c, p - 1);
    else if (c > 0) goRef.current(c - 1, -1); // land on the last page of the previous chapter
  }, []);
  const seekChapter = useCallback((oneBasedPage: number) => {
    goRef.current(Math.max(0, oneBasedPage - 1), 0);
  }, []);

  // ── iframe load: measure, position, wire links/keys/taps ────────────────────
  const onIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow;
    if (!iframe || !doc || !win) return;

    const target = Number(iframe.dataset.targetPage ?? '0');
    // Measure once layout settles, and again after late images change it.
    const el = doc.getElementById('cols');
    const pageW = doc.documentElement.clientWidth || 1;
    const total = el ? Math.max(1, Math.round(el.scrollWidth / pageW)) : 1;
    const landing = target < 0 ? total - 1 : Math.min(target, total - 1);
    setPages(total);
    setPage(landing);
    applyTransform(landing, false);
    setTimeout(measure, 60);
    setTimeout(measure, 300);

    // Intercept internal links → spine navigation.
    doc.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement | null)?.closest('a[data-epub-href]') as HTMLElement | null;
      if (a) {
        e.preventDefault();
        const href = a.getAttribute('data-epub-href') || '';
        const idx = bookRef.current?.spineIndexForHref(href) ?? -1;
        if (idx >= 0) goRef.current(idx, 0);
        return;
      }
      // Tap zones: left third → prev, right third → next (ignore text selection).
      if (win.getSelection()?.toString()) return;
      const x = (e as MouseEvent).clientX;
      const w = doc.documentElement.clientWidth;
      if (x < w * 0.3) prev();
      else if (x > w * 0.7) next();
    });
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') next();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
    });
    win.addEventListener('resize', measure);
  }, [applyTransform, measure, next, prev]);

  // First chapter once ready (then resume restores the saved spot).
  useEffect(() => {
    if (status !== 'ready' || !bookRef.current) return;
    void renderChapter(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Re-render the current chapter when columns (viewport) or settings change.
  useEffect(() => {
    if (status !== 'ready') return;
    void renderChapter(stateRef.current.chapter, stateRef.current.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, settings]);

  // Resume the saved location once, after the book and saved state are both ready.
  useEffect(() => {
    if (resumed.current || status !== 'ready' || !marks.ready) return;
    resumed.current = true;
    const { loc, page: savedPage } = marks.state;
    if (loc) {
      const [c, p] = loc.split(':').map((n) => parseInt(n, 10));
      if (Number.isFinite(c) && c > 0) requestAnimationFrame(() => goRef.current(c, Number.isFinite(p) ? p : 0));
    } else if (savedPage > 1) {
      requestAnimationFrame(() => goRef.current(savedPage - 1, 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, marks.ready]);

  // Persist position (chapter:page) whenever it changes.
  useEffect(() => {
    if (status !== 'ready') return;
    marks.setLoc(`${chapter}:${page}`, chapter + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter, page, status]);

  const setAndStore = useCallback((next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const curPage = chapter + 1;
  const bookmarked = marks.state.bookmarks.some((b) => b.page === curPage);
  const toggleBookmark = useCallback(() => {
    const ch = [...chapters].reverse().find((c) => c.page <= curPage);
    const label = ch ? ch.title : t('chapter-n', { n: curPage, defaultValue: `Chapter ${curPage}` });
    marks.toggleBookmark(curPage, label);
  }, [chapters, curPage, marks, t]);

  const label = spineLen ? `${curPage} / ${spineLen}` : '';
  void force;

  return (
    <main className="vibe-screen lib-reader">
      <header className="lib-reader__bar">
        <Link to="/library" aria-label={t('back-to-library', { defaultValue: 'Back to library' })} className="vibe-toolbar__icon">
          <ArrowLeft size={17} />
        </Link>
        <span className="lib-reader__title" title={book.title}>
          {book.title}
        </span>
        <div className="lib-reader__actions">
          {status === 'ready' && chapters.length > 0 && (
            <ChapterMenu chapters={chapters} curPage={curPage} onJump={seekChapter} />
          )}
          {status === 'ready' && label && (
            <span className="lib-reader__count" aria-label={t('chapter-progress', { defaultValue: 'Chapter progress' })}>
              {label}
            </span>
          )}
          {status === 'ready' && (
            <button
              type="button"
              className={`vibe-toolbar__icon${bookmarked ? ' is-on' : ''}`}
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
              onJump={seekChapter}
              onRemoveBookmark={marks.removeBookmark}
              onAddNote={marks.addNote}
              onRemoveNote={marks.removeNote}
            />
          )}
          {status === 'ready' && <SettingsMenu settings={settings} onChange={setAndStore} />}
          <a href={book.url} download className="vibe-toolbar__icon" aria-label={t('download-book', { defaultValue: 'Download book' })}>
            <Download size={16} />
          </a>
        </div>
      </header>

      <div className="lib-reader__stage lib-epub__stage">
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
        {status !== 'error' && (
          <iframe
            ref={iframeRef}
            className="lib-epub__frame"
            title={book.title}
            sandbox="allow-same-origin allow-popups"
            onLoad={onIframeLoad}
            style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
          />
        )}

        {status === 'ready' && (
          <>
            <button
              type="button"
              className="lib-reader__nav lib-reader__nav--prev"
              onClick={prev}
              disabled={chapter === 0 && page === 0}
              aria-label={t('previous-page', { defaultValue: 'Previous page' })}
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              className="lib-reader__nav lib-reader__nav--next"
              onClick={next}
              disabled={chapter >= spineLen - 1 && page >= pages - 1}
              aria-label={t('next-page', { defaultValue: 'Next page' })}
            >
              <ChevronRight size={26} />
            </button>
            {spineLen > 1 && (
              <div className="lib-reader__scrub">
                <span className="lib-reader__scrub-num" aria-hidden="true">{curPage}</span>
                <div className="lib-reader__scrub-track">
                  {marks.state.bookmarks.map((b) => (
                    <span
                      key={b.id}
                      className="lib-reader__scrub-tick"
                      style={{ left: `${((b.page - 1) / Math.max(1, spineLen - 1)) * 100}%` }}
                      aria-hidden="true"
                    />
                  ))}
                  <input
                    type="range"
                    min={1}
                    max={spineLen}
                    value={curPage}
                    onChange={(e) => seekChapter(Number(e.target.value))}
                    className="lib-reader__scrub-input"
                    aria-label={t('scrub-chapters', { defaultValue: 'Scrub through chapters' })}
                  />
                </div>
                <span className="lib-reader__scrub-num" aria-hidden="true">{spineLen}</span>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** Two-column reading on a wide viewport, single column otherwise. */
function useColumns(): number {
  const [cols, setCols] = useState(1);
  useEffect(() => {
    const apply = () => setCols(window.innerWidth >= 1100 ? 2 : 1);
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
  return cols;
}

/** Font-size + theme controls for the EPUB reader. */
function SettingsMenu({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const { t } = useTranslation('c-library');
  const clamp = (n: number) => Math.max(0.7, Math.min(1.8, Math.round(n * 100) / 100));
  return (
    <Dropdown icon={<Type size={16} />} label={t('reader-settings', { defaultValue: 'Reading settings' })}>
      {() => (
        <div className="lib-epub__settings">
          <div className="lib-epub__set-row">
            <span className="lib-marks__head">{t('font-size', { defaultValue: 'Font size' })}</span>
            <div className="lib-epub__steppers">
              <button
                type="button"
                className="lib-epub__step"
                onClick={() => onChange({ ...settings, fontScale: clamp(settings.fontScale - 0.1) })}
                aria-label={t('smaller-text', { defaultValue: 'Smaller text' })}
              >
                <Minus size={14} />
              </button>
              <span className="lib-epub__set-val">{Math.round(settings.fontScale * 100)}%</span>
              <button
                type="button"
                className="lib-epub__step"
                onClick={() => onChange({ ...settings, fontScale: clamp(settings.fontScale + 0.1) })}
                aria-label={t('larger-text', { defaultValue: 'Larger text' })}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="lib-epub__set-row">
            <span className="lib-marks__head">{t('theme', { defaultValue: 'Theme' })}</span>
            <div className="lib-epub__themes">
              {(['light', 'sepia', 'dark'] as Theme[]).map((th) => (
                <button
                  key={th}
                  type="button"
                  className={`lib-epub__theme lib-epub__theme--${th}${settings.theme === th ? ' is-active' : ''}`}
                  onClick={() => onChange({ ...settings, theme: th })}
                  aria-label={t(`theme-${th}`, { defaultValue: th })}
                  aria-pressed={settings.theme === th}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </Dropdown>
  );
}
