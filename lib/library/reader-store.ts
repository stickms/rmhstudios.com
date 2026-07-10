/**
 * RMH Studios — Library reader, per-reader local persistence.
 *
 * Keeps a reader's *personal* state for each book on their own device (IndexedDB,
 * via idb) so it's private to them and survives reloads with no account, no server
 * round-trip, and no leakage between users sharing a link:
 *  - the page they left off on (auto-saved, debounced, as they read),
 *  - bookmarks they've dropped, and
 *  - free-text notes attached to a page.
 *
 * Everything is keyed by the book's slug — one object store, one record per book,
 * so a load is a single `get` and a save a single `put`. All access is wrapped so a
 * browser with IndexedDB disabled (private mode, locked-down corp profile) simply
 * reads back empty state and silently drops writes; reading the book still works.
 *
 * Client-only (touches `indexedDB`); import it from components, never the server.
 */

import { openDB, type IDBPDatabase } from 'idb';
import { useCallback, useEffect, useRef, useState } from 'react';

/** A saved place in a book. `label` is a short human caption (chapter or "Page N"). */
export type Bookmark = { id: string; page: number; label: string; createdAt: number };

/** A reader's note pinned to a 1-based page. */
export type Note = {
  id: string;
  page: number;
  text: string;
  color: string;
  createdAt: number;
  updatedAt: number;
};

/** Everything we persist for one book, for one reader, on this device. */
export type BookState = {
  slug: string;
  /** 1-based page last viewed. 0 = never opened (so we don't "resume" to page 0). */
  page: number;
  /**
   * Optional fine-grained location string the reader interprets (EPUB uses
   * "chapter:pageInChapter" for exact resume; PDFs leave it unset and use `page`).
   */
  loc?: string;
  bookmarks: Bookmark[];
  notes: Note[];
  updatedAt: number;
};

const DB_NAME = 'rmh-library-reader';
const DB_VERSION = 1;
const STORE = 'books';
/** How long after the last page change before the position is flushed to disk. */
const PROGRESS_DEBOUNCE_MS = 600;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'slug' });
        }
      },
    });
  }
  return dbPromise;
}

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyState(slug: string): BookState {
  return { slug, page: 0, bookmarks: [], notes: [], updatedAt: 0 };
}

/** Read a book's saved state, or empty state if none / storage unavailable. */
export async function loadBookState(slug: string): Promise<BookState> {
  try {
    const db = await getDB();
    const row = (await db.get(STORE, slug)) as BookState | undefined;
    // Merge over a fresh empty so older records missing a newer field stay valid.
    return row ? { ...emptyState(slug), ...row } : emptyState(slug);
  } catch {
    return emptyState(slug);
  }
}

/** Persist a book's state (best-effort; swallows quota / private-mode failures). */
export async function saveBookState(state: BookState): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE, { ...state, updatedAt: Date.now() });
  } catch {
    /* storage unavailable — reading continues, just without persistence */
  }
}

/**
 * React binding around a book's persisted state.
 *
 * Returns the live state plus mutators. Position changes (`setPage`) are debounced
 * before hitting disk — page-turning fires constantly and the last page is all that
 * matters — while bookmark/note edits flush immediately so an explicit action is
 * never lost to a reload. State is mirrored in a ref so the mutators stay stable and
 * always operate on the freshest value without stale-closure bugs.
 */
export function useBookState(slug: string) {
  const [state, setState] = useState<BookState>(() => emptyState(slug));
  const [ready, setReady] = useState(false);
  const ref = useRef(state);
  ref.current = state;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    setReady(false);
    setState(emptyState(slug));
    void loadBookState(slug).then((s) => {
      if (!alive) return;
      ref.current = s;
      setState(s);
      setReady(true);
    });
    return () => {
      alive = false;
      if (timer.current) {
        clearTimeout(timer.current);
        // Flush whatever we were holding so a quick navigate-away still saves.
        void saveBookState(ref.current);
        timer.current = null;
      }
    };
  }, [slug]);

  const commit = useCallback((next: BookState, debounce = false) => {
    ref.current = next;
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    if (debounce) {
      timer.current = setTimeout(() => {
        timer.current = null;
        void saveBookState(ref.current);
      }, PROGRESS_DEBOUNCE_MS);
    } else {
      void saveBookState(next);
    }
  }, []);

  const setPage = useCallback(
    (page: number) => {
      if (!Number.isFinite(page) || page < 1 || ref.current.page === page) return;
      commit({ ...ref.current, page }, true);
    },
    [commit],
  );

  // EPUB position: a fine location string plus the chapter-level `page` for display,
  // bookmarks and the scrubber. Both persist together (debounced).
  const setLoc = useCallback(
    (loc: string, page: number) => {
      if (ref.current.loc === loc && ref.current.page === page) return;
      commit({ ...ref.current, loc, page: Math.max(1, page) }, true);
    },
    [commit],
  );

  const toggleBookmark = useCallback(
    (page: number, label: string) => {
      const cur = ref.current.bookmarks;
      const has = cur.some((b) => b.page === page);
      const bookmarks = has
        ? cur.filter((b) => b.page !== page)
        : [...cur, { id: genId(), page, label, createdAt: Date.now() }].sort((a, b) => a.page - b.page);
      commit({ ...ref.current, bookmarks });
    },
    [commit],
  );

  const removeBookmark = useCallback(
    (id: string) => commit({ ...ref.current, bookmarks: ref.current.bookmarks.filter((b) => b.id !== id) }),
    [commit],
  );

  const addNote = useCallback(
    (page: number, text: string, color = '#ffd479') => {
      const body = text.trim();
      if (!body) return;
      const now = Date.now();
      const note: Note = { id: genId(), page, text: body, color, createdAt: now, updatedAt: now };
      const notes = [...ref.current.notes, note].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
      commit({ ...ref.current, notes });
    },
    [commit],
  );

  const updateNote = useCallback(
    (id: string, text: string) => {
      const body = text.trim();
      const notes = body
        ? ref.current.notes.map((n) => (n.id === id ? { ...n, text: body, updatedAt: Date.now() } : n))
        : ref.current.notes.filter((n) => n.id !== id); // emptying a note deletes it
      commit({ ...ref.current, notes });
    },
    [commit],
  );

  const removeNote = useCallback(
    (id: string) => commit({ ...ref.current, notes: ref.current.notes.filter((n) => n.id !== id) }),
    [commit],
  );

  return { state, ready, setPage, setLoc, toggleBookmark, removeBookmark, addNote, updateNote, removeNote };
}
