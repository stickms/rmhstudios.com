/**
 * /library/$slug — Book reader.
 *
 * Resolves the book from the static library metadata and renders it in the custom
 * book-flip PDF viewer (BookReader). Full-bleed, outside the _site sidebar, to
 * match the homepage / gallery / library aesthetic.
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getBook } from '@/lib/library/library.server';
import { buildCanonical } from '@/lib/seo';
import { bookSchema, jsonLdScript } from '@/lib/schema';
import { BookReader } from '@/components/library/BookReader';
import { EpubReader } from '@/components/library/EpubReader';
import '@/components/library/library.css';

const fetchBook = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const book = await getBook(slug);
    return { book: book ?? null };
  });

export const Route = createFileRoute('/library/$slug')({
  loader: async ({ params }) => {
    const { book } = await fetchBook({ data: params.slug });
    if (!book) throw notFound();
    return { book };
  },
  head: ({ loaderData, params }) => {
    const title = loaderData?.book.title ?? 'Book';
    const description = loaderData?.book.description ?? 'Read this book in the RMH Studios library.';
    const author = (loaderData?.book as { author?: string | null } | undefined)?.author ?? undefined;
    return {
      meta: [
        { title: `${title} | RMH Studios Library` },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:site_name', content: 'RMH Studios' },
      ],
      links: [buildCanonical(`/library/${params.slug}`)],
      scripts: loaderData
        ? [
            jsonLdScript(
              bookSchema({
                name: title,
                description,
                path: `/library/${params.slug}`,
                author: author ?? undefined,
              }),
            ),
          ]
        : [],
    };
  },
  component: Reader,
});

function Reader() {
  const { book } = Route.useLoaderData();
  return book.format === 'epub' ? <EpubReader book={book} /> : <BookReader book={book} />;
}
