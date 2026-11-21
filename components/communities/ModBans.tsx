/** s06-01 — the Bans tab: active bans and timeouts with "Lift", and the last 100 lifted or expired. */
import { useState } from 'react';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import {
  api,
  apiQuery,
} from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  type TabItem,
} from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { cn } from '@/lib/utils';
import {
  listSanctionsApi,
  liftSanctionApi,
} from '@/lib/communities/bans.contract';
import type { SanctionDTO } from '@/lib/communities/bans';
import { MemberNotesDialog } from '@/components/communities/MemberNotesDialog';

type Segment =
  | 'active'
  | 'past';

export function ModBans({
  slug,
}: {
  slug: string;
}) {
  const {
    t,
  } =
    useTranslation(
      ['community-bans', 'community-notes'],
    );
  const fmt =
    useLocaleFormat();
  const confirm =
    useConfirm();
  const [
    segment,
    setSegment,
  ] =
    useState<Segment>(
      'active',
    );
  const queryClient = useQueryClient();
  const listOptions = apiQuery(listSanctionsApi, {
    params: { slug },
    query: { status: segment },
  });
  const listQuery = useQuery({ ...listOptions, retry: false });
  // `null` while loading; a failed read shows the error line over an empty list.
  const rows: SanctionDTO[] | null = listQuery.data
    ? listQuery.data.sanctions
    : listQuery.isError
      ? []
      : null;
  const failed = listQuery.isError;
  const setRows = (
    next: (prev: SanctionDTO[] | null) => SanctionDTO[] | null,
  ) =>
    queryClient.setQueryData(
      listOptions.queryKey,
      (old: { sanctions: SanctionDTO[] } | undefined) => {
        const value = next(old?.sanctions ?? null);
        return value ? { ...old, sanctions: value } : old;
      },
    );
  const arrival =
    useArrival(
      rows !==
        null,
    );
  // s06-02: notes about the member of a row (active and lifted rows alike).
  const [
    notesFor,
    setNotesFor,
  ] =
    useState<
      | SanctionDTO['member']
      | null
    >(
      null,
    );

  const tabs: TabItem[] =
    [
      {
        id: 'active',
        label:
          t(
            'segment-active',
            {
              defaultValue:
                'Active',
            },
          ),
      },
      {
        id: 'past',
        label:
          t(
            'segment-past',
            {
              defaultValue:
                'Lifted or expired',
            },
          ),
      },
    ];

  const nameOf =
    (
      u: {
        name:
          | string
          | null;
        handle:
          | string
          | null;
      } | null,
    ) =>
      u
        ? (u.name ??
          (u.handle
            ? `@${u.handle}`
            : t(
                'someone',
                {
                  defaultValue:
                    'this member',
                },
              )))
        : t(
            'deleted-member',
            {
              defaultValue:
                'A deleted member',
            },
          );

  const lift =
    async (
      row: SanctionDTO,
    ) => {
      const name =
        nameOf(
          row.member,
        );
      const ok =
        await confirm(
          {
            title:
              t(
                'lift-confirm',
                {
                  name,
                  defaultValue:
                    'Lift the sanction on {{name}}?',
                },
              ),
            description:
              t(
                'lift-confirm-hint',
                {
                  defaultValue:
                    'It ends now and they are told.',
                },
              ),
            confirmLabel:
              t(
                'lift',
                {
                  defaultValue:
                    'Lift',
                },
              ),
          },
        );
      if (
        !ok
      )
        return;
      try {
        await api(
          liftSanctionApi,
          {
            params:
              {
                slug,
                banId:
                  row.id,
              },
          },
        );
        setRows(
          (
            prev,
          ) =>
            prev
              ? prev.filter(
                  (
                    r,
                  ) =>
                    r.id !==
                    row.id,
                )
              : prev,
        );
      } catch (err) {
        toast.error(
          serverError(
            err,
          ) ||
            t(
              'action-failed',
              {
                defaultValue:
                  'Could not save that',
              },
            ),
        );
      }
    };

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        tabs={
          tabs
        }
        value={
          segment
        }
        onChange={(
          id,
        ) =>
          setSegment(
            id ===
              'past'
              ? 'past'
              : 'active',
          )
        }
        aria-label={t(
          'segments-label',
          {
            defaultValue:
              'Bans and timeouts',
          },
        )}
      />
      {rows ===
      null ? (
        <div
          className="flex flex-col gap-2"
          aria-busy="true"
        >
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : failed ? (
        <p
          className="t-body text-site-danger"
          role="alert"
        >
          {t(
            'load-failed',
            {
              defaultValue:
                'Could not load this list.',
            },
          )}
        </p>
      ) : rows.length ===
        0 ? (
        <EmptyState
          title={
            segment ===
            'active'
              ? t(
                  'empty-active',
                  {
                    defaultValue:
                      'No one is banned or timed out',
                  },
                )
              : t(
                  'empty-past',
                  {
                    defaultValue:
                      'Nothing lifted or expired yet',
                  },
                )
          }
          description={t(
            'empty-hint',
            {
              defaultValue:
                'Use the menu on a member to time them out or ban them.',
            },
          )}
        />
      ) : (
        <ul
          className={cn(
            'flex flex-col',
            arrival,
          )}
        >
          {rows.map(
            (
              r,
            ) => (
              <li
                key={
                  r.id
                }
                className="flex items-start gap-3 border-b border-site-border py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="t-body text-site-text">
                    {r.kind ===
                    'ban'
                      ? t(
                          'row-ban',
                          {
                            name: nameOf(
                              r.member,
                            ),
                            defaultValue:
                              '{{name}} · banned',
                          },
                        )
                      : t(
                          'row-timeout',
                          {
                            name: nameOf(
                              r.member,
                            ),
                            defaultValue:
                              '{{name}} · timed out',
                          },
                        )}
                  </p>
                  <p className="t-meta">
                    {segment ===
                      'past' &&
                    r.liftedAt
                      ? t(
                          'row-lifted',
                          {
                            date: fmt.dateTime(
                              r.liftedAt,
                            ),
                            defaultValue:
                              'Lifted {{date}}',
                          },
                        )
                      : r.endsAt
                        ? t(
                            'row-ends',
                            {
                              date: fmt.dateTime(
                                r.endsAt,
                              ),
                              defaultValue:
                                'Ends {{date}}',
                            },
                          )
                        : t(
                            'row-open',
                            {
                              defaultValue:
                                'Until a moderator lifts it',
                            },
                          )}
                    {
                      ' · '
                    }
                    {t(
                      'row-by',
                      {
                        name: nameOf(
                          r.moderator,
                        ),
                        date: fmt.date(
                          r.createdAt,
                        ),
                        defaultValue:
                          'by {{name}}, {{date}}',
                      },
                    )}
                  </p>
                  {r.ruleTitle && (
                    <p className="t-meta">
                      {t(
                        'row-rule',
                        {
                          title:
                            r.ruleTitle,
                          defaultValue:
                            'Rule: {{title}}',
                        },
                      )}
                    </p>
                  )}
                  {r.reason && (
                    <p className="t-meta">
                      {
                        r.reason
                      }
                    </p>
                  )}
                </div>
                {r.member && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setNotesFor(
                        r.member,
                      )
                    }
                    aria-label={t(
                      'notes-link-aria',
                      {
                        ns: 'community-notes',
                        name: nameOf(
                          r.member,
                        ),
                        defaultValue:
                          'Notes about {{name}}',
                      },
                    )}
                  >
                    {t(
                      'notes-link',
                      {
                        ns: 'community-notes',
                        defaultValue:
                          'Notes',
                      },
                    )}
                  </Button>
                )}
                {segment ===
                  'active' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void lift(
                        r,
                      )
                    }
                    aria-label={t(
                      'lift-aria',
                      {
                        name: nameOf(
                          r.member,
                        ),
                        defaultValue:
                          'Lift the sanction on {{name}}',
                      },
                    )}
                  >
                    {t(
                      'lift',
                      {
                        defaultValue:
                          'Lift',
                      },
                    )}
                  </Button>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {notesFor && (
        <MemberNotesDialog
          slug={
            slug
          }
          member={
            notesFor
          }
          onClose={() =>
            setNotesFor(
              null,
            )
          }
        />
      )}
    </div>
  );
}
