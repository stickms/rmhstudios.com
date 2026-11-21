/**
 * RMH Ladder — Offers (sprint 03, feature 17).
 *
 * Offers recorded on applications, side by side with first-year and yearly
 * totals. Signed-out visitors are sent to sign in, like the rest of the
 * personal tabs.
 */
import { useState } from 'react';
import {
  createFileRoute,
  redirect,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Download,
  Scale,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OfferCompare } from '@/components/rmhladder/OfferCompare';
import {
  OfferForm,
  type OfferTarget,
} from '@/components/rmhladder/OfferForm';
import { Button } from '@/components/ui/button';
import { useArrival } from '@/components/ui/arrive';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { getRequestSession } from '@/lib/auth-session.server';
import { api } from '@/lib/contract/client';
import { listOffersApi } from '@/lib/rmhladder/offers.contract';
import type { OfferDto } from '@/lib/rmhladder/offers';
import { noindexHead } from '@/lib/seo';

const requireSignIn =
  createServerFn(
    {
      method:
        'GET',
    },
  ).handler(
    async () => {
      const session =
        await getRequestSession();
      if (
        !session?.user
      )
        throw redirect(
          {
            to: '/login',
            search:
              {
                callbackURL:
                  '/rmhladder/offers',
              },
          },
        );
      return {
        ok: true as const,
      };
    },
  );

export const Route =
  createFileRoute(
    '/_site/rmhladder/offers',
  )(
    {
      head: () =>
        noindexHead(
          'Offers | RMH Ladder',
        ),
      loader:
        () =>
          requireSignIn(),
      component:
        OffersPage,
    },
  );

const QUERY_KEY =
  [
    'ladder-offers',
  ] as const;

function OffersPage() {
  const {
    t,
  } =
    useTranslation(
      'ladder-offers',
    );
  const queryClient =
    useQueryClient();
  const {
    data,
    isLoading,
    isError,
    refetch,
  } =
    useQuery(
      {
        queryKey:
          QUERY_KEY,
        queryFn:
          () =>
            api(
              listOffersApi,
            ),
      },
    );
  const [
    recording,
    setRecording,
  ] =
    useState<OfferTarget | null>(
      null,
    );
  const [
    editing,
    setEditing,
  ] =
    useState<OfferDto | null>(
      null,
    );
  const arrival =
    useArrival(
      Boolean(
        data,
      ),
    );

  const reload =
    () =>
      void queryClient.invalidateQueries(
        {
          queryKey:
            QUERY_KEY,
        },
      );

  if (
    isLoading
  ) {
    return (
      <div
        className="space-y-3"
        aria-busy="true"
        aria-label={t(
          'page.loading',
          {
            defaultValue:
              'Loading offers',
          },
        )}
      >
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (
    isError ||
    !data
  ) {
    return (
      <EmptyState
        icon={
          Scale
        }
        title={t(
          'page.error',
          {
            defaultValue:
              'Offers did not load',
          },
        )}
        description={t(
          'page.errorHint',
          {
            defaultValue:
              'Check your connection and try again.',
          },
        )}
        action={
          <Button
            type="button"
            variant="default"
            onClick={() =>
              void refetch()
            }
          >
            {t(
              'page.retry',
              {
                defaultValue:
                  'Try again',
              },
            )}
          </Button>
        }
      />
    );
  }

  const {
    offers,
    pending,
    openApplications,
  } =
    data;

  return (
    <div
      className={`space-y-6 ${arrival ?? ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-body text-site-text-muted">
          {t(
            'page.intro',
            {
              defaultValue:
                'Compare what each offer pays in a year. Totals are per currency; nothing is converted.',
            },
          )}
        </p>
        {offers.length >
          0 && (
          <Button
            asChild
            size="sm"
            variant="default"
          >
            <a
              href="/api/rmhladder/export?kind=offers"
              download
            >
              <Download
                aria-hidden
              />{' '}
              {t(
                'page.export',
                {
                  defaultValue:
                    'Export CSV',
                },
              )}
            </a>
          </Button>
        )}
      </div>

      {pending.length >
        0 && (
        <section aria-labelledby="offers-pending">
          <h2
            id="offers-pending"
            className="t-heading"
          >
            {t(
              'page.pendingTitle',
              {
                defaultValue:
                  'Offers to record',
              },
            )}
          </h2>
          <ul>
            {pending.map(
              (
                application,
              ) => (
                <li
                  key={
                    application.applicationId
                  }
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-site-border py-3"
                >
                  <span className="t-body">
                    {
                      application.title
                    }
                    <span className="t-meta block">
                      {
                        application.company
                      }
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() =>
                      setRecording(
                        application,
                      )
                    }
                  >
                    {t(
                      'page.record',
                      {
                        defaultValue:
                          'Record the offer',
                      },
                    )}
                  </Button>
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {offers.length ===
      0 ? (
        <EmptyState
          icon={
            Scale
          }
          title={t(
            'page.empty',
            {
              defaultValue:
                'No offers recorded',
            },
          )}
          description={t(
            'page.emptyHint',
            {
              defaultValue:
                'Move an application to Offer on the pipeline, then record the pay to compare it here.',
            },
          )}
        />
      ) : (
        <OfferCompare
          offers={
            offers
          }
          openApplications={
            openApplications
          }
          onEdit={
            setEditing
          }
          onChanged={
            reload
          }
        />
      )}

      {recording && (
        <OfferForm
          key={
            recording.applicationId
          }
          open
          onOpenChange={(
            open,
          ) =>
            !open &&
            setRecording(
              null,
            )
          }
          target={
            recording
          }
          onSaved={
            reload
          }
        />
      )}
      {editing && (
        <OfferForm
          key={
            editing.id
          }
          open
          onOpenChange={(
            open,
          ) =>
            !open &&
            setEditing(
              null,
            )
          }
          offer={
            editing
          }
          onSaved={
            reload
          }
        />
      )}
    </div>
  );
}
