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
import { ArrowLeft, Search } from 'lucide-react';
import { listLibraryBooks, type LibraryBook } from '@/lib/library/library';
import '@/components/library/library.css';

export const Route = createFileRoute('/library/')({
  head: () => ({
    meta: [
      { title: 'Library | RMH Studios' },
      { name: 'description', content: 'Browse and read the RMH Studios library — a shelf of documents, theses, and plans.' },
    ],
  }),
  loader: () => ({ books: listLibraryBooks() }),
  component: Library,
});

function Library() {
  const { books } = Route.useLoaderData();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) => b.title.toLowerCase().includes(q) || b.description.toLowerCase().includes(q),
    );
  }, [books, query]);

  return (
    <main className="vibe-screen lib min-h-screen">
      <header className="vibe-gallery__head">
        <Link to="/" aria-label="Back to home" className="vibe-toolbar__icon">
          <ArrowLeft size={17} />
        </Link>
        <h1 className="vibe-gallery__title">Library</h1>
        <div className="vibe-search">
          <Search size={16} className="vibe-search__icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the library..."
            aria-label="Search the library"
            className="vibe-search__input"
          />
        </div>
      </header>

      {filtered.length === 0 ? (
        <p className="vibe-hint lib__empty">No books match that search.</p>
      ) : (
        <div className="lib__shelf" role="list">
          {filtered.map((book, i) => (
            <BookSpine key={book.slug} book={book} index={i} />
          ))}
        </div>
      )}
    </main>
  );
}

function BookSpine({ book, index }: { book: LibraryBook; index: number }) {
  // Per-book accent, kept subtle so the shelf stays in the monochrome aesthetic.
  const style = {
    '--book-hue': String(book.hue),
    animationDelay: `${(index % 8) * 45}ms`,
  } as React.CSSProperties;

  return (
    <Link
      to="/library/$slug"
      params={{ slug: book.slug }}
      className="lib-book"
      role="listitem"
      style={style}
      aria-label={`Open ${book.title}`}
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
