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
import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { BookOpen, CloudUpload, FileText, Menu, Search, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMobileSidebar } from '@/components/feed/MobileSidebarShell';
import { MobileBrandPrefix } from '@/components/feed/MobileHeader';
import { type LibraryBook } from '@/lib/library/library';
import { listAllBooks } from '@/lib/library/library.server';
import { listAlbums } from '@/lib/albums.server';
import { listCollectionsView, type Viewer } from '@/lib/library/collections.server';
import { auth } from '@/lib/auth';
import { getAllPosts, type Post } from '@/lib/blog';
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

export const Route = createFileRoute('/_site/library/')({
  head: () => ({
    meta: [
      { title: 'Library | RMH Studios' },
      { name: 'description', content: 'Browse and read the RMH Studios library — a shelf of documents, theses, and plans.' },
    ],
  }),
  loader: async () => ({
    ...(await fetchBooks()),
    ...(await fetchBlogPosts()),
    ...(await fetchCollections()),
    ...(await fetchAlbums()),
  }),
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
  const { books: initialBooks, posts: blogPosts, collections: initialCollections, albums } = Route.useLoaderData();
  const session = useSession();
  const sessionUser = session.data?.user as { isAdmin?: boolean; handle?: string | null } | undefined;
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
    const communityIds = (isCurated ? community : nextManaged).filter((b) => b.id).map((b) => b.id!);
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
        const reasons = Array.isArray(summary.errors) && summary.errors.length
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
        className="vibe-screen lib min-h-screen w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <LibraryRevealProvider>
        <header className="lib-head">
          <span className="md:hidden">
            <button type="button" onClick={openSidebar} aria-label={t('open-menu', { defaultValue: 'Open menu' })} className="vibe-toolbar__icon">
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
              <span className="lib-upload__open-label">{t('upload-button', { defaultValue: 'Add a book' })}</span>
            </button>
          )}
        </header>

        <section className="lib-hero" aria-labelledby="library-title">
          <div className="lib-hero__copy">
            <p className="lib-hero__eyebrow">{t('archive-eyebrow', { defaultValue: 'RMH Studios archive' })}</p>
            <h1 id="library-title">{t('archive-title', { defaultValue: 'A home for long-form thinking.' })}</h1>
            <p className="lib-hero__lede">
              {t('archive-description', { defaultValue: 'Stories, original research, technical field notes, operating plans, and strange ideas—collected in one quiet reading room.' })}
            </p>
          </div>
          <dl className="lib-stats" aria-label={t('library-totals', { defaultValue: 'Library totals' })}>
            <div><dt>{t('stat-volumes', { defaultValue: 'Volumes' })}</dt><dd>{publicBooks.length.toLocaleString()}</dd></div>
            <div><dt>{t('stat-pages', { defaultValue: 'Pages' })}</dt><dd>{formatCount(totalPages)}</dd></div>
            <div><dt>{t('stat-albums', { defaultValue: 'Albums' })}</dt><dd>{albums.length.toLocaleString()}</dd></div>
            <div><dt>{t('stat-collections', { defaultValue: 'Collections' })}</dt><dd>{collections.length.toLocaleString()}</dd></div>
          </dl>
          <label className="lib-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">{t('search-label', { defaultValue: 'Search the library' })}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search-placeholder', { defaultValue: 'Search books and albums' })}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={t('clear-search', { defaultValue: 'Clear search' })}><X size={16} /></button>
            )}
          </label>
        </section>

        <LibraryBlogRow posts={blogPosts} />

        {isAdmin && hasUnmigrated && (
          <div className="lib-edit__migrate">
            <span>{t('migrate-prompt', { defaultValue: 'Some books are still bundled on disk. Move them to object storage to manage them.' })}</span>
            <button type="button" className="lib-upload__btn lib-upload__btn--primary" onClick={runMigration} disabled={migrating}>
              <CloudUpload size={14} aria-hidden="true" />
              {migrating ? t('migrate-running', { defaultValue: 'Migrating…' }) : t('migrate-button', { defaultValue: 'Migrate to S3' })}
            </button>
          </div>
        )}

        <LibraryAlbums albums={albums} query={query} isAdmin={isAdmin} />

        <LibraryCollections
          books={books}
          collections={collections}
          onChanged={refreshCollections}
          isAdmin={isAdmin}
          myHandle={myHandle}
          canCreate={Boolean(session.data)}
        />

        {filtered.length === 0 ? (
          <p className="vibe-hint lib__empty">{t('no-results', { defaultValue: 'No books match that search.' })}</p>
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
        )}
        </LibraryRevealProvider>
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
      {uploadOpen && <UploadModal isAdmin={isAdmin} onClose={() => setUploadOpen(false)} onUploaded={refresh} />}
      {editing && <LibraryEditModal book={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
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
        <span className="lib__section-count">{t('book-count', { count: books.length, defaultValue: '{{count}} books' })}</span>
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
    : book.uploadedBy?.name ?? null;
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
            {book.pages > 0 && <span className="lib-book__pages-badge">{book.pages.toLocaleString()} pp</span>}
            {!book.coverUrl && <span className="lib-book__mark">RMH</span>}
            {book.reported && isAdmin && <span className="lib-book__reported" title={t('reported', { defaultValue: 'Reported' })}>!</span>}
          </div>
        </div>
        <div className="lib-book__meta">
          <div className="lib-book__facts">
            <span><FileText size={12} aria-hidden="true" />{book.pages > 0 ? t('page-count', { count: book.pages, defaultValue: '{{count}} pages' }) : book.format.toUpperCase()}</span>
            <span>{book.format.toUpperCase()}</span>
          </div>
          <p className="lib-book__name">{book.title}</p>
          <p className={`lib-book__description${book.description ? '' : ' is-muted'}`}>
            {book.description || t('book-description-fallback', { defaultValue: 'Open this volume to explore the full document.' })}
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
