/**
 * /library/$slug — Book reader.
 *
 * Resolves the book from the static library metadata and renders it in the custom
 * book-flip PDF viewer (BookReader). Full-bleed, outside the _site sidebar, to
 * match the homepage / gallery / library aesthetic.
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { getLibraryBook } from '@/lib/library/library';
import { BookReader } from '@/components/library/BookReader';
import '@/components/library/library.css';

export const Route = createFileRoute('/library/$slug')({
  loader: ({ params }) => {
    const book = getLibraryBook(params.slug);
    if (!book) throw notFound();
    return { book };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.book.title ?? 'Book';
    const description = loaderData?.book.description ?? 'Read this book in the RMH Studios library.';
    return {
      meta: [
        { title: `${title} | RMH Studios Library` },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:site_name', content: 'RMH Studios' },
      ],
    };
  },
  component: Reader,
});

function Reader() {
  const { book } = Route.useLoaderData();
  return <BookReader book={book} />;
}
