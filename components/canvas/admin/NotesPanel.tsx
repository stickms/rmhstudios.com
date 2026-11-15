import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs } from '@/components/ui/tabs';
import { fetchJson } from '@/lib/http';
import {
  useArrival,
  useSuspenseArrival,
} from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

type Filter =
  | 'shown'
  | 'pending'
  | 'hidden';
interface AdminNote {
  id: string;
  postId: string;
  body: string;
  helpfulCount: number;
  notCount: number;
  hidden: boolean;
  postExcerpt: string;
}

export default function NotesPanel() {
  const {
    t,
  } =
    useTranslation(
      'f-canvas',
    );
  const [
    filter,
    setFilter,
  ] =
    useState<Filter>(
      'shown',
    );
  const q =
    useQuery(
      {
        queryKey:
          [
            'context-notes',
            'admin',
            filter,
          ],
        queryFn:
          () =>
            fetchJson<{
              notes: AdminNote[];
            }>(
              `/api/admin/context-notes?filter=${filter}`,
            ),
      },
    );
  const shown =
    useSuspenseArrival();
  const arrival =
    useArrival(
      q.data !==
        undefined,
    );
  const setHidden =
    async (
      n: AdminNote,
      hidden: boolean,
    ) => {
      try {
        await fetchJson(
          `/api/admin/context-notes/${n.id}`,
          {
            method:
              'PATCH',
            headers:
              {
                'Content-Type':
                  'application/json',
              },
            body: JSON.stringify(
              {
                hidden,
              },
            ),
          },
        );
        await q.refetch();
      } catch (e) {
        toast.error(
          e instanceof
            Error
            ? e.message
            : t(
                'admin-error',
                {
                  defaultValue:
                    'Something went wrong',
                },
              ),
        );
      }
    };
  return (
    <div
      className={cn(
        'space-y-4',
        shown,
      )}
      suppressHydrationWarning
    >
      <Tabs
        aria-label={t(
          'notes-filter',
          {
            defaultValue:
              'Note filter',
          },
        )}
        value={
          filter
        }
        onChange={(
          id,
        ) =>
          setFilter(
            id as Filter,
          )
        }
        tabs={[
          {
            id: 'shown',
            label:
              t(
                'notes-shown',
                {
                  defaultValue:
                    'Showing',
                },
              ),
          },
          {
            id: 'pending',
            label:
              t(
                'notes-pending',
                {
                  defaultValue:
                    'Awaiting ratings',
                },
              ),
          },
          {
            id: 'hidden',
            label:
              t(
                'notes-hidden',
                {
                  defaultValue:
                    'Hidden',
                },
              ),
          },
        ]}
      />
      {q.data &&
      q
        .data
        .notes
        .length ===
        0 ? (
        <EmptyState
          className={
            arrival
          }
          title={t(
            'notes-empty',
            {
              defaultValue:
                'No notes here',
            },
          )}
        />
      ) : (
        <ul
          className={cn(
            'divide-y divide-site-border border-t border-site-border',
            arrival,
          )}
        >
          {q.data?.notes.map(
            (
              n,
            ) => (
              <li
                key={
                  n.id
                }
                className="space-y-2 py-3"
              >
                <p className="t-body text-site-text">
                  {
                    n.body
                  }
                </p>
                <p className="line-clamp-2 t-body text-site-text-muted">
                  {t(
                    'notes-on-post',
                    {
                      defaultValue:
                        'On: {{post}}',
                      post: n.postExcerpt,
                    },
                  )}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="t-meta">
                    {t(
                      'notes-counts',
                      {
                        defaultValue:
                          '{{up}} helpful, {{down}} not helpful',
                        up: n.helpfulCount,
                        down: n.notCount,
                      },
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant={
                      n.hidden
                        ? 'default'
                        : 'danger'
                    }
                    onClick={() =>
                      void setHidden(
                        n,
                        !n.hidden,
                      )
                    }
                  >
                    {n.hidden
                      ? t(
                          'notes-restore',
                          {
                            defaultValue:
                              'Restore',
                          },
                        )
                      : t(
                          'notes-hide',
                          {
                            defaultValue:
                              'Hide',
                          },
                        )}
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
