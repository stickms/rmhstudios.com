/**
 * /library — The RMH Studios library.
 *
 * A bookshelf of every PDF in the catalog, rendered as interactive 3D books
 * standing on shelves. The shelf is split into a "Curated" section (bundled +
 * admin/official books) and a "Community" section (user uploads). Each book
 * shows its DeepSeek-generated title + description and links to the custom
 * book-flip reader at /library/$slug.
 *
 * Admins can flip on an edit mode to reorder, edit, curate, hide or delete books
 * and to migrate the bundled catalog into object storage.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { runLiquidOpen, liquidVTName } from '@/lib/view-transition';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import {
  BookOpen,
  CloudUpload,
  Disc3,
  FileText,
  Layers,
  LayoutGrid,
  ListMusic,
  Newspaper,
  Rotate3d,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type LiquidTab } from '@/components/ui/liquid-tabs';
import { PageTabs } from '@/components/feed/PageTabs';
import { SearchField } from '@/components/ui/search-field';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { type LibraryBook } from '@/lib/library/library';
import { listAllBooks } from '@/lib/library/library.server';
import { listAlbums } from '@/lib/albums.server';
import { listCollectionsView, type Viewer } from '@/lib/library/collections.server';
import { listPlaylists } from '@/lib/playlists.server';
import { auth } from '@/lib/auth';
import { getAllPosts, type Post } from '@/lib/blog';
import { PlaylistsColumn } from '@/components/feed/PlaylistsColumn';
import { LibraryBlogRow } from '@/components/library/LibraryBlogRow';
import { LibraryRevealProvider, useReveal } from '@/components/library/LibraryReveal';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { suppressNextScrollReset } from '@/hooks/useScrollRestoration';
import { UploadModal } from '@/components/library/UploadModal';
import { Book3DViewer } from '@/components/library/Book3DViewer';
import { BookContextMenu, LibraryEditModal } from '@/components/library/LibraryEditControls';
import { useContextMenu } from '@/components/library/LibraryContextMenu';
import { LibraryCollections } from '@/components/library/LibraryCollections';
import { LibraryAlbums } from '@/components/library/LibraryAlbums';
import { BlurImage } from '@/components/ui/BlurImage';
import type { CollectionView } from '@/lib/library/collections';
import '@/components/rmhvibe/vibe.css';
import '@/components/library/library.css';

const fetchBooks = createServerFn({ method: 'GET' }).handler(async () => ({
  books: await listAllBooks(),
}));

// Albums and collections are both seeded from the loader (not fetched on mount)
// so they're present at first paint and the entrance animation can flow
// blog → albums → collections → books in true document order (the LibraryReveal
// observer sorts by on-screen position, so this follows the JSX order below)
// instead of popping in late.
const fetchCollections = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  const viewer: Viewer = session
    ? { id: session.user.id, isAdmin: Boolean((session.user as { isAdmin?: boolean }).isAdmin) }
    : null;
  return { collections: await listCollectionsView(viewer) };
});

// Blog posts now lead the library page (the former /blog page is merged in here).
// getAllPosts already returns newest-first, so the row reads most-recent-on-left.
const fetchBlogPosts = createServerFn({ method: 'GET' }).handler(async () => ({
  posts: (await getAllPosts(['title', 'date', 'slug', 'description', 'tags'])) as Partial<Post>[],
}));

const fetchAlbums = createServerFn({ method: 'GET' }).handler(async () => ({
  albums: await listAlbums(),
}));

// The former standalone /playlists page is folded into the library as the
// "Music" section. Signed-out visitors get null (the section shows a sign-in
// prompt), mirroring the old page's behavior.
const fetchPlaylists = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { playlists: null };
  return { playlists: await listPlaylists(session.user.id) };
});

// The library grew past a comfortable single scroll (reads + albums +
// collections + books + music). A sticky category navigator filters to one
// section; the active category is mirrored into `?view=` so deep links (e.g.
// the /playlists redirect → /library?view=music) land on the right section.
const LIBRARY_VIEWS = ['all', 'reads', 'albums', 'collections', 'books', 'music'] as const;
type LibraryView = (typeof LIBRARY_VIEWS)[number];

// useLayoutEffect warns during SSR; the scroll settle below only ever has work
// to do after a client-side tab press, so useEffect is an identical no-op there.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const Route = createFileRoute('/_site/library/')({
  head: () => ({
    meta: [
      { title: 'Library | RMH Studios' },
      {
        name: 'description',
        content:
          'Browse and read the RMH Studios library — a shelf of documents, theses, and plans.',
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { view?: LibraryView } => {
    const view = search.view;
    return LIBRARY_VIEWS.includes(view as LibraryView) ? { view: view as LibraryView } : {};
  },
  // perf audit §4.2: the server fns were awaited sequentially — serial HTTP
  // round trips on client nav / serial DB reads on SSR. They're independent, so
  // run them in parallel.
  loader: async () => {
    const [books, blog, collections, albums, playlists] = await Promise.all([
      fetchBooks(),
      fetchBlogPosts(),
      fetchCollections(),
      fetchAlbums(),
      fetchPlaylists(),
    ]);
    return { ...books, ...blog, ...collections, ...albums, ...playlists };
  },
  component: Library,
});

function resetLibraryOrbit(element: HTMLElement | null) {
  if (!element) return;
  element.style.setProperty('--lib-orbit-x', '0deg');
  element.style.setProperty('--lib-orbit-y', '0deg');
  element.style.setProperty('--lib-orbit-glow-x', '50%');
  element.style.setProperty('--lib-orbit-glow-y', '50%');
  element.removeAttribute('data-orbit-active');
}

/**
 * One delegated pointer handler powers every playful glass object on the page.
 * It writes CSS variables directly (no React renders during pointer movement),
 * works with a fine pointer and a finger while it is down, and leaves scrolling
 * fully native on touch devices.
 */
function useLibraryOrbit() {
  const active = useRef<HTMLElement | null>(null);

  useEffect(() => () => resetLibraryOrbit(active.current), []);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' && event.buttons === 0) return;
    const target = (event.target as Element).closest<HTMLElement>('[data-library-orbit]');
    if (!target || !event.currentTarget.contains(target)) {
      resetLibraryOrbit(active.current);
      active.current = null;
      return;
    }

    if (active.current !== target) resetLibraryOrbit(active.current);
    active.current = target;

    const rect = target.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    target.style.setProperty('--lib-orbit-x', `${((0.5 - y) * 7).toFixed(2)}deg`);
    target.style.setProperty('--lib-orbit-y', `${((x - 0.5) * 8).toFixed(2)}deg`);
    target.style.setProperty('--lib-orbit-glow-x', `${(x * 100).toFixed(1)}%`);
    target.style.setProperty('--lib-orbit-glow-y', `${(y * 100).toFixed(1)}%`);
    target.setAttribute('data-orbit-active', '');
  };

  const onPointerLeave = () => {
    resetLibraryOrbit(active.current);
    active.current = null;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') onPointerLeave();
  };

  return { onPointerMove, onPointerLeave, onPointerCancel: onPointerLeave, onPointerUp };
}

function Library() {
  const { t } = useTranslation('library');
  const {
    books: initialBooks,
    posts: blogPosts,
    collections: initialCollections,
    albums,
    playlists,
  } = Route.useLoaderData();
  const { view: routeView = 'all' } = Route.useSearch();
  const navigate = useNavigate();
  const [view, setActiveView] = useState<LibraryView>(routeView);
  const [hasFiltered, setHasFiltered] = useState(false);
  const orbit = useLibraryOrbit();
  const reducedMotion = useReducedMotion();

  useEffect(() => setActiveView(routeView), [routeView]);

  // Switching category swaps whole sections out of the document, so the page can
  // get much shorter than it was — and a shorter page means the browser clamps
  // the scroll offset, which reads as the library snapping back to the top. The
  // pin below freezes the old height across the swap so nothing moves on its
  // own; the settle effect then either leaves the scroll exactly where it was
  // (the new view is tall enough) or glides up to the new bottom.
  const playgroundRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTop = useRef<number | null>(null);
  const releasePin = useRef<(() => void) | null>(null);

  const setView = (next: LibraryView) => {
    if (next === view) return;
    // Any settle still running belongs to the previous press — retire it before
    // this one takes over so the two can't fight over the pin.
    releasePin.current?.();
    const ground = playgroundRef.current;
    if (ground) ground.style.minHeight = `${ground.offsetHeight}px`;
    pendingScrollTop.current = window.scrollY || document.documentElement.scrollTop;
    setHasFiltered(true);
    setActiveView(next);
    // The URL only mirrors the filter — nobody is going anywhere, so claim this
    // href change before it lands (`resetScroll: false` covers the router; the
    // shared scroller needs telling separately).
    suppressNextScrollReset('/library');
    // Fire-and-forget: the filter is already applied locally, so a transient
    // history-sync failure must not break the interaction.
    void navigate({
      to: '/library',
      search: next === 'all' ? {} : { view: next },
      replace: true,
      resetScroll: false,
    }).catch(() => {});
  };

  useIsoLayoutEffect(() => {
    const from = pendingScrollTop.current;
    if (from === null) return;
    pendingScrollTop.current = null;

    const ground = playgroundRef.current;
    const scrollLeft = window.scrollX;
    // The new view is committed but the pin still holds the old height, so the
    // scroll offset is untouched. Drop the pin for one measurement to learn how
    // far the page can actually scroll now, then put it straight back.
    const pinned = ground?.style.minHeight ?? '';
    if (ground) ground.style.minHeight = '';
    const bottom = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (ground) ground.style.minHeight = pinned;

    const unpin = () => {
      if (ground) ground.style.removeProperty('min-height');
    };

    // `behavior: 'instant'` is load-bearing: `html { scroll-behavior: smooth }`
    // is global, so a bare `scrollTo(x, y)` here would ANIMATE the hold — the
    // page would visibly slide back to where it already was.
    const hold = () => window.scrollTo({ left: scrollLeft, top: from, behavior: 'instant' });

    // Enough room below: stay put. Two bounded one-shots cover anything that
    // nudges the offset as the navigation commits (rather than a running
    // animation-frame loop); with the reset suppressed they are usually no-ops.
    if (from <= bottom) {
      hold();
      const timers = [window.setTimeout(hold, 0), window.setTimeout(hold, 50)];
      const done = () => {
        timers.forEach(window.clearTimeout);
        unpin();
        releasePin.current = null;
      };
      releasePin.current = done;
      return () => {
        timers.forEach(window.clearTimeout);
        unpin();
      };
    }

    // Not enough room below: the scroll has to move, so move it deliberately —
    // hold the old offset, then glide to the new bottom from there.
    hold();
    if (reducedMotion) {
      window.scrollTo({ left: scrollLeft, top: bottom, behavior: 'instant' });
      unpin();
      return;
    }

    // The pin outlives the animation — released early, the document collapses
    // mid-glide and the browser jumps the rest of the way, which is the exact
    // snap this is here to avoid.
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('scrollend', onScrollEnd);
      window.clearTimeout(fallback);
      unpin();
      releasePin.current = null;
    };
    // Only the glide's OWN end may release the pin. `hold()` above is itself a
    // scroll and fires its own `scrollend`; taking that one at face value
    // unpinned the page before the glide had started. The timeout is the
    // fallback for browsers without `scrollend` and for a glide the user
    // interrupts partway.
    const onScrollEnd = () => {
      if (Math.abs(window.scrollY - bottom) <= 2) finish();
    };
    const fallback = window.setTimeout(finish, 900);
    const frame = requestAnimationFrame(() => {
      window.addEventListener('scrollend', onScrollEnd);
      window.scrollTo({ left: scrollLeft, top: bottom, behavior: 'smooth' });
    });
    releasePin.current = () => {
      cancelAnimationFrame(frame);
      finish();
    };
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scrollend', onScrollEnd);
      window.clearTimeout(fallback);
      unpin();
    };
  }, [view, reducedMotion]);

  // A section renders when we're on "All" or on its own category.
  const shows = (id: LibraryView) => view === 'all' || view === id;
  const session = useSession();
  const sessionUser = session.data?.user as
    { isAdmin?: boolean; handle?: string | null } | undefined;
  const isAdmin = Boolean(sessionUser?.isAdmin);
  const myHandle = sessionUser?.handle ?? null;
  const [books, setBooks] = useState<LibraryBook[]>(initialBooks);
  const [collections, setCollections] = useState<CollectionView[]>(initialCollections);
  const [query, setQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryBook | null>(null);
  // The book currently being turned over in the 3D viewer, if any.
  const [inspecting, setInspecting] = useState<LibraryBook | null>(null);
  const [migrating, setMigrating] = useState(false);

  // Admins load the full list (including hidden books) so they can manage
  // everything via the per-item right-click menu; everyone else mirrors the
  // public loader data.
  const refresh = useMemo(
    () => async () => {
      if (isAdmin) {
        const res = await fetch('/api/admin/library').catch(() => null);
        if (res?.ok) {
          const data = await res.json().catch(() => null);
          if (data?.books) {
            setBooks(data.books as LibraryBook[]);
            return;
          }
        }
      }
      const data = await fetchBooks().catch(() => null);
      if (data?.books) setBooks(data.books);
    },
    [isAdmin],
  );

  // Admins pull the full (incl. hidden) catalog on load so management works
  // anywhere; non-admins keep the loader's public list.
  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  // Collections are owned here (not inside LibraryCollections) so the main shelf
  // can hide books that already live in a collection, and stay in sync after edits.
  const refreshCollections = useMemo(
    () => async () => {
      const res = await fetch('/api/library/collections').catch(() => null);
      if (!res?.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.collections) setCollections(data.collections as CollectionView[]);
    },
    [],
  );

  // Slugs already shown inside a collection — don't repeat them in the main list.
  const collectedSlugs = useMemo(
    () => new Set(collections.flatMap((c) => c.books.map((b) => b.slug))),
    [collections],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (collectedSlugs.has(b.slug)) return false;
      if (!q) return true;
      return b.title.toLowerCase().includes(q) || b.description.toLowerCase().includes(q);
    });
  }, [books, query, collectedSlugs]);


  // Sections render in manual order (position), title as a stable tiebreak — so
  // admin reordering (arrows + drag) actually takes effect.
  const byOrder = (a: LibraryBook, b: LibraryBook) =>
    (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title);
  const curated = useMemo(() => filtered.filter((b) => b.curated).sort(byOrder), [filtered]);
  const community = useMemo(() => filtered.filter((b) => !b.curated).sort(byOrder), [filtered]);

  // Persist a new order: positions become each managed id's index across both
  // sections (curated first). Applied optimistically so the move feels instant.
  async function applyOrder(orderedIds: string[]) {
    const pos = new Map(orderedIds.map((id, i) => [id, i]));
    setBooks((prev) =>
      prev.map((b) => (b.id && pos.has(b.id) ? { ...b, position: pos.get(b.id) } : b)),
    );
    const res = await fetch('/api/admin/library/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: orderedIds }),
    }).catch(() => null);
    if (!res?.ok) void refresh(); // resync on failure
  }

  // Build the combined id order after replacing `section` with `nextManaged`.
  function commitOrder(section: LibraryBook[], nextManaged: LibraryBook[]) {
    const isCurated = section === curated;
    const curatedIds = (isCurated ? nextManaged : curated).filter((b) => b.id).map((b) => b.id!);
    const communityIds = (isCurated ? community : nextManaged)
      .filter((b) => b.id)
      .map((b) => b.id!);
    void applyOrder([...curatedIds, ...communityIds]);
  }

  // Arrow reorder (keyboard-accessible).
  function move(section: LibraryBook[], book: LibraryBook, dir: -1 | 1) {
    const managed = section.filter((b) => b.id);
    const idx = managed.findIndex((b) => b.id === book.id);
    const swapWith = idx + dir;
    if (idx < 0 || swapWith < 0 || swapWith >= managed.length) return;
    const next = [...managed];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    commitOrder(section, next);
  }

  // Drag-and-drop reorder: move `draggedId` to where `targetId` sits.
  function reorderWithin(section: LibraryBook[], draggedId: string, targetId: string) {
    const managed = section.filter((b) => b.id);
    const from = managed.findIndex((b) => b.id === draggedId);
    const to = managed.findIndex((b) => b.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...managed];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitOrder(section, next);
  }

  async function runMigration() {
    setMigrating(true);
    const res = await fetch('/api/admin/library/migrate', { method: 'POST' }).catch(() => null);
    setMigrating(false);
    if (res?.ok) {
      const summary = await res.json().catch(() => null);
      if (summary) {
        const base = t('migrate-done', {
          migrated: summary.migrated,
          skipped: summary.skipped,
          failed: summary.failed,
          defaultValue: 'Migrated {{migrated}}, skipped {{skipped}}, failed {{failed}}.',
        });
        const reasons =
          Array.isArray(summary.errors) && summary.errors.length
            ? `\n\n${summary.errors.join('\n')}`
            : '';
        window.alert(base + reasons);
      }
      void refresh();
    }
  }

  const hasUnmigrated = useMemo(() => books.some((b) => !b.id), [books]);

  return (
    <PageLayout
      title={t('library-heading', { defaultValue: 'Library' })}
      description={t('archive-description', {
        defaultValue:
          'Books, photo albums, essays, playlists, field notes, and strange ideas—floating together in one playful archive.',
      })}
      headerRight={
        // The page's one control, in the shared header's action slot. It used to
        // sit in a bespoke `.lib-head` bar above a full-width hero slab; the bar
        // and the hero are gone so this page opens exactly like every other one.
        // The playground, the explorer and the shelves below are untouched — and
        // so is the per-book 3D inspect button, which is where turning a volume
        // over with the phone lives now.
        session.data ? (
          <button
            type="button"
            className="lib-upload__open"
            onClick={() => setUploadOpen(true)}
            aria-label={t('upload-label', { defaultValue: 'Upload a PDF' })}
          >
            <Upload size={15} aria-hidden="true" />
            <span className="lib-upload__open-label">
              {t('upload-button', { defaultValue: 'Add a book' })}
            </span>
          </button>
        ) : undefined
      }
    >
      <div className="vibe-screen lib lib--glass-playground min-h-screen">
        {/* The strip sits OUTSIDE `.lib-playground`. The playground is the 3D
            stage for the shelf — it owns the perspective, the orbit handlers and
            its own `--lib-gutter` inset — and page chrome inside it inherited
            that inset, which is what still left this strip 710px wide against
            everyone else's 766px after the explorer card was gone. */}
        {/* Tabs, then the field — the shared order every tabbed page uses
                (`PageTabs`). This was a single `.lib-explorer` glass card that
                held the search ABOVE the strip and gave both its own padding,
                which is why the library's strip was 694px wide where its
                neighbours' were 766px and why its search sat where their tabs
                did. The category counts still ride on the tabs themselves. */}
        <PageTabs
          tabs={
            [
              {
                id: 'all',
                label: t('cat-all', { defaultValue: 'Everything' }),
                icon: LayoutGrid,
              },
              {
                id: 'books',
                label: t('cat-books', { defaultValue: 'Books' }),
                icon: BookOpen,
              },
              {
                id: 'albums',
                label: t('cat-albums', { defaultValue: 'Albums' }),
                icon: Disc3,
              },
              {
                id: 'music',
                label: t('cat-music', { defaultValue: 'Music' }),
                icon: ListMusic,
              },
              {
                id: 'collections',
                label: t('cat-collections', { defaultValue: 'Collections' }),
                icon: Layers,
              },
              {
                id: 'reads',
                label: t('cat-reads', { defaultValue: 'Reads' }),
                icon: Newspaper,
              },
            ] as LiquidTab[]
          }
          value={view}
          onChange={(next) => setView(next as LibraryView)}
          aria-label={t('sections-label', { defaultValue: 'Library sections' })}
          search={
            <SearchField
              value={query}
              onValueChange={setQuery}
              aria-label={t('search-label', { defaultValue: 'Search the library' })}
              placeholder={t('search-placeholder', {
                defaultValue: 'Search books, albums, playlists, and reads…',
              })}
            />
          }
        />

        <div className="lib-playground" ref={playgroundRef} {...orbit}>
          <LibraryRevealProvider instant={hasFiltered}>
            {shows('reads') && <LibraryBlogRow posts={blogPosts} query={query} />}

            {shows('books') && isAdmin && hasUnmigrated && (
              <div className="lib-edit__migrate">
                <span>
                  {t('migrate-prompt', {
                    defaultValue:
                      'Some books are still bundled on disk. Move them to object storage to manage them.',
                  })}
                </span>
                <button
                  type="button"
                  className="lib-upload__btn lib-upload__btn--primary"
                  onClick={runMigration}
                  disabled={migrating}
                >
                  <CloudUpload size={14} aria-hidden="true" />
                  {migrating
                    ? t('migrate-running', { defaultValue: 'Migrating…' })
                    : t('migrate-button', { defaultValue: 'Migrate to S3' })}
                </button>
              </div>
            )}

            {shows('albums') && <LibraryAlbums albums={albums} query={query} isAdmin={isAdmin} />}

            {shows('collections') && (
              <LibraryCollections
                books={books}
                collections={collections}
                onChanged={refreshCollections}
                isAdmin={isAdmin}
                myHandle={myHandle}
                canCreate={Boolean(session.data)}
                query={query}
              />
            )}

            {shows('music') && (
              <section className="lib__section lib__section--catalog lib__section--music glass-fill lib-section-shell">
                <div className="lib__section-head">
                  <h2 className="lib__section-title">
                    {t('section-music', { defaultValue: 'Music' })}
                  </h2>
                  {playlists && (
                    <span className="lib__section-count">
                      {t('playlist-count', {
                        count: playlists.length,
                        defaultValue: '{{count}} playlists',
                      })}
                    </span>
                  )}
                </div>
                <PlaylistsColumn initialData={{ playlists }} embedded searchQuery={query} />
              </section>
            )}

            {shows('books') &&
              (filtered.length === 0 ? (
                // Canonical EmptyState, and state-aware copy: the bare
                // "No books match that search." line claimed a search was
                // responsible even when the field was untouched. (The music
                // section on this same page already used EmptyState.)
                <EmptyState
                  icon={BookOpen}
                  title={
                    query
                      ? t('no-results', { defaultValue: 'No books match that search.' })
                      : t('no-books-title', { defaultValue: 'No books here yet' })
                  }
                  description={
                    query
                      ? t('no-results-hint', {
                          defaultValue: 'Try a different title, author, or subject.',
                        })
                      : t('no-books-hint', {
                          defaultValue: 'Books added to the library will show up here.',
                        })
                  }
                  action={
                    query ? (
                      <Button variant="outline" onClick={() => setQuery('')}>
                        {t('clear-search', { defaultValue: 'Clear search' })}
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <Section
                    title={t('section-curated', { defaultValue: 'Curated' })}
                    books={curated}
                    isAdmin={isAdmin}
                    onEdit={setEditing}
                    onInspect={setInspecting}
                    onMove={(book, dir) => move(curated, book, dir)}
                    onReorder={(draggedId, targetId) => reorderWithin(curated, draggedId, targetId)}
                    onChanged={refresh}
                  />
                  <Section
                    title={t('section-community', { defaultValue: 'Community uploads' })}
                    books={community}
                    isAdmin={isAdmin}
                    onEdit={setEditing}
                    onInspect={setInspecting}
                    onMove={(book, dir) => move(community, book, dir)}
                    onReorder={(draggedId, targetId) =>
                      reorderWithin(community, draggedId, targetId)
                    }
                    onChanged={refresh}
                    showAttribution
                  />
                </>
              ))}
          </LibraryRevealProvider>
        </div>
      </div>
      {uploadOpen && (
        <UploadModal isAdmin={isAdmin} onClose={() => setUploadOpen(false)} onUploaded={refresh} />
      )}
      {editing && (
        <LibraryEditModal book={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
      {inspecting && <Book3DViewer book={inspecting} onClose={() => setInspecting(null)} />}
    </PageLayout>
  );
}

type BookDnd = {
  draggable: boolean;
  dragging: boolean;
  dragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
};

function Section({
  title,
  books,
  isAdmin,
  onEdit,
  onInspect,
  onMove,
  onReorder,
  onChanged,
  showAttribution,
}: {
  title: string;
  books: LibraryBook[];
  isAdmin: boolean;
  onEdit: (book: LibraryBook) => void;
  onInspect: (book: LibraryBook) => void;
  onMove: (book: LibraryBook, dir: -1 | 1) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  onChanged: () => void;
  showAttribution?: boolean;
}) {
  const { t } = useTranslation('library');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  if (books.length === 0) return null;
  const managed = books.filter((b) => b.id);

  const dndFor = (book: LibraryBook): BookDnd | undefined =>
    isAdmin && book.id
      ? {
          draggable: true,
          dragging: dragId === book.id,
          dragOver: overId === book.id && dragId !== book.id,
          onDragStart: () => setDragId(book.id!),
          onDragEnter: () => setOverId(book.id!),
          onDragOver: (e) => e.preventDefault(), // allow drop
          onDragLeave: () => setOverId((prev) => (prev === book.id ? null : prev)),
          onDrop: (e) => {
            e.preventDefault();
            if (dragId && dragId !== book.id) onReorder(dragId, book.id!);
            setDragId(null);
            setOverId(null);
          },
          onDragEnd: () => {
            setDragId(null);
            setOverId(null);
          },
        }
      : undefined;

  return (
    <section className="lib__section lib__section--catalog glass-fill lib-section-shell">
      <div className="lib__section-head">
        <h2 className="lib__section-title">{title}</h2>
        <span className="lib__section-count">
          {t('book-count', { count: books.length, defaultValue: '{{count}} books' })}
        </span>
      </div>
      <div className="lib__shelf lib__shelf--catalog" role="list">
        {books.map((book) => {
          const managedIdx = managed.findIndex((b) => b.id === book.id);
          return (
            <BookSpine
              key={book.id ?? book.slug}
              book={book}
              isAdmin={isAdmin}
              showAttribution={showAttribution}
              canMoveUp={managedIdx > 0}
              canMoveDown={managedIdx >= 0 && managedIdx < managed.length - 1}
              onMove={(dir) => onMove(book, dir)}
              onEdit={() => onEdit(book)}
              onInspect={() => onInspect(book)}
              onChanged={onChanged}
              dnd={dndFor(book)}
            />
          );
        })}
      </div>
    </section>
  );
}

function BookSpine({
  book,
  isAdmin,
  showAttribution,
  canMoveUp,
  canMoveDown,
  onMove,
  onEdit,
  onInspect,
  onChanged,
  dnd,
}: {
  book: LibraryBook;
  isAdmin: boolean;
  showAttribution?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onEdit: () => void;
  onInspect: () => void;
  onChanged: () => void;
  dnd?: BookDnd;
}) {
  const { t } = useTranslation('library');
  const revealRef = useReveal();
  const menu = useContextMenu();
  const navigate = useNavigate();
  const style = {
    '--book-hue': String(book.hue),
  } as React.CSSProperties;

  const uploader = book.uploadedBy?.handle
    ? `@${book.uploadedBy.handle}`
    : (book.uploadedBy?.name ?? null);
  const date = book.createdAt ? new Date(book.createdAt).toLocaleDateString() : null;

  const wrapClass = [
    'lib-book__wrap',
    'lib-volume',
    'lib-reveal',
    book.hidden ? 'is-hidden-book' : '',
    dnd?.draggable ? 'is-draggable' : '',
    dnd?.dragging ? 'is-dragging' : '',
    dnd?.dragOver ? 'is-drag-over' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={revealRef}
      className={wrapClass}
      role="listitem"
      draggable={dnd?.draggable}
      onDragStart={dnd?.onDragStart}
      onDragEnter={dnd?.onDragEnter}
      onDragOver={dnd?.onDragOver}
      onDragLeave={dnd?.onDragLeave}
      onDrop={dnd?.onDrop}
      onDragEnd={dnd?.onDragEnd}
      onContextMenu={isAdmin ? menu.openAt : undefined}
    >
      <Link
        to="/library/$slug"
        params={{ slug: book.slug }}
        className="lib-book glass-fill glass-interactive lib-orbit-card"
        data-glass-light=""
        data-library-orbit=""
        style={style}
        draggable={dnd?.draggable ? false : undefined}
        // §5.48: the book cover liquidly expands into the reader's hero stage.
        // Name set only at click time (tag the cover child).
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          const cover = e.currentTarget.querySelector('.lib-book__cover') as HTMLElement | null;
          runLiquidOpen(cover, liquidVTName('book', book.slug), () =>
            navigate({ to: '/library/$slug', params: { slug: book.slug } } as never),
          );
        }}
        aria-label={t('open-book', { title: book.title, defaultValue: 'Open {{title}}' })}
      >
        <div className="lib-book__3d">
          <div className={`lib-book__cover ${book.coverUrl ? 'has-cover' : ''}`}>
            <span className="lib-book__edge" aria-hidden="true" />
            {book.coverUrl ? (
              <BlurImage
                src={book.coverUrl}
                alt=""
                fit="cover"
                width={380}
                sizes="(max-width: 560px) 148px, 184px"
                className="absolute inset-0 z-0 h-full w-full rounded-[3px_6px_6px_3px]"
                imgClassName="h-full w-full object-top"
              />
            ) : (
              <span className="lib-book__title">{book.title}</span>
            )}
            {book.pages > 0 && (
              <span className="lib-book__pages-badge">{book.pages.toLocaleString()} pp</span>
            )}
            {!book.coverUrl && <span className="lib-book__mark">RMH</span>}
            {book.reported && isAdmin && (
              <span
                className="lib-book__reported"
                title={t('reported', { defaultValue: 'Reported' })}
              >
                !
              </span>
            )}
          </div>
        </div>
        <div className="lib-book__meta">
          <div className="lib-book__facts">
            <span>
              <FileText size={12} aria-hidden="true" />
              {book.pages > 0
                ? t('page-count', { count: book.pages, defaultValue: '{{count}} pages' })
                : book.format.toUpperCase()}
            </span>
            <span>{book.format.toUpperCase()}</span>
          </div>
          <p className="lib-book__name">{book.title}</p>
          <p className={`lib-book__description${book.description ? '' : ' is-muted'}`}>
            {book.description ||
              t('book-description-fallback', {
                defaultValue: 'Open this volume to explore the full document.',
              })}
          </p>
          {showAttribution && (uploader || date) && (
            <p className="lib-book__by">
              {uploader && <span>{uploader}</span>}
              {uploader && date && <span aria-hidden="true"> · </span>}
              {date && <span>{date}</span>}
            </p>
          )}
        </div>
      </Link>
      {/* A sibling of the Link, not a child: a button inside an anchor is
          invalid, and this has to be reachable on a phone where the card's own
          hover 3D never fires. */}
      <button
        type="button"
        className="lib-book__inspect"
        onClick={onInspect}
        aria-label={t('book3d-open', { title: book.title, defaultValue: 'View {{title}} in 3D' })}
      >
        <Rotate3d size={15} aria-hidden="true" />
      </button>
      {isAdmin && (
        <BookContextMenu
          book={book}
          pos={menu.pos}
          onClose={menu.close}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMove={onMove}
          onEdit={onEdit}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
