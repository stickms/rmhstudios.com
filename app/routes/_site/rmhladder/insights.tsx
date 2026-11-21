/**
 * RMH Ladder — Insights (sprint 03, feature 18).
 *
 * The member's search as numbers: funnel, response times, weekly activity,
 * breakdowns and quiet applications. Quiet applications are acted on through the
 * same application update the pipeline uses; there is no new write path.
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
import { ChartColumn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  InsightsView,
  type QuietPatch,
} from '@/components/rmhladder/InsightsView';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useArrival } from '@/components/ui/arrive';
import { Skeleton } from '@/components/ui/skeleton';
import { getRequestSession } from '@/lib/auth-session.server';
import { api } from '@/lib/contract/client';
import { prisma } from '@/lib/prisma.server';
import { getInsightsApi } from '@/lib/rmhladder/insights.contract';
import type { InsightRange } from '@/lib/rmhladder/insights';
import { doUpdateApplicationSchema } from '@/lib/rmhladder/server-fn-schemas.server';
import {
  updateApplication,
  type ActionsPrisma,
  type ApplicationPatch,
} from '@/lib/rmhladder/server/actions';
import { noindexHead } from '@/lib/seo';

const actionsPrisma =
  prisma as unknown as ActionsPrisma;

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
                  '/rmhladder/insights',
              },
          },
        );
      return {
        ok: true as const,
      };
    },
  );

/** The pipeline's own application update (`updateApplication`), reached from the quiet list. */
const updateQuietApplication =
  createServerFn(
    {
      method:
        'POST',
    },
  )
    .validator(
      (
        input: unknown,
      ) =>
        doUpdateApplicationSchema.parse(
          input,
        ),
    )
    .handler(
      async ({
        data,
      }) => {
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
                    '/rmhladder/insights',
                },
            },
          );
        try {
          await updateApplication(
            actionsPrisma,
            session
              .user
              .id,
            data.jobId,
            data.patch as ApplicationPatch,
          );
          return {
            ok: true as const,
          };
        } catch {
          return {
            ok: false as const,
          };
        }
      },
    );

export const Route =
  createFileRoute(
    '/_site/rmhladder/insights',
  )(
    {
      head: () =>
        noindexHead(
          'Insights | RMH Ladder',
        ),
      loader:
        () =>
          requireSignIn(),
      component:
        InsightsPage,
    },
  );

function InsightsPage() {
  const {
    t,
  } =
    useTranslation(
      'ladder-insights',
    );
  const queryClient =
    useQueryClient();
  const [
    range,
    setRange,
  ] =
    useState<InsightRange>(
      '90d',
    );
  const [
    quietDays,
    setQuietDays,
  ] =
    useState<
      | '14'
      | '21'
      | '30'
    >(
      '21',
    );
  const {
    data,
    isLoading,
    isError,
    refetch,
  } =
    useQuery(
      {
        queryKey:
          [
            'ladder-insights',
            range,
            quietDays,
          ],
        queryFn:
          () =>
            api(
              getInsightsApi,
              {
                query:
                  {
                    range,
                    quietDays,
                  },
              },
            ),
      },
    );

  const arrival =
    useArrival(
      Boolean(
        data,
      ),
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
              'Loading insights',
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
          ChartColumn
        }
        title={t(
          'page.error',
          {
            defaultValue:
              'Insights did not load',
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

  return (
    <div
      className={
        arrival
      }
    >
      <InsightsView
        data={
          data
        }
        range={
          range
        }
        quietDays={
          quietDays
        }
        onRangeChange={
          setRange
        }
        onQuietDaysChange={
          setQuietDays
        }
        onPatch={async (
          jobId: string,
          patch: QuietPatch,
        ) => {
          const result =
            await updateQuietApplication(
              {
                data: {
                  jobId,
                  patch,
                },
              },
            );
          if (
            result.ok
          )
            await queryClient.invalidateQueries(
              {
                queryKey:
                  [
                    'ladder-insights',
                  ],
              },
            );
          return result.ok;
        }}
      />
    </div>
  );
}
