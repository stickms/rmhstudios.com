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

import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
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
  Menu,
  Newspaper,
  Search,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { SPRING } from '@/lib/motion';
import { useMobileSidebar } from '@/components/feed/MobileSidebarShell';
import { MobileBrandPrefix } from '@/components/feed/MobileHeader';
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
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { useSession } from '@/components/Providers';
import { UploadModal } from '@/components/library/UploadModal';
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

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function Library() {
  const { t } = useTranslation('library');
  const { open: openSidebar } = useMobileSidebar();
  const {
    books: initialBooks,
    posts: blogPosts,
    collections: initialCollections,
    albums,
    playlists,
  } = Route.useLoaderData();
  const { view = 'all' } = Route.useSearch();
  const navigate = useNavigate();
  const setView = (next: LibraryView) =>
    void navigate({ to: '/library', search: next === 'all' ? {} : { view: next }, replace: true });
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
  const [migrating, setMigrating] = useState(false);

  const publicBooks = useMemo(() => books.filter((book) => !book.hidden), [books]);
  const totalPages = useMemo(
    () => publicBooks.reduce((sum, book) => sum + Math.max(0, book.pages), 0),
    [publicBooks],
  );

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
    <>
      <AnimatedMain
        className="vibe-screen lib min-h-screen w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <LibraryRevealProvider>
          {/* Title bar + section tabs share ONE sticky container so the tabs sit
              directly below the title and never slide up behind it — the two used
              to be sibling `sticky top:0` bars, which stacked and overlapped. */}
          <div className="lib-topbar">
            <header className="lib-head">
              <span className="md:hidden">
                <button
                  type="button"
                  onClick={openSidebar}
                  aria-label={t('open-menu', { defaultValue: 'Open menu' })}
                  className="vibe-toolbar__icon"
                >
                  <Menu size={18} />
                </button>
              </span>
              <div className="lib-head__brand">
                <MobileBrandPrefix />
                <BookOpen size={17} aria-hidden="true" />
                <span>{t('library-heading', { defaultValue: 'Library' })}</span>
              </div>
              {session.data && (
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
              )}
            </header>
          </div>

          <section
            // Flagship hero → floating L2 glass slab with edge refraction (§8.4):
            // the library page's one refract slot (+ per-element lens).
            className="lib-hero glass-pane glass-refract"
            data-glass-lens=""
            aria-labelledby="library-title"
          >
            <div className="lib-hero__copy">
              <p className="lib-hero__eyebrow">
                {t('archive-eyebrow', { defaultValue: 'RMH Studios archive' })}
              </p>
              <h1 id="library-title">
                {t('archive-title', { defaultValue: 'A home for long-form thinking.' })}
              </h1>
              <p className="lib-hero__lede">
                {t('archive-description', {
                  defaultValue:
                    'Stories, original research, technical field notes, operating plans, and strange ideas—collected in one quiet reading room.',
                })}
              </p>
            </div>
            <dl
              className="lib-stats"
              aria-label={t('library-totals', { defaultValue: 'Library totals' })}
            >
              <div>
                <dt>{t('stat-volumes', { defaultValue: 'Volumes' })}</dt>
                <dd>{publicBooks.length.toLocaleString()}</dd>
              </div>
              <div>
                <dt>{t('stat-pages', { defaultValue: 'Pages' })}</dt>
                <dd>{formatCount(totalPages)}</dd>
              </div>
              <div>
                <dt>{t('stat-albums', { defaultValue: 'Albums' })}</dt>
                <dd>{albums.length.toLocaleString()}</dd>
              </div>
              <div>
                <dt>{t('stat-collections', { defaultValue: 'Collections' })}</dt>
                <dd>{collections.length.toLocaleString()}</dd>
              </div>
            </dl>
            <label className="lib-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">
                {t('search-label', { defaultValue: 'Search the library' })}
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('search-placeholder', { defaultValue: 'Search books and albums' })}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('clear-search', { defaultValue: 'Clear search' })}
                >
                  <X size={16} />
                </button>
              )}
            </label>
          </section>

          {/* §5.45: section tabs are a standalone glass sheet BELOW the hero slab
              (moved out of the sticky .lib-topbar). The PR #577 single-sticky fix
              is preserved — .lib-head stays the lone sticky row so nothing stacks.
              The lib-nav-active layoutId capsule still flows between chips. */}
          <nav
            className="lib-nav glass-fill glass-bevel-sm w-fit rounded-full p-1"
            aria-label={t('sections-label', { defaultValue: 'Library sections' })}
          >
            <div className="lib-nav__scroll" role="tablist">
              {(
                [
                  { id: 'all', label: t('cat-all', { defaultValue: 'All' }), icon: LayoutGrid },
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
                    id: 'collections',
                    label: t('cat-collections', { defaultValue: 'Collections' }),
                    icon: Layers,
                  },
                  {
                    id: 'reads',
                    label: t('cat-reads', { defaultValue: 'Reads' }),
                    icon: Newspaper,
                  },
                  {
                    id: 'music',
                    label: t('cat-music', { defaultValue: 'Music' }),
                    icon: ListMusic,
                  },
                ] as { id: LibraryView; label: string; icon: LucideIcon }[]
              ).map(({ id, label, icon: Icon }) => {
                const active = view === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`lib-nav__chip${active ? ' is-active' : ''}`}
                    onClick={() => setView(id)}
                  >
                    {active && (
                      <motion.span
                        layoutId="lib-nav-active"
                        className="lib-nav__chip-bg"
                        transition={SPRING.soft}
                        aria-hidden="true"
                      />
                    )}
                    <span className="lib-nav__chip-label">
                      <Icon aria-hidden="true" />
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          {shows('reads') && <LibraryBlogRow posts={blogPosts} />}

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
            />
          )}

          {shows('music') && (
            <section className="lib__section lib__section--catalog lib__section--music">
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
              <PlaylistsColumn initialData={{ playlists }} embedded />
            </section>
          )}

          {shows('books') &&
            (filtered.length === 0 ? (
              <p className="vibe-hint lib__empty">
                {t('no-results', { defaultValue: 'No books match that search.' })}
              </p>
            ) : (
              <>
                <Section
                  title={t('section-curated', { defaultValue: 'Curated' })}
                  books={curated}
                  isAdmin={isAdmin}
                  onEdit={setEditing}
                  onMove={(book, dir) => move(curated, book, dir)}
                  onReorder={(draggedId, targetId) => reorderWithin(curated, draggedId, targetId)}
                  onChanged={refresh}
                />
                <Section
                  title={t('section-community', { defaultValue: 'Community uploads' })}
                  books={community}
                  isAdmin={isAdmin}
                  onEdit={setEditing}
                  onMove={(book, dir) => move(community, book, dir)}
                  onReorder={(draggedId, targetId) => reorderWithin(community, draggedId, targetId)}
                  onChanged={refresh}
                  showAttribution
                />
              </>
            ))}
        </LibraryRevealProvider>
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
      {uploadOpen && (
        <UploadModal isAdmin={isAdmin} onClose={() => setUploadOpen(false)} onUploaded={refresh} />
      )}
      {editing && (
        <LibraryEditModal book={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
    </>
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
  onMove,
  onReorder,
  onChanged,
  showAttribution,
}: {
  title: string;
  books: LibraryBook[];
  isAdmin: boolean;
  onEdit: (book: LibraryBook) => void;
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
    <section className="lib__section lib__section--catalog">
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
  onChanged: () => void;
  dnd?: BookDnd;
}) {
  const { t } = useTranslation('library');
  const revealRef = useReveal();
  const menu = useContextMenu();
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
        className="lib-book"
        style={style}
        draggable={dnd?.draggable ? false : undefined}
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
