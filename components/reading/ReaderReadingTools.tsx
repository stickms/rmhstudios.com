'use client';

/**
 * Reading tools in the library reader's toolbar (one mount point for both the
 * PDF and EPUB readers):
 *  - L7 Shelf menu: Want to read / Reading / Read, or off the shelves;
 *  - L3 auto-finish: sitting on the last page for a few seconds marks the book
 *    read (and counts toward the yearly challenge) — undoable from the menu;
 *  - L1 Text view button: opens the selectable-text view where highlights,
 *    notes, glossary links and the reading ruler work. The reader itself draws
 *    pages into a WebGL canvas, which has no selectable text, so highlighting
 *    happens in this view.
 */

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BookMarked, FileText, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/components/Providers';
import { useMyShelves, useShelfMutations } from '@/lib/reading/client';
import { useReadingRuler } from '@/lib/reading/ruler';
import { SHELVES, type ShelfId } from '@/lib/reading/schema';
import { useShelfLabels } from './useShelfLabels';
import './reading.css';

const ReaderTextView = lazy(() => import('./ReaderTextView'));
const ReadingRuler = lazy(() => import('./ReadingRuler'));

export interface ReaderTextSource {
  unitLabel: 'page' | 'chapter';
  /** Number of units. */
  count: number;
  /** 1-based unit in view. */
  current: number;
  unitKey: (n: number) => string;
  load: (n: number) => Promise<string>;
}

type DropdownComponent = (props: {
  icon: ReactNode;
  label: string;
  on?: boolean;
  children: (close: () => void) => ReactNode;
  panelRole?: 'menu' | 'dialog';
}) => ReactNode;

/** How long the last page must stay in view before the book counts as finished. */
const FINISH_DWELL_MS = 8000;

export function ReaderReadingTools({
  book,
  source,
  numPages,
  curPage,
  ready,
  stageEl,
  Dropdown,
}: {
  book: { slug: string; title: string; pages: number };
  source: ReaderTextSource | null;
  numPages: number;
  curPage: number;
  ready: boolean;
  /** Element the text view is drawn into (the reader stage). */
  stageEl: HTMLElement | null;
  Dropdown: DropdownComponent;
}) {
  const { t } = useTranslation('f-reading');
  const { data: session } = useSession();
  const labels = useShelfLabels();
  const { data: shelves } = useMyShelves(!!session && ready);
  const { set, remove } = useShelfMutations();
  const setShelfAsync = set.mutateAsync;
  const [textOpen, setTextOpen] = useState(false);
  const [ruler, setRuler] = useReadingRuler();
  const stageRef = useRef<HTMLElement | null>(null);
  stageRef.current = stageEl;
  const current = shelves?.entries.find((e) => e.slug === book.slug)?.shelf ?? null;
  const currentRef = useRef(current);
  currentRef.current = current;
  const loadedShelves = shelves !== undefined;

  async function put(shelf: ShelfId) {
    if (!session) {
      toast.info(t('shelves-signed-out', { defaultValue: 'Sign in to keep shelves' }));
      return;
    }
    try {
      await set.mutateAsync({
        slug: book.slug,
        title: book.title,
        shelf,
        pages: book.pages || numPages,
      });
      toast.success(t('shelved-as', { shelf: labels[shelf], defaultValue: 'Moved to {{shelf}}.' }));
    } catch {
      toast.error(t('shelf-failed', { defaultValue: 'Could not update the shelf.' }));
    }
  }

  // L3: finishing the book — the last page, held for a few seconds.
  const finishedOnce = useRef(false);
  useEffect(() => {
    if (!session || !ready || !loadedShelves || numPages < 2 || curPage < numPages) return;
    if (finishedOnce.current || currentRef.current === 'read') return;
    const id = window.setTimeout(() => {
      if (finishedOnce.current || currentRef.current === 'read') return;
      finishedOnce.current = true;
      void setShelfAsync({
        slug: book.slug,
        title: book.title,
        shelf: 'read',
        pages: book.pages || numPages,
      })
        .then(() =>
          toast.success(
            t('finished-book', {
              title: book.title,
              defaultValue: 'Finished “{{title}}”. Added to your Read shelf.',
            }),
          ),
        )
        .catch(() => {
          finishedOnce.current = false;
        });
    }, FINISH_DWELL_MS);
    return () => window.clearTimeout(id);
  }, [
    session,
    ready,
    loadedShelves,
    numPages,
    curPage,
    book.slug,
    book.title,
    book.pages,
    setShelfAsync,
    t,
  ]);

  function openText() {
    // The note dialog portals to <body>, which a fullscreen element hides.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setTextOpen(true);
  }

  if (!ready) return null;

  return (
    <>
      <Dropdown
        icon={<BookMarked size={16} />}
        label={t('shelf-menu', { defaultValue: 'Shelf' })}
        on={current !== null}
      >
        {(close) => (
          <div
            className="lib-marks"
            role="group"
            aria-label={t('shelf-menu', { defaultValue: 'Shelf' })}
          >
            <h3 className="lib-marks__head">{t('shelf-menu', { defaultValue: 'Shelf' })}</h3>
            <ul className="lib-marks__list">
              {SHELVES.map((s) => (
                <li key={s} className="lib-marks__item">
                  <button
                    type="button"
                    className="lib-marks__jump"
                    role="menuitemradio"
                    aria-checked={current === s}
                    onClick={() => {
                      void put(s);
                      close();
                    }}
                  >
                    <span className="lib-marks__item-title">{labels[s]}</span>
                    {current === s ? <span className="lib-marks__item-page">✓</span> : null}
                  </button>
                </li>
              ))}
              {current ? (
                <li className="lib-marks__item">
                  <button
                    type="button"
                    className="lib-marks__jump"
                    role="menuitem"
                    onClick={() => {
                      remove.mutate(book.slug);
                      close();
                    }}
                  >
                    <span className="lib-marks__item-title">
                      {t('remove-from-shelf', { defaultValue: 'Remove' })}
                    </span>
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        )}
      </Dropdown>

      {source ? (
        <button
          type="button"
          className={`vibe-toolbar__icon transition-transform duration-site-fast active:scale-90${textOpen ? ' is-on' : ''}`}
          aria-pressed={textOpen}
          onClick={() => (textOpen ? setTextOpen(false) : openText())}
          title={t('text-view', { defaultValue: 'Text view: highlights and notes' })}
          aria-label={t('text-view', { defaultValue: 'Text view: highlights and notes' })}
        >
          <FileText size={16} />
        </button>
      ) : null}

      <button
        type="button"
        className={`vibe-toolbar__icon transition-transform duration-site-fast active:scale-90${ruler ? ' is-on' : ''}`}
        aria-pressed={ruler}
        onClick={() => setRuler(!ruler)}
        title={t('ruler-label', { defaultValue: 'Reading ruler' })}
        aria-label={t('ruler-label', { defaultValue: 'Reading ruler' })}
      >
        <ScanLine size={16} />
      </button>

      {ruler && !textOpen && stageEl
        ? createPortal(
            <Suspense fallback={null}>
              <ReadingRuler scope="contained" containerRef={stageRef} />
            </Suspense>,
            stageEl,
          )
        : null}

      {textOpen && source && stageEl
        ? createPortal(
            <Suspense fallback={null}>
              <ReaderTextView book={book} source={source} onClose={() => setTextOpen(false)} />
            </Suspense>,
            stageEl,
          )
        : null}
    </>
  );
}
