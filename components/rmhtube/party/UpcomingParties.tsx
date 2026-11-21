/**
 * UpcomingParties — the landing's "Upcoming parties": the member's own (hosting or going) first, then public
 * ones in the next week, soonest first. Each row opens the party page. Relative times are computed at render.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  Users,
} from 'lucide-react';
import { apiQuery } from '@/lib/contract/client';
import {
  listPartiesApi,
  type PartyDTO,
} from '@/lib/rmhtube/parties.contract';
import { useArrival } from '@/components/ui/arrive';
import {
  formatPartyTime,
  formatRelativeStart,
} from './party-format';

function Row({
  party,
  locale,
  nowMs,
}: {
  party: PartyDTO;
  locale: string;
  nowMs: number;
}) {
  const {
    t,
  } =
    useTranslation(
      'watch-parties',
    );
  const mine =
    party.viewerIsHost ||
    party.viewerGoing;
  return (
    <li className="border-b border-app-border last:border-b-0">
      <Link
        to="/rmhtube/party/$roomId"
        params={{
          roomId:
            party.roomId,
        }}
        className="flex items-center justify-between gap-3 py-3 hover:bg-app-surface-hover"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-app-text">
            {
              party.name
            }
          </p>
          <p className="flex items-center gap-1 text-xs text-app-text-muted">
            <CalendarClock
              className="h-3 w-3 shrink-0"
              aria-hidden
            />
            <time
              dateTime={
                party.scheduledFor
              }
            >
              {formatPartyTime(
                party.scheduledFor,
                locale,
              )}
            </time>
            <span
              aria-hidden
            >
              ·
            </span>
            <span>
              {formatRelativeStart(
                party.scheduledFor,
                nowMs,
                locale,
              )}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-app-text-muted">
          {mine && (
            <span>
              {party.viewerIsHost
                ? t(
                    'badge-hosting',
                    {
                      defaultValue:
                        'Hosting',
                    },
                  )
                : t(
                    'badge-going',
                    {
                      defaultValue:
                        'Going',
                    },
                  )}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users
              className="h-3 w-3"
              aria-hidden
            />
            {
              party.goingCount
            }
          </span>
        </div>
      </Link>
    </li>
  );
}

export default function UpcomingParties() {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'watch-parties',
    );
  const query =
    useQuery(
      apiQuery(
        listPartiesApi,
      ),
    );
  const arrive =
    useArrival(
      query.isSuccess,
    );
  const parties =
    query
      .data
      ?.parties ??
    [];
  const nowMs =
    Date.now();

  return (
    <div className="rounded-app app-glass p-6">
      <h2 className="mb-2 text-xl font-semibold">
        {t(
          'upcoming-title',
          {
            defaultValue:
              'Upcoming parties',
          },
        )}
      </h2>
      {query.isPending && (
        <p
          className="py-4 text-sm text-app-text-muted"
          role="status"
        >
          {t(
            'loading',
            {
              defaultValue:
                'Loading parties',
            },
          )}
        </p>
      )}
      {query.isError && (
        <p
          className="py-4 text-sm text-app-text-muted"
          role="alert"
        >
          {t(
            'upcoming-error',
            {
              defaultValue:
                'Could not load upcoming parties.',
            },
          )}{' '}
          <button
            type="button"
            className="underline"
            onClick={() =>
              void query.refetch()
            }
          >
            {t(
              'retry',
              {
                defaultValue:
                  'Try again',
              },
            )}
          </button>
        </p>
      )}
      {query.isSuccess &&
        parties.length ===
          0 && (
          <p className="py-4 text-sm text-app-text-muted">
            {t(
              'upcoming-empty',
              {
                defaultValue:
                  'No parties are scheduled. Schedule one.',
              },
            )}
          </p>
        )}
      {query.isSuccess &&
        parties.length >
          0 && (
          <ul
            className={
              arrive
            }
          >
            {parties.map(
              (
                p,
              ) => (
                <Row
                  key={
                    p.roomId
                  }
                  party={
                    p
                  }
                  locale={
                    i18n.language
                  }
                  nowMs={
                    nowMs
                  }
                />
              ),
            )}
          </ul>
        )}
    </div>
  );
}
