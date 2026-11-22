/**
 * RMH Studios — Library reader, per-reader persistence.
 *
 * Keeps a reader's *personal* state for each book on their own device (IndexedDB,
 * via idb) so it's private to them and survives reloads with no account and no
 * leakage between users sharing a link. A signed-in reader's device copy is also
 * synced to their account (`useSyncedBookState`, below; the merge rules are the pure
 * ones in `reader-sync.ts`): the device stays the fast path and nothing waits on the
 * network. A signed-out reader, or one who turned syncing off on this device, never
 * touches the server.
 *  - what is kept:
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

import {
  openDB,
  type IDBPDatabase,
} from 'idb';
import { api } from '@/lib/contract/client';
import {
  deleteReaderMarksApi,
  getReaderMarksApi,
  putReaderMarksApi,
} from '@/lib/library/reader-sync.contract';
import { recordHistoryBeatApi } from '@/lib/history/history.contract';
import { HISTORY_BEAT_INTERVAL_MS } from '@/lib/history/constants';
import {
  MAX_BATCH,
  PLACE_PUSH_INTERVAL_MS,
  adoptCanonical,
  applyRecords,
  bookmarkRecord,
  createThrottle,
  fingerprint,
  mergeMarks,
  noteRecord,
  pendingRecords,
  percentRead,
  pickPlace,
  prepareForSync,
  stateToRecords,
  tombstoneOf,
  type MarkRecord,
} from '@/lib/library/reader-sync';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

/** A saved place in a book. `label` is a short human caption (chapter or "Page N"). */
export type Bookmark =
  {
    id: string;
    page: number;
    label: string;
    createdAt: number;
    /** Last edit; absent on bookmarks saved before sync existed (then `createdAt`). */
    updatedAt?: number;
  };

/** A reader's note pinned to a 1-based page. */
export type Note =
  {
    id: string;
    page: number;
    text: string;
    color: string;
    createdAt: number;
    updatedAt: number;
  };

/** Everything we persist for one book, for one reader, on this device. */
export type BookState =
  {
    slug: string;
    /** 1-based page last viewed. 0 = never opened (so we don't "resume" to page 0). */
    page: number;
    /**
     * Optional fine-grained location string the reader interprets (EPUB uses
     * "chapter:pageInChapter" for exact resume; PDFs leave it unset and use `page`).
     */
    loc?: string;
    /** When the place above was last moved (ms); the merge keeps the newer place. */
    placeAt?: number;
    bookmarks: Bookmark[];
    notes: Note[];
    /** Deleted bookmarks and notes, remembered so the deletion can still reach the server. */
    tombstones?: MarkRecord[];
    updatedAt: number;
  };

const DB_NAME =
  'rmh-library-reader';
const DB_VERSION = 1;
const STORE =
  'books';
/** How long after the last page change before the position is flushed to disk. */
const PROGRESS_DEBOUNCE_MS = 600;

let dbPromise: Promise<IDBPDatabase> | null =
  null;

function getDB(): Promise<IDBPDatabase> {
  if (
    !dbPromise
  ) {
    dbPromise =
      openDB(
        DB_NAME,
        DB_VERSION,
        {
          // Clearing this device (/settings/device) deletes the database; let it go instead of holding the delete.
          blocking() {
            const open =
              dbPromise;
            dbPromise =
              null;
            void open?.then(
              (
                db,
              ) =>
                db.close(),
            );
          },
          upgrade(
            db,
          ) {
            if (
              !db.objectStoreNames.contains(
                STORE,
              )
            ) {
              db.createObjectStore(
                STORE,
                {
                  keyPath:
                    'slug',
                },
              );
            }
          },
        },
      );
  }
  return dbPromise;
}

function genId(): string {
  try {
    if (
      typeof crypto !==
        'undefined' &&
      'randomUUID' in
        crypto
    )
      return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  // At least 21 characters: the server refuses shorter client ids.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Add deletions to the remembered ones; a newer deletion of the same id replaces the older. */
function withTombstones(
  existing: MarkRecord[] | undefined,
  added: MarkRecord[],
): MarkRecord[] {
  if (
    added.length ===
    0
  )
    return (
      existing ??
      []
    );
  const ids =
    new Set(
      added.map(
        (
          t,
        ) =>
          t.id,
      ),
    );
  return [
    ...(existing ??
      []).filter(
      (
        t,
      ) =>
        !ids.has(
          t.id,
        ),
    ),
    ...added,
  ];
}

export function emptyState(
  slug: string,
): BookState {
  return {
    slug,
    page: 0,
    bookmarks:
      [],
    notes:
      [],
    updatedAt: 0,
  };
}

/** Read a book's saved state, or empty state if none / storage unavailable. */
export async function loadBookState(
  slug: string,
): Promise<BookState> {
  try {
    const db =
      await getDB();
    const row =
      (await db.get(
        STORE,
        slug,
      )) as
        | BookState
        | undefined;
    // Merge over a fresh empty so older records missing a newer field stay valid.
    return row
      ? prepareForSync(
          {
            ...emptyState(
              slug,
            ),
            ...row,
          },
          genId,
          Date.now(),
        )
      : emptyState(
          slug,
        );
  } catch {
    return emptyState(
      slug,
    );
  }
}

/** Persist a book's state (best-effort; swallows quota / private-mode failures). */
export async function saveBookState(
  state: BookState,
): Promise<void> {
  try {
    const db =
      await getDB();
    await db.put(
      STORE,
      {
        ...state,
        updatedAt:
          Date.now(),
      },
    );
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
export function useBookState(
  slug: string,
) {
  const [
    state,
    setState,
  ] =
    useState<BookState>(
      () =>
        emptyState(
          slug,
        ),
    );
  const [
    ready,
    setReady,
  ] =
    useState(
      false,
    );
  const ref =
    useRef(
      state,
    );
  ref.current =
    state;
  const timer =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(
      null,
    );

  useEffect(() => {
    let alive = true;
    setReady(
      false,
    );
    setState(
      emptyState(
        slug,
      ),
    );
    void loadBookState(
      slug,
    ).then(
      (
        s,
      ) => {
        if (
          !alive
        )
          return;
        ref.current =
          s;
        setState(
          s,
        );
        setReady(
          true,
        );
      },
    );
    return () => {
      alive = false;
      if (
        timer.current
      ) {
        clearTimeout(
          timer.current,
        );
        // Flush whatever we were holding so a quick navigate-away still saves.
        void saveBookState(
          ref.current,
        );
        timer.current =
          null;
      }
    };
  }, [
    slug,
  ]);

  const commit =
    useCallback(
      (
        next: BookState,
        debounce = false,
      ) => {
        ref.current =
          next;
        setState(
          next,
        );
        if (
          timer.current
        )
          clearTimeout(
            timer.current,
          );
        if (
          debounce
        ) {
          timer.current =
            setTimeout(
              () => {
                timer.current =
                  null;
                void saveBookState(
                  ref.current,
                );
              },
              PROGRESS_DEBOUNCE_MS,
            );
        } else {
          void saveBookState(
            next,
          );
        }
      },
      [],
    );

  const setPage =
    useCallback(
      (
        page: number,
      ) => {
        if (
          !Number.isFinite(
            page,
          ) ||
          page <
            1 ||
          ref
            .current
            .page ===
            page
        )
          return;
        commit(
          {
            ...ref.current,
            page,
            placeAt:
              Date.now(),
          },
          true,
        );
      },
      [
        commit,
      ],
    );

  // EPUB position: a fine location string plus the chapter-level `page` for display,
  // bookmarks and the scrubber. Both persist together (debounced).
  const setLoc =
    useCallback(
      (
        loc: string,
        page: number,
      ) => {
        if (
          ref
            .current
            .loc ===
            loc &&
          ref
            .current
            .page ===
            page
        )
          return;
        commit(
          {
            ...ref.current,
            loc,
            page: Math.max(
              1,
              page,
            ),
            placeAt:
              Date.now(),
          },
          true,
        );
      },
      [
        commit,
      ],
    );

  const toggleBookmark =
    useCallback(
      (
        page: number,
        label: string,
      ) => {
        const cur =
          ref
            .current
            .bookmarks;
        const has =
          cur.some(
            (
              b,
            ) =>
              b.page ===
              page,
          );
        const now =
          Date.now();
        const gone =
          cur
            .filter(
              (
                b,
              ) =>
                b.page ===
                page,
            )
            .map(
              (
                b,
              ) =>
                tombstoneOf(
                  bookmarkRecord(
                    b,
                  ),
                  now,
                ),
            );
        const bookmarks =
          has
            ? cur.filter(
                (
                  b,
                ) =>
                  b.page !==
                  page,
              )
            : [
                ...cur,
                {
                  id: genId(),
                  page,
                  label,
                  createdAt:
                    now,
                  updatedAt:
                    now,
                },
              ].sort(
                (
                  a,
                  b,
                ) =>
                  a.page -
                  b.page,
              );
        commit(
          {
            ...ref.current,
            bookmarks,
            tombstones:
              withTombstones(
                ref.current.tombstones,
                gone,
              ),
          },
        );
      },
      [
        commit,
      ],
    );

  const removeBookmark =
    useCallback(
      (
        id: string,
      ) => {
        const gone =
          ref.current.bookmarks.find(
            (
              b,
            ) =>
              b.id ===
              id,
          );
        commit(
          {
            ...ref.current,
            bookmarks:
              ref.current.bookmarks.filter(
                (
                  b,
                ) =>
                  b.id !==
                  id,
              ),
            tombstones:
              withTombstones(
                ref.current.tombstones,
                gone
                  ? [
                      tombstoneOf(
                        bookmarkRecord(
                          gone,
                        ),
                        Date.now(),
                      ),
                    ]
                  : [],
              ),
          },
        );
      },
      [
        commit,
      ],
    );

  const addNote =
    useCallback(
      (
        page: number,
        text: string,
        color = '#ffd479',
      ) => {
        const body =
          text.trim();
        if (
          !body
        )
          return;
        const now =
          Date.now();
        const note: Note =
          {
            id: genId(),
            page,
            text: body,
            color,
            createdAt:
              now,
            updatedAt:
              now,
          };
        const notes =
          [
            ...ref
              .current
              .notes,
            note,
          ].sort(
            (
              a,
              b,
            ) =>
              a.page -
                b.page ||
              a.createdAt -
                b.createdAt,
          );
        commit(
          {
            ...ref.current,
            notes,
          },
        );
      },
      [
        commit,
      ],
    );

  const updateNote =
    useCallback(
      (
        id: string,
        text: string,
      ) => {
        const body =
          text.trim();
        const old =
          ref.current.notes.find(
            (
              n,
            ) =>
              n.id ===
              id,
          );
        const notes =
          body
            ? ref.current.notes.map(
                (
                  n,
                ) =>
                  n.id ===
                  id
                    ? {
                        ...n,
                        text: body,
                        updatedAt:
                          Date.now(),
                      }
                    : n,
              )
            : ref.current.notes.filter(
                (
                  n,
                ) =>
                  n.id !==
                  id,
              ); // emptying a note deletes it
        commit(
          {
            ...ref.current,
            notes,
            tombstones:
              withTombstones(
                ref.current.tombstones,
                !body &&
                  old
                  ? [
                      tombstoneOf(
                        noteRecord(
                          old,
                        ),
                        Date.now(),
                      ),
                    ]
                  : [],
              ),
          },
        );
      },
      [
        commit,
      ],
    );

  const removeNote =
    useCallback(
      (
        id: string,
      ) => {
        const gone =
          ref.current.notes.find(
            (
              n,
            ) =>
              n.id ===
              id,
          );
        commit(
          {
            ...ref.current,
            notes:
              ref.current.notes.filter(
                (
                  n,
                ) =>
                  n.id !==
                  id,
              ),
            tombstones:
              withTombstones(
                ref.current.tombstones,
                gone
                  ? [
                      tombstoneOf(
                        noteRecord(
                          gone,
                        ),
                        Date.now(),
                      ),
                    ]
                  : [],
              ),
          },
        );
      },
      [
        commit,
      ],
    );

  // Replace the state with what the sync merged in. Saved to disk at once; the place
  // and edit times are the merge's, so they are not bumped.
  const adopt =
    useCallback(
      (
        next: BookState,
      ) =>
        commit(
          next,
        ),
      [
        commit,
      ],
    );
  const getState =
    useCallback(
      () =>
        ref.current,
      [],
    );

  return {
    state,
    ready,
    getState,
    adopt,
    setPage,
    setLoc,
    toggleBookmark,
    removeBookmark,
    addNote,
    updateNote,
    removeNote,
  };
}

/* -------------------------------------------------------------------------- */
/* Account sync                                                               */
/* -------------------------------------------------------------------------- */

/** localStorage flag, per device: "Keep my place and notes on this device only". */
const SYNC_OFF_KEY = 'rmh-reader-sync-off';
/** Opening a book waits this long for the server's copy before it opens on the device's. */
const OPEN_WAIT_MS = 2000;
/** The keepalive request body limit is 64 KiB; stay well under it. */
const KEEPALIVE_MAX_CHARS = 60_000;

function readSyncOff(): boolean {
  try {
    return localStorage.getItem(SYNC_OFF_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSyncOff(off: boolean): void {
  try {
    if (off) localStorage.setItem(SYNC_OFF_KEY, '1');
    else localStorage.removeItem(SYNC_OFF_KEY);
  } catch {
    /* storage unavailable: the choice lasts until the page closes */
  }
}

/** Where the reader stands in the sync, for the details panel. */
export interface ReaderSyncControls {
  /** Signed in: otherwise there is nothing to sync and the panel shows no controls. */
  available: boolean;
  /** "This device only" is on: nothing is sent. */
  off: boolean;
  setOff: (off: boolean) => void;
  /** Delete this book's synced copy; turns syncing off on this device so it is not sent again. */
  removeSynced: () => Promise<boolean>;
}

/**
 * `useBookState` plus account sync for a signed-in reader.
 *
 * Device first: the device store answers every read and write exactly as before, and
 * nothing here waits on the network except the first open, which waits at most
 * `OPEN_WAIT_MS` for the server's copy. On open the server's marks are merged with the
 * device's (union by id, newer edit wins, tombstones win over older edits) and the
 * newer place wins, reported as `continuedFrom` when the server's place won. After that
 * every changed bookmark or note is sent at once, the place at most every 10 s and on
 * page hide, and the `library_doc` history beat every 15 s while the page moves. A failed
 * write is simply sent again with the next one. Signed out, or "this device only", sends
 * nothing and opens at once.
 */
export function useSyncedBookState(
  slug: string,
  opts: { signedIn: boolean; pages: number },
) {
  const marks = useBookState(slug);
  const { getState, adopt } = marks;
  const [off, setOffState] = useState<boolean | null>(null);
  const [settled, setSettled] = useState(false);
  const [continuedFrom, setContinuedFrom] = useState<number | null>(null);
  const enabled = opts.signedIn && off === false;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const pagesRef = useRef(opts.pages);
  pagesRef.current = opts.pages;
  const poke = useRef<() => void>(() => {});
  const session = useRef({
    acked: new Map<string, string>(),
    placeAckAt: 0,
    loaded: false,
  });

  useEffect(() => {
    setOffState(readSyncOff());
  }, []);

  useEffect(() => {
    if (!marks.ready || off === null) return;
    const s = session.current;
    s.acked = new Map();
    s.placeAckAt = 0;
    s.loaded = false;
    poke.current = () => {};
    if (!enabled) {
      setSettled(true);
      return;
    }
    setSettled(false);

    let alive = true;
    let timedOut = false;
    let inFlight = false;
    let again = false;
    let againPlace = false;
    let beatPercent = -1;
    const ctrl = new AbortController();
    const wait = setTimeout(() => {
      timedOut = true;
      setSettled(true);
    }, OPEN_WAIT_MS);

    const flush = (withPlace: boolean, hiding: boolean) => {
      if (!alive || !s.loaded) return;
      const st = getState();
      if (st.slug !== slug) return;
      if (inFlight) {
        again = true;
        againPlace ||= withPlace;
        return;
      }
      const sent = pendingRecords(stateToRecords(st), s.acked).slice(0, MAX_BATCH);
      const placeDue = withPlace && st.page > 0 && (st.placeAt ?? 0) > s.placeAckAt;
      if (sent.length === 0 && !placeDue) return;
      const place = placeDue
        ? { page: st.page, location: st.loc ?? null, updatedAt: st.placeAt ?? 0 }
        : undefined;
      const body = place ? { place, marks: sent } : { marks: sent };
      inFlight = true;
      void api(putReaderMarksApi, {
        params: { slug },
        body,
        keepalive: hiding && JSON.stringify(body).length < KEEPALIVE_MAX_CHARS,
        retries: 0,
      })
        .then((res) => {
          if (!alive) return;
          for (const r of res.marks) s.acked.set(r.id, fingerprint(r));
          // Turned away by a cap: the device keeps it, and it is not offered again.
          for (const id of res.rejected) {
            const r = sent.find((x) => x.id === id);
            if (r) s.acked.set(id, fingerprint(r));
          }
          if (place) s.placeAckAt = Math.max(place.updatedAt, res.place?.updatedAt ?? 0);
          const local = stateToRecords(getState());
          const next = adoptCanonical(local, res.marks, sent);
          if (next.some((r, i) => r !== local[i])) adopt(applyRecords(getState(), next));
          if (pendingRecords(stateToRecords(getState()), s.acked).length > 0) again = true;
        })
        .catch(() => {
          /* offline or refused: these records stay unacknowledged and go with the next save */
        })
        .finally(() => {
          inFlight = false;
          if (again && alive) {
            const withPlaceNext = againPlace;
            again = false;
            againPlace = false;
            flush(withPlaceNext, false);
          }
        });
    };

    const beat = (hiding: boolean) => {
      const pages = pagesRef.current;
      if (!alive || pages <= 0 || slug.length > 64) return;
      const percent = percentRead(getState().page, pages);
      if (percent === beatPercent) return;
      beatPercent = percent;
      void api(recordHistoryBeatApi, {
        body: { entityType: 'library_doc', entityId: slug, position: percent * 100, duration: 10_000 },
        keepalive: hiding,
        retries: 0,
      }).catch(() => {
        beatPercent = -1;
      });
    };

    const placeThrottle = createThrottle(() => flush(true, false), PLACE_PUSH_INTERVAL_MS, {
      cooled: true,
    });
    const beatThrottle = createThrottle(() => beat(false), HISTORY_BEAT_INTERVAL_MS);

    poke.current = () => {
      if (!s.loaded) return;
      flush(false, false); // bookmarks and notes go at once
      placeThrottle.poke();
      if (pagesRef.current > 0) beatThrottle.poke();
    };

    const hide = () => {
      if (!s.loaded) return;
      placeThrottle.cancel();
      flush(true, true);
      beat(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hide();
    };

    const load = () => {
      void api(getReaderMarksApi, { params: { slug }, signal: ctrl.signal, retries: 0 })
        .then((res) => {
          if (!alive || s.loaded) return;
          const st = getState();
          const merged = mergeMarks(stateToRecords(st), res.marks, Date.now()).merged;
          let next = applyRecords(st, merged);
          // Past the wait the reader is already on the device's place; only the marks merge then.
          const pick = timedOut ? null : pickPlace(st, res.place);
          if (pick?.source === 'server') {
            next = { ...next, page: pick.page, placeAt: pick.updatedAt };
            if (pick.loc !== undefined) next.loc = pick.loc;
            else delete next.loc;
            if (pick.continued) setContinuedFrom(pick.page);
          }
          s.acked = new Map(res.marks.map((r) => [r.id, fingerprint(r)]));
          s.placeAckAt = res.place?.updatedAt ?? 0;
          s.loaded = true;
          adopt(next);
          flush(false, false);
          placeThrottle.poke();
          if (pagesRef.current > 0) beatThrottle.poke();
        })
        .catch(() => {
          /* offline: the device's copy is the truth until the next open or the browser is back online */
        })
        .finally(() => {
          clearTimeout(wait);
          if (alive) setSettled(true);
        });
    };
    load();

    const retry = () => {
      if (!s.loaded) load();
      else poke.current();
    };
    window.addEventListener('online', retry);
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      // Leaving the book sends what is pending, unless the reader just turned syncing off.
      if (enabledRef.current) hide();
      alive = false;
      ctrl.abort();
      clearTimeout(wait);
      placeThrottle.cancel();
      beatThrottle.cancel();
      poke.current = () => {};
      window.removeEventListener('online', retry);
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [slug, enabled, off, marks.ready, getState, adopt]);

  // Every change to the device state may have something to send.
  useEffect(() => {
    poke.current();
  }, [marks.state, opts.pages]);

  // The "continued from" notice goes away on its own.
  useEffect(() => {
    if (continuedFrom === null) return;
    const t = setTimeout(() => setContinuedFrom(null), 8000);
    return () => clearTimeout(t);
  }, [continuedFrom]);

  const setOff = useCallback((next: boolean) => {
    writeSyncOff(next);
    setOffState(next);
  }, []);

  const removeSynced = useCallback(async () => {
    try {
      await api(deleteReaderMarksApi, { params: { slug }, retries: 0 });
    } catch {
      return false;
    }
    // This device's copy stays; syncing stops here so it is not sent straight back.
    writeSyncOff(true);
    setOffState(true);
    return true;
  }, [slug]);

  const sync: ReaderSyncControls = {
    available: opts.signedIn,
    off: off === true,
    setOff,
    removeSynced,
  };

  return { ...marks, ready: marks.ready && settled, continuedFrom, sync };
}
