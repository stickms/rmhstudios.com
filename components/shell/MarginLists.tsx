import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { api } from '@/lib/contract/client';
import { exploreApi } from '@/lib/discovery/explore.contract';
import type { ExploreResult } from '@/lib/explore.server';
import { useIdleReady } from '@/hooks/useIdleReady';
import { useFreshUser } from '@/stores/userDisplayStore';

type SuggestedUser =
  ExploreResult['suggestedUsers'][number];

const TTL =
  5 *
  60_000;

/**
 * The margin's two short lists (Steel L6): what is trending and who to follow, each under a `t-label` heading, rows on
 * rules. A person is a 32px avatar, the name, the handle and, when accounts the viewer follows already follow them, one
 * line saying who (owner, 2026-11-13: this replaces L6's "no pictures" for people; a tag still has none). It loads after
 * the main column, once the browser is idle, from the Explore data the old live rail used, and only at a width that
 * displays the margin (MarginColumn).
 */
export default function MarginLists() {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const idle =
    useIdleReady();
  // Supplementary: a failure leaves the lists out. The cache is shared across pages, so a client navigation re-uses it.
  const {
    data,
  } =
    useQuery(
      {
        queryKey:
          [
            'shell-margin-explore',
          ],
        queryFn:
          ({
            signal,
          }) =>
            api(
              exploreApi,
              {
                signal,
              },
            ),
        enabled:
          idle,
        staleTime:
          TTL,
        retry: false,
      },
    );
  const tags =
    data?.trendingTags?.slice(
      0,
      5,
    ) ??
    [];
  const people =
    data?.suggestedUsers?.slice(
      0,
      3,
    ) ??
    [];
  // Steel M9: fetched after idle, the lists land in the margin and fade in; from the shared cache they are just there.
  const arrival =
    useArrival(
      !!data,
    );

  return (
    <>
      {tags.length >
        0 && (
        <section
          className={cn(
            'site-margin__group',
            arrival,
          )}
        >
          <h2 className="t-label">
            {t(
              'trending',
              {
                defaultValue:
                  'Trending',
              },
            )}
          </h2>
          <ul className="site-margin__list">
            {tags.map(
              (
                entry,
              ) => (
                <li
                  key={
                    entry.tag
                  }
                >
                  <Link
                    to={
                      `/tag/${entry.tag}` as string
                    }
                    className="site-margin__row"
                  >
                    <span>
                      #
                      {
                        entry.tag
                      }
                    </span>
                    <span className="t-meta">
                      {
                        entry.count
                      }
                    </span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        </section>
      )}
      {people.length >
        0 && (
        <section
          className={cn(
            'site-margin__group',
            arrival,
          )}
        >
          <h2 className="t-label">
            {t(
              'who-to-follow',
              {
                defaultValue:
                  'Who to follow',
              },
            )}
          </h2>
          <ul className="site-margin__list">
            {people.map(
              (
                person,
              ) => (
                <li
                  key={
                    person.id
                  }
                >
                  <SuggestedPerson
                    person={
                      person
                    }
                  />
                </li>
              ),
            )}
          </ul>
        </section>
      )}
    </>
  );
}

/** One suggestion: the freshest avatar and name the client knows (userDisplayStore), then why it is suggested. */
function SuggestedPerson({
  person,
}: {
  person: SuggestedUser;
}) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const fresh =
    useFreshUser(
      person,
    ) ??
    person;
  const name =
    fresh.name ||
    fresh.handle ||
    person.name ||
    person.handle;
  const mutuals =
    person.mutuals;

  let why:
    | string
    | null =
    null;
  if (
    mutuals &&
    mutuals
      .names
      .length >
      0
  ) {
    const [
      a,
      b,
    ] =
      mutuals.names;
    const rest =
      mutuals.count -
      mutuals
        .names
        .length;
    if (
      b &&
      rest >
        0
    ) {
      why =
        t(
          'who-to-follow-mutual-more',
          {
            a,
            b,
            count:
              rest,
            defaultValue_one:
              'Followed by {{a}}, {{b}} and {{count}} other you follow',
            defaultValue_other:
              'Followed by {{a}}, {{b}} and {{count}} others you follow',
          },
        );
    } else if (
      b
    ) {
      why =
        t(
          'who-to-follow-mutual-two',
          {
            a,
            b,
            defaultValue:
              'Followed by {{a}} and {{b}}',
          },
        );
    } else if (
      rest >
      0
    ) {
      why =
        t(
          'who-to-follow-mutual-one-more',
          {
            a,
            count:
              rest,
            defaultValue_one:
              'Followed by {{a}} and {{count}} other you follow',
            defaultValue_other:
              'Followed by {{a}} and {{count}} others you follow',
          },
        );
    } else {
      why =
        t(
          'who-to-follow-mutual-one',
          {
            a,
            defaultValue:
              'Followed by {{a}}',
          },
        );
    }
  }

  return (
    <Link
      to={
        `/u/${person.handle || person.id}` as string
      }
      className="site-margin__row site-margin__person"
    >
      <UserAvatar
        src={
          fresh.image
        }
        alt=""
        size={
          32
        }
        fallbackName={
          name ??
          undefined
        }
      />
      <span className="site-margin__person-text">
        <span className="t-body block truncate font-semibold text-site-text">
          {
            name
          }
        </span>
        {person.handle && (
          <span className="t-meta block truncate">
            <bdi>
              @
              {
                person.handle
              }
            </bdi>
          </span>
        )}
        {why && (
          <span className="t-body mt-1 block text-site-text-muted">
            {
              why
            }
          </span>
        )}
      </span>
    </Link>
  );
}
