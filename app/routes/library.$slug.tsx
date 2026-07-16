/**
 * /library/$slug — Book reader.
 *
 * Resolves the book from the static library metadata and renders it in the custom
 * book-flip PDF viewer (BookReader). Full-bleed, outside the _site sidebar, to
 * match the homepage / gallery / library aesthetic.
 */

import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { lazy, Suspense } from 'react';
import { getBook } from '@/lib/library/library.server';
import { buildCanonical } from '@/lib/seo';
import { bookSchema, jsonLdScript } from '@/lib/schema';
import '@/components/rmhvibe/vibe.css';
import '@/components/library/library.css';

// The reader components pull in three.js / @react-three/fiber (the 3D book-flip
// canvas + the epub rasteriser) — ~1.3 MB of vendor JS. They MUST stay lazy:
// the route tree is eagerly imported (autoCodeSplitting is off), so a top-level
// static import here shipped the three vendor chunk on EVERY page — including the
// homepage, where Lighthouse measured it as the single largest unused-JS offender
// (it also threw a hydration error from the eagerly-mounted canvas). Every other
// 3D/game route already lazy-wraps its heavy component; this route had not.
const BookReader = lazy(() =>
  import('@/components/library/BookReader').then((m) => ({ default: m.BookReader })),
);
const EpubReader = lazy(() =>
  import('@/components/library/EpubReader').then((m) => ({ default: m.EpubReader })),
);

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

function ReaderFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-site-bg">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-site-border border-t-site-accent" />
    </div>
  );
}

function Reader() {
  const { book } = Route.useLoaderData();
  return (
    <Suspense fallback={<ReaderFallback />}>
      {book.format === 'epub' ? <EpubReader book={book} /> : <BookReader book={book} />}
    </Suspense>
  );
}
