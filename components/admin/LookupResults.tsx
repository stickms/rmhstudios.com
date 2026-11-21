import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { useArrival } from '@/components/ui/arrive';
import { apiQuery } from '@/lib/contract/client';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import { cn } from '@/lib/utils';
import { adminLookupApi } from '@/lib/admin/lookup.contract';
import type {
  LookupResult,
  LookupState,
} from '@/lib/admin/lookup';

const DANGER_STATES: ReadonlySet<LookupState> =
  new Set(
    [
      'banned',
      'deleted',
      'dead',
    ],
  );
const linkClass =
  't-body inline-flex min-h-9 items-center font-medium text-site-text pointer-coarse:min-h-11';

function AdminToolLink({
  tool,
}: {
  tool: NonNullable<
    LookupResult['adminTool']
  >;
}) {
  const {
    t,
  } =
    useTranslation(
      'admin-lookup',
    );
  switch (
    tool.tool
  ) {
    case 'users':
      return (
        <Link
          to="/admin/users"
          search={{
            ...(tool.q
              ? {
                  q: tool.q,
                }
              : {}),
            open: tool.open,
          }}
          className={
            linkClass
          }
        >
          {t(
            'link-admin-users',
            {
              defaultValue:
                'Open in Users',
            },
          )}
        </Link>
      );
    case 'reports':
      return (
        <Link
          to="/admin/reports"
          search={{
            status:
              tool.status,
            ...(tool.type
              ? {
                  type: tool.type,
                }
              : {}),
          }}
          className={
            linkClass
          }
        >
          {t(
            'link-admin-reports',
            {
              defaultValue:
                'Open in Reports',
            },
          )}
        </Link>
      );
    case 'builds':
      return (
        <Link
          to="/admin/user-builds"
          className={
            linkClass
          }
        >
          {t(
            'link-admin-builds',
            {
              defaultValue:
                'Open in Builds',
            },
          )}
        </Link>
      );
    case 'blog':
      return (
        <Link
          to="/admin/blog"
          className={
            linkClass
          }
        >
          {t(
            'link-admin-blog',
            {
              defaultValue:
                'Open in Blog',
            },
          )}
        </Link>
      );
    case 'library':
      return (
        <Link
          to="/admin/library"
          className={
            linkClass
          }
        >
          {t(
            'link-admin-library',
            {
              defaultValue:
                'Open in Library',
            },
          )}
        </Link>
      );
    case 'outbox':
      return (
        <Link
          to="/admin/outbox"
          search={{
            topic:
              tool.topic,
          }}
          className={
            linkClass
          }
        >
          {t(
            'link-admin-outbox',
            {
              defaultValue:
                'Open in Outbox',
            },
          )}
        </Link>
      );
  }
}

function ResultRow({
  r,
}: {
  r: LookupResult;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'admin-lookup',
    );
  const kinds: Record<
    LookupResult['kind'],
    string
  > =
    {
      user: t(
        'kind-user',
        {
          defaultValue:
            'User',
        },
      ),
      post: t(
        'kind-post',
        {
          defaultValue:
            'Post',
        },
      ),
      comment:
        t(
          'kind-comment',
          {
            defaultValue:
              'Comment',
          },
        ),
      community:
        t(
          'kind-community',
          {
            defaultValue:
              'Community',
          },
        ),
      event:
        t(
          'kind-event',
          {
            defaultValue:
              'Event',
          },
        ),
      tournament:
        t(
          'kind-tournament',
          {
            defaultValue:
              'Tournament',
          },
        ),
      build:
        t(
          'kind-build',
          {
            defaultValue:
              'Build',
          },
        ),
      replay:
        t(
          'kind-replay',
          {
            defaultValue:
              'Replay',
          },
        ),
      report:
        t(
          'kind-report',
          {
            defaultValue:
              'Report',
          },
        ),
      note: t(
        'kind-note',
        {
          defaultValue:
            'Moderator note, subject',
        },
      ),
      outbox:
        t(
          'kind-outbox',
          {
            defaultValue:
              'Outbox event',
          },
        ),
      jam: t(
        'kind-jam',
        {
          defaultValue:
            'Jam',
        },
      ),
      library:
        t(
          'kind-library',
          {
            defaultValue:
              'Library document',
          },
        ),
      news: t(
        'kind-news',
        {
          defaultValue:
            'News story',
        },
      ),
      blog: t(
        'kind-blog',
        {
          defaultValue:
            'Log',
        },
      ),
    };
  const states: Record<
    LookupState,
    string
  > =
    {
      deleted:
        t(
          'state-deleted',
          {
            defaultValue:
              'Deleted',
          },
        ),
      banned:
        t(
          'state-banned',
          {
            defaultValue:
              'Banned until',
          },
        ),
      hidden:
        t(
          'state-hidden',
          {
            defaultValue:
              'Hidden',
          },
        ),
      private:
        t(
          'state-private',
          {
            defaultValue:
              'Private',
          },
        ),
      unlisted:
        t(
          'state-unlisted',
          {
            defaultValue:
              'Unlisted',
          },
        ),
      cancelled:
        t(
          'state-cancelled',
          {
            defaultValue:
              'Cancelled',
          },
        ),
      draft:
        t(
          'state-draft',
          {
            defaultValue:
              'Not published',
          },
        ),
      bot: t(
        'state-bot',
        {
          defaultValue:
            'Bot account',
        },
      ),
      admin:
        t(
          'state-admin',
          {
            defaultValue:
              'Admin',
          },
        ),
      reported:
        t(
          'state-reported',
          {
            defaultValue:
              'Reported',
          },
        ),
      pending:
        t(
          'state-pending',
          {
            defaultValue:
              'Pending',
          },
        ),
      resolved:
        t(
          'state-resolved',
          {
            defaultValue:
              'Decided',
          },
        ),
      withdrawn:
        t(
          'state-withdrawn',
          {
            defaultValue:
              'Withdrawn',
          },
        ),
      dead: t(
        'state-dead',
        {
          defaultValue:
            'Gave up delivering',
        },
      ),
      delivered:
        t(
          'state-delivered',
          {
            defaultValue:
              'Delivered',
          },
        ),
      expired:
        t(
          'state-expired',
          {
            defaultValue:
              'Expired',
          },
        ),
    };
  const when =
    (
      iso: string,
    ) => (
      <RelativeTime
        date={
          iso
        }
        format={(
          at,
          now,
        ) =>
          formatRelativeTime(
            at,
            i18n.language,
            now,
          )
        }
      />
    );

  return (
    <li className="border-b border-site-border py-3">
      <p className="t-meta">
        {
          kinds[
            r
              .kind
          ]
        }
        {r.createdAt ? (
          <>
            {' '}
            ·{' '}
            {when(
              r.createdAt,
            )}
          </>
        ) : null}
      </p>
      <p className="t-heading mt-1 break-words">
        {
          r.label
        }
      </p>
      {r
        .states
        .length >
      0 ? (
        <p className="t-meta mt-1 flex flex-wrap gap-x-3">
          {r.states.map(
            (
              s,
            ) => (
              <span
                key={
                  s.state
                }
                className={cn(
                  DANGER_STATES.has(
                    s.state,
                  ) &&
                    'text-site-danger',
                )}
              >
                {
                  states[
                    s
                      .state
                  ]
                }
                {s.until ? (
                  <>
                    {' '}
                    {when(
                      s.until,
                    )}
                  </>
                ) : null}
              </span>
            ),
          )}
        </p>
      ) : null}
      <p className="t-meta mt-1 break-all">
        {
          r.id
        }
      </p>
      <div className="mt-1 flex flex-wrap gap-x-4">
        {r.publicPath ? (
          <Link
            to={
              r.publicPath
            }
            className={
              linkClass
            }
          >
            {t(
              'link-public',
              {
                defaultValue:
                  'Public page',
              },
            )}
          </Link>
        ) : null}
        {r.adminTool ? (
          <AdminToolLink
            tool={
              r.adminTool
            }
          />
        ) : null}
        <Link
          to="/admin/audit"
          search={{
            targetId:
              r.id,
          }}
          className={
            linkClass
          }
        >
          {t(
            'link-audit',
            {
              defaultValue:
                'Audit log for this target',
            },
          )}
        </Link>
        {r.relatedQuery ? (
          <Link
            to="/admin/lookup"
            search={{
              q: r.relatedQuery,
            }}
            className={
              linkClass
            }
          >
            {t(
              'link-related',
              {
                defaultValue:
                  'Look up what it points at',
              },
            )}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/** The outcome of one lookup. The query is read once: it is not refetched, so reading it does not repeat the audit row. */
export function LookupResults({
  q,
}: {
  q: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'admin-lookup',
    );
  const lookup =
    useQuery(
      {
        ...apiQuery(
          adminLookupApi,
          {
            query:
              {
                q,
              },
          },
        ),
        staleTime:
          Infinity,
        retry: false,
        refetchOnWindowFocus: false,
      },
    );
  const arrival =
    useArrival(
      lookup.isSuccess,
    );

  if (
    lookup.isPending
  ) {
    return (
      <div
        className="space-y-3"
        aria-busy="true"
      >
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (
    lookup.isError
  ) {
    return (
      <EmptyState
        title={t(
          'error-title',
          {
            defaultValue:
              'The lookup failed',
          },
        )}
        description={t(
          'error-description',
          {
            defaultValue:
              'Try again in a moment.',
          },
        )}
      />
    );
  }

  const {
    outcome,
    results,
    tried,
  } =
    lookup.data;
  const kindNames: Record<
    LookupResult['kind'],
    string
  > =
    {
      user: t(
        'tried-user',
        {
          defaultValue:
            'users',
        },
      ),
      post: t(
        'tried-post',
        {
          defaultValue:
            'posts',
        },
      ),
      comment:
        t(
          'tried-comment',
          {
            defaultValue:
              'comments',
          },
        ),
      community:
        t(
          'tried-community',
          {
            defaultValue:
              'communities',
          },
        ),
      event:
        t(
          'tried-event',
          {
            defaultValue:
              'events',
          },
        ),
      tournament:
        t(
          'tried-tournament',
          {
            defaultValue:
              'tournaments',
          },
        ),
      build:
        t(
          'tried-build',
          {
            defaultValue:
              'builds',
          },
        ),
      replay:
        t(
          'tried-replay',
          {
            defaultValue:
              'replays',
          },
        ),
      report:
        t(
          'tried-report',
          {
            defaultValue:
              'reports',
          },
        ),
      note: t(
        'tried-note',
        {
          defaultValue:
            'moderator notes',
        },
      ),
      outbox:
        t(
          'tried-outbox',
          {
            defaultValue:
              'outbox events',
          },
        ),
      jam: t(
        'tried-jam',
        {
          defaultValue:
            'jams',
        },
      ),
      library:
        t(
          'tried-library',
          {
            defaultValue:
              'library documents',
          },
        ),
      news: t(
        'tried-news',
        {
          defaultValue:
            'news stories',
        },
      ),
      blog: t(
        'tried-blog',
        {
          defaultValue:
            'logs',
        },
      ),
    };

  return (
    <div
      aria-live="polite"
      className={
        arrival
      }
    >
      {outcome ===
      'found' ? (
        <>
          <p className="t-label">
            {t(
              'result-count',
              {
                count:
                  results.length,
                defaultValue_one:
                  '{{count}} result',
                defaultValue_other:
                  '{{count}} results',
              },
            )}
          </p>
          <ul className="mt-2 border-t border-site-border">
            {results.map(
              (
                r,
              ) => (
                <ResultRow
                  key={`${r.kind}:${r.id}`}
                  r={
                    r
                  }
                />
              ),
            )}
          </ul>
        </>
      ) : outcome ===
        'foreign-link' ? (
        <EmptyState
          title={t(
            'foreign-link',
            {
              defaultValue:
                'Not a link to this site',
            },
          )}
        />
      ) : outcome ===
        'unknown-path' ? (
        <EmptyState
          title={t(
            'unknown-path',
            {
              defaultValue:
                'No page with that address',
            },
          )}
        />
      ) : outcome ===
        'unrecognised' ? (
        <EmptyState
          title={t(
            'unrecognised-title',
            {
              defaultValue:
                'Not something to look up',
            },
          )}
          description={t(
            'unrecognised-description',
            {
              defaultValue:
                'Paste an id, a handle, a full e-mail address or a link to a page on this site.',
            },
          )}
        />
      ) : (
        <EmptyState
          title={t(
            'nothing-found',
            {
              defaultValue:
                'Nothing found',
            },
          )}
          description={t(
            'tried',
            {
              kinds:
                tried
                  .map(
                    (
                      k,
                    ) =>
                      kindNames[
                        k
                      ],
                  )
                  .join(
                    ', ',
                  ),
              defaultValue:
                'Looked in: {{kinds}}.',
            },
          )}
        />
      )}
    </div>
  );
}
