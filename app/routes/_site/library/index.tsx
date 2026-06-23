/**
 * /library — The RMH Studios library.
 *
 * A bookshelf of every PDF in public/library, rendered as interactive 3D books
 * standing on shelves. Each book shows its DeepSeek-generated title + description
 * and links to the custom book-flip reader at /library/$slug. Full-bleed black/
 * white "vibe" aesthetic, mobile-friendly. Book data is static (bundled metadata),
 * so the loader just returns the list — no server round-trip needed.
 */

import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { Menu, Search, Upload } from 'lucide-react';
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
  const { t } = useTranslation("library");
  const { open: openSidebar } = useMobileSidebar();
  const { books } = Route.useLoaderData();
  const session = useSession();
  const [query, setQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) => b.title.toLowerCase().includes(q) || b.description.toLowerCase().includes(q),
    );
  }, [books, query]);

  return (
    <>
    <AnimatedMain
      className="vibe-screen lib min-h-screen w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
      targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
    >
      <header className="vibe-gallery__head">
        {/* Wrapper carries md:hidden — `.vibe-toolbar__icon` sets its own
            display, which would otherwise override the utility on desktop. */}
        <span className="md:hidden">
          <button type="button" onClick={openSidebar} aria-label={t("open-menu", { defaultValue: "Open menu" })} className="vibe-toolbar__icon">
            <Menu size={18} />
          </button>
        </span>
        <div className="flex items-center gap-2 min-w-0">
          <MobileBrandPrefix />
          <h1 className="vibe-gallery__title">{t("library-heading", { defaultValue: "Library" })}</h1>
        </div>
        <div className="vibe-search">
          <Search size={16} className="vibe-search__icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search-placeholder", { defaultValue: "Search the library..." })}
            aria-label={t("search-label", { defaultValue: "Search the library" })}
            className="vibe-search__input"
          />
        </div>
        {session.data && (
          <button
            type="button"
            className="lib-upload__open"
            onClick={() => setUploadOpen(true)}
            aria-label={t("upload-label", { defaultValue: "Upload a PDF" })}
          >
            <Upload size={15} aria-hidden="true" />
            <span className="lib-upload__open-label">{t("upload-button", { defaultValue: "Upload" })}</span>
          </button>
        )}
      </header>

      {filtered.length === 0 ? (
        <p className="vibe-hint lib__empty">{t("no-results", { defaultValue: "No books match that search." })}</p>
      ) : (
        <div className="lib__shelf" role="list">
          {filtered.map((book, i) => (
            <BookSpine key={book.slug} book={book} index={i} />
          ))}
        </div>
      )}
    </AnimatedMain>
    {/* Trailing gutter to match the blog/feed layout */}
    <div className="hidden lg:block w-4 shrink-0" />
    {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} />}
    </>
  );
}

function BookSpine({ book, index }: { book: LibraryBook; index: number }) {
  const { t } = useTranslation("library");
  // Per-book accent, kept subtle so the shelf stays in the monochrome aesthetic.
  const style = {
    '--book-hue': String(book.hue),
    animationDelay: shelfRiseDelay(index),
  } as React.CSSProperties;

  return (
    <Link
      to="/library/$slug"
      params={{ slug: book.slug }}
      className="lib-book"
      role="listitem"
      style={style}
      aria-label={t("open-book", { title: book.title, defaultValue: "Open {{title}}" })}
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
        </div>
        {book.description && <span className="lib-book__desc-pop">{book.description}</span>}
      </div>
      <div className="lib-book__meta">
        <p className="lib-book__name">{book.title}</p>
      </div>
    </Link>
  );
}
