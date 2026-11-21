import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useSession } from '@/components/Providers';
import type { ContinueBook } from '@/lib/library/reader-sync.contract';
import { continueReadingQuery } from '@/lib/library/reader-sync.queries';
import { cn } from '@/lib/utils';

type Load =
  | {
      status: 'loading';
    }
  | {
      status: 'error';
    }
  | {
      status: 'ready';
      books: ContinueBook[];
    };

/**
 * The "Continue reading" row on /library: up to six of the signed-in member's books by
 * latest synced place, as covers with the percent read. It exists for members who have a
 * synced place; for a signed-out visitor, an account with none, or a book list that is
 * empty it renders nothing at all (a labelled, permanently empty row would only say the
 * library is broken). Loading shows cover-shaped placeholders; a failed load says so and
 * offers a retry.
 */
export function ContinueReading() {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'reading-sync',
    );
  const {
    data: session,
  } =
    useSession();
  const signedIn =
    Boolean(
      session,
    );
  const query =
    useQuery({
      ...continueReadingQuery(),
      enabled:
        signedIn,
    });
  const load: Load =
    query.data
      ? {
          status:
            'ready',
          books:
            query.data.books,
        }
      : query.isError
        ? {
            status:
              'error',
          }
        : {
            status:
              'loading',
          };
  const arrival =
    useArrival(
      load.status !==
        'loading',
    );
  const fetchBooks =
    () => {
      void query.refetch();
    };

  if (
    !signedIn
  )
    return null;
  if (
    load.status ===
      'ready' &&
    load
      .books
      .length ===
      0
  )
    return null;

  const percent =
    new Intl.NumberFormat(
      i18n.language,
      {
        style:
          'percent',
      },
    );

  return (
    <section
      aria-labelledby="continue-reading-heading"
      className="mx-auto mb-6 w-full max-w-3xl px-4"
    >
      <h2
        id="continue-reading-heading"
        className="t-heading"
      >
        {t(
          'continue-heading',
          {
            defaultValue:
              'Continue reading',
          },
        )}
      </h2>
      {load.status ===
      'loading' ? (
        <ul
          className="mt-3 flex gap-4"
          aria-hidden="true"
        >
          {[
            0,
            1,
            2,
          ].map(
            (
              i,
            ) => (
              <li
                key={
                  i
                }
                className="w-28 shrink-0"
              >
                <Skeleton className="aspect-[3/4] w-full rounded-site" />
              </li>
            ),
          )}
        </ul>
      ) : load.status ===
        'error' ? (
        <div
          className={cn(
            'mt-3 flex items-center gap-3',
            arrival,
          )}
        >
          <p
            role="alert"
            className="t-meta"
          >
            {t(
              'continue-error',
              {
                defaultValue:
                  'Could not load your books.',
              },
            )}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={
              fetchBooks
            }
          >
            {t(
              'continue-retry',
              {
                defaultValue:
                  'Try again',
              },
            )}
          </Button>
        </div>
      ) : (
        <ul
          className={cn(
            'mt-3 flex gap-4 overflow-x-auto pb-1',
            arrival,
          )}
        >
          {load.books.map(
            (
              b,
            ) => (
              <li
                key={
                  b.slug
                }
                className="w-28 shrink-0"
              >
                <Link
                  to="/library/$slug"
                  params={{
                    slug: b.slug,
                  }}
                  className="block"
                >
                  <span className="block aspect-[3/4] overflow-hidden rounded-site border border-site-border bg-site-bg-subtle">
                    {b.coverUrl ? (
                      <img
                        src={
                          b.coverUrl
                        }
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span
                    className="t-label mt-2 block truncate text-site-text"
                    title={
                      b.title
                    }
                  >
                    {
                      b.title
                    }
                  </span>
                  <span className="t-meta block">
                    {t(
                      'continue-progress',
                      {
                        defaultValue:
                          '{{percent}} read',
                        percent:
                          percent.format(
                            b.percent /
                              100,
                          ),
                      },
                    )}
                  </span>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
