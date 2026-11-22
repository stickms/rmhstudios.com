import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import { cn } from '@/lib/utils';
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

export function ResultRow({
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
