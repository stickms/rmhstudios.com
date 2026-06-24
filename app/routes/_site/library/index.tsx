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
import { Menu, Search, Upload, Pencil, CloudUpload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMobileSidebar } from '@/components/feed/MobileSidebarShell';
import { MobileBrandPrefix } from '@/components/feed/MobileHeader';
import { type LibraryBook } from '@/lib/library/library';
import { listAllBooks } from '@/lib/library/library.server';
import { shelfRiseDelay } from '@/components/library/shelf';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { useSession } from '@/components/Providers';
import { UploadModal } from '@/components/library/UploadModal';
import { LibraryEditBar, LibraryEditModal } from '@/components/library/LibraryEditControls';
import '@/components/library/library.css';

const fetchBooks = createServerFn({ method: 'GET' }).handler(async () => ({
  books: await listAllBooks(),
}));

export const Route = createFileRoute('/_site/library/')({
  head: () => ({
    meta: [
      { title: 'Library | RMH Studios' },
      { name: 'description', content: 'Browse and read the RMH Studios library — a shelf of documents, theses, and plans.' },
    ],
  }),
  loader: () => fetchBooks(),
  component: Library,
});

function Library() {
  const { t } = useTranslation('library');
  const { open: openSidebar } = useMobileSidebar();
  const { books: initialBooks } = Route.useLoaderData();
  const session = useSession();
  const isAdmin = Boolean((session.data?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
  const [books, setBooks] = useState<LibraryBook[]>(initialBooks);
  const [query, setQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<LibraryBook | null>(null);
  const [migrating, setMigrating] = useState(false);

  // In edit mode admins load the full list (including hidden books) so they can
  // unhide and manage everything; otherwise mirror the public loader data.
  const refresh = useMemo(
    () => async () => {
      if (isAdmin && editMode) {
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
    [isAdmin, editMode],
  );

  useEffect(() => {
    if (editMode && isAdmin) void refresh();
    if (!editMode) setBooks(initialBooks);
  }, [editMode, isAdmin, refresh, initialBooks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) => b.title.toLowerCase().includes(q) || b.description.toLowerCase().includes(q),
    );
  }, [books, query]);

  const curated = useMemo(() => filtered.filter((b) => b.curated), [filtered]);
  const community = useMemo(() => filtered.filter((b) => !b.curated), [filtered]);

  // Reorder within a section: send every DB-backed id in display order (curated
  // first, then community) so positions stay consistent across both shelves.
  async function move(section: LibraryBook[], book: LibraryBook, dir: -1 | 1) {
    const managed = section.filter((b) => b.id);
    const idx = managed.findIndex((b) => b.id === book.id);
    const swapWith = idx + dir;
    if (idx < 0 || swapWith < 0 || swapWith >= managed.length) return;
    const reordered = [...managed];
    [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];

    const curatedOrder = (section === curated ? reordered : curated).filter((b) => b.id).map((b) => b.id!);
    const communityOrder = (section === community ? reordered : community).filter((b) => b.id).map((b) => b.id!);
    const orderedIds = [...curatedOrder, ...communityOrder];

    const res = await fetch('/api/admin/library/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: orderedIds }),
    }).catch(() => null);
    if (res?.ok) void refresh();
  }

  async function runMigration() {
    setMigrating(true);
    const res = await fetch('/api/admin/library/migrate', { method: 'POST' }).catch(() => null);
    setMigrating(false);
    if (res?.ok) {
      const summary = await res.json().catch(() => null);
      if (summary) {
        window.alert(
          t('migrate-done', {
            migrated: summary.migrated,
            skipped: summary.skipped,
            failed: summary.failed,
            defaultValue: 'Migrated {{migrated}}, skipped {{skipped}}, failed {{failed}}.',
          }),
        );
      }
      void refresh();
    }
  }

  const hasUnmigrated = useMemo(() => books.some((b) => !b.id), [books]);

  return (
    <>
      <AnimatedMain
        className="vibe-screen lib min-h-screen w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <header className="vibe-gallery__head">
          <span className="md:hidden">
            <button type="button" onClick={openSidebar} aria-label={t('open-menu', { defaultValue: 'Open menu' })} className="vibe-toolbar__icon">
              <Menu size={18} />
            </button>
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <MobileBrandPrefix />
            <h1 className="vibe-gallery__title">{t('library-heading', { defaultValue: 'Library' })}</h1>
          </div>
          <div className="vibe-search">
            <Search size={16} className="vibe-search__icon" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search-placeholder', { defaultValue: 'Search the library...' })}
              aria-label={t('search-label', { defaultValue: 'Search the library' })}
              className="vibe-search__input"
            />
          </div>
          {isAdmin && (
            <button
              type="button"
              className={`lib-upload__open ${editMode ? 'is-active' : ''}`}
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editMode}
              aria-label={t('edit-label', { defaultValue: 'Toggle edit mode' })}
            >
              <Pencil size={15} aria-hidden="true" />
              <span className="lib-upload__open-label">
                {editMode ? t('edit-done', { defaultValue: 'Done' }) : t('edit-button', { defaultValue: 'Edit' })}
              </span>
            </button>
          )}
          {session.data && (
            <button
              type="button"
              className="lib-upload__open"
              onClick={() => setUploadOpen(true)}
              aria-label={t('upload-label', { defaultValue: 'Upload a PDF' })}
            >
              <Upload size={15} aria-hidden="true" />
              <span className="lib-upload__open-label">{t('upload-button', { defaultValue: 'Upload' })}</span>
            </button>
          )}
        </header>

        {editMode && isAdmin && hasUnmigrated && (
          <div className="lib-edit__migrate">
            <span>{t('migrate-prompt', { defaultValue: 'Some books are still bundled on disk. Move them to object storage to manage them.' })}</span>
            <button type="button" className="lib-upload__btn lib-upload__btn--primary" onClick={runMigration} disabled={migrating}>
              <CloudUpload size={14} aria-hidden="true" />
              {migrating ? t('migrate-running', { defaultValue: 'Migrating…' }) : t('migrate-button', { defaultValue: 'Migrate to S3' })}
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="vibe-hint lib__empty">{t('no-results', { defaultValue: 'No books match that search.' })}</p>
        ) : (
          <>
            <Section
              title={t('section-curated', { defaultValue: 'Curated' })}
              books={curated}
              editMode={editMode && isAdmin}
              onEdit={setEditing}
              onMove={(book, dir) => move(curated, book, dir)}
              onChanged={refresh}
            />
            <Section
              title={t('section-community', { defaultValue: 'Community uploads' })}
              books={community}
              editMode={editMode && isAdmin}
              onEdit={setEditing}
              onMove={(book, dir) => move(community, book, dir)}
              onChanged={refresh}
              showAttribution
            />
          </>
        )}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
      {uploadOpen && <UploadModal isAdmin={isAdmin} onClose={() => setUploadOpen(false)} onUploaded={refresh} />}
      {editing && <LibraryEditModal book={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </>
  );
}

function Section({
  title,
  books,
  editMode,
  onEdit,
  onMove,
  onChanged,
  showAttribution,
}: {
  title: string;
  books: LibraryBook[];
  editMode: boolean;
  onEdit: (book: LibraryBook) => void;
  onMove: (book: LibraryBook, dir: -1 | 1) => void;
  onChanged: () => void;
  showAttribution?: boolean;
}) {
  if (books.length === 0) return null;
  const managed = books.filter((b) => b.id);
  return (
    <section className="lib__section">
      <h2 className="lib__section-title">{title}</h2>
      <div className="lib__shelf" role="list">
        {books.map((book, i) => {
          const managedIdx = managed.findIndex((b) => b.id === book.id);
          return (
            <BookSpine
              key={book.id ?? book.slug}
              book={book}
              index={i}
              editMode={editMode}
              showAttribution={showAttribution}
              canMoveUp={managedIdx > 0}
              canMoveDown={managedIdx >= 0 && managedIdx < managed.length - 1}
              onMove={(dir) => onMove(book, dir)}
              onEdit={() => onEdit(book)}
              onChanged={onChanged}
            />
          );
        })}
      </div>
    </section>
  );
}

function BookSpine({
  book,
  index,
  editMode,
  showAttribution,
  canMoveUp,
  canMoveDown,
  onMove,
  onEdit,
  onChanged,
}: {
  book: LibraryBook;
  index: number;
  editMode: boolean;
  showAttribution?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation('library');
  const style = {
    '--book-hue': String(book.hue),
    animationDelay: shelfRiseDelay(index),
  } as React.CSSProperties;

  const uploader = book.uploadedBy?.handle
    ? `@${book.uploadedBy.handle}`
    : book.uploadedBy?.name ?? null;
  const date = book.createdAt ? new Date(book.createdAt).toLocaleDateString() : null;

  return (
    <div className={`lib-book__wrap ${book.hidden ? 'is-hidden-book' : ''}`} role="listitem">
      <Link
        to="/library/$slug"
        params={{ slug: book.slug }}
        className="lib-book"
        style={style}
        aria-label={t('open-book', { title: book.title, defaultValue: 'Open {{title}}' })}
      >
        <div className="lib-book__3d">
          <div className={`lib-book__cover ${book.coverUrl ? 'has-cover' : ''}`}>
            <span className="lib-book__edge" aria-hidden="true" />
            {book.coverUrl ? (
              <img className="lib-book__img" src={book.coverUrl} alt={book.title} loading="lazy" decoding="async" />
            ) : (
              <span className="lib-book__title">{book.title}</span>
            )}
            {book.pages > 0 && <span className="lib-book__pages-badge">{book.pages.toLocaleString()} pp</span>}
            {!book.coverUrl && <span className="lib-book__mark">RMH</span>}
            {book.reported && editMode && <span className="lib-book__reported" title={t('reported', { defaultValue: 'Reported' })}>!</span>}
          </div>
          {book.description && <span className="lib-book__desc-pop">{book.description}</span>}
        </div>
        <div className="lib-book__meta">
          <p className="lib-book__name">{book.title}</p>
          {showAttribution && (uploader || date) && (
            <p className="lib-book__by">
              {uploader && <span>{uploader}</span>}
              {uploader && date && <span aria-hidden="true"> · </span>}
              {date && <span>{date}</span>}
            </p>
          )}
        </div>
      </Link>
      {editMode && (
        <LibraryEditBar
          book={book}
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
