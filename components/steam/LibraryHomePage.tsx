import { useMemo } from 'react';
import {
  Link,
  getRouteApi,
} from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { FollowingEmpty, FollowingLabel, UnfollowButton } from './FollowingFilter';
import { useTranslation } from 'react-i18next';
import { listCuratedBuilds } from '@/lib/builds/curated';
import {
  filterRail,
  groupRail,
} from '@/lib/games/library';
import { CAPSULE_SIZES, TitleArt } from './TitleArt';

const layoutApi =
  getRouteApi(
    '/games/_library',
  );

const SHELF_SIZE = 8;

/**
 * Home, as Steam's Library opens: a "Recent Games" shelf of cover art, then "All
 * Games" as a grid of the whole catalog.
 */
export function LibraryHomePage() {
  const {
    t,
  } =
    useTranslation(
      'games-hub',
    );
  const {
    recentIds,
    followedIds,
  } =
    layoutApi.useLoaderData();
  const {
    kind = 'all',
    following = false,
  } =
    layoutApi.useSearch();

  const {
    recent,
    all,
  } =
    useMemo(() => {
      const filtered =
        filterRail(
          listCuratedBuilds(),
          {
            kind,
            search:
              '',
          },
        );
      const items = following
        ? filtered.filter((b) => followedIds.includes(b.id))
        : filtered;
      const {
        recent:
          r,
        rest,
      } =
        groupRail(
          items,
          recentIds,
        );
      return {
        recent:
          r.slice(
            0,
            SHELF_SIZE,
          ),
        all: [
          ...r,
          ...rest,
        ].sort(
          (
            a,
            b,
          ) =>
            a.title.localeCompare(
              b.title,
            ),
        ),
      };
    }, [
      kind,
      following,
      followedIds,
      recentIds,
    ]);

  return (
    <div>
      <h1 className="stm-sr">
        {t(
          'steam-home-title',
          {
            defaultValue:
              'Games and apps',
          },
        )}
      </h1>

      {recent.length >
      0 && !following ? (
        <section aria-labelledby="stm-recent">
          <h2
            id="stm-recent"
            className="stm-shelf-head"
          >
            {t(
              'steam-recent-games',
              {
                defaultValue:
                  'Recent Games',
              },
            )}
            <ChevronDown
              aria-hidden
              size={
                14
              }
            />
          </h2>
          <Capsules
            items={
              recent
            }
          />
        </section>
      ) : null}

      <section aria-labelledby="stm-all">
        <h2
          id="stm-all"
          className="stm-shelf-head"
        >
          {following
            ? <FollowingLabel />
            : kind ===
          'app'
            ? t(
                'steam-all-apps',
                {
                  defaultValue:
                    'All Apps',
                },
              )
            : kind ===
                'game'
              ? t(
                  'steam-all-games',
                  {
                    defaultValue:
                      'All Games',
                  },
                )
              : t(
                  'steam-all-titles',
                  {
                    defaultValue:
                      'All Games & Apps',
                  },
                )}
          <span className="stm-count">
            (
            {
              all.length
            }
            )
          </span>
          <span
            className="stm-count"
            style={{
              marginInlineStart:
                'auto',
            }}
          >
            {t(
              'steam-sort-az',
              {
                defaultValue:
                  'Sorted A to Z',
              },
            )}
          </span>
        </h2>
        {following && all.length === 0 ? (
          <p className="stm-muted stm-card-note">
            <FollowingEmpty />
          </p>
        ) : null}
        <Capsules
          items={
            all
          }
          unfollowable={following}
        />
      </section>
    </div>
  );
}

function Capsules({
  items,
  unfollowable = false,
}: {
  items: ReturnType<
    typeof listCuratedBuilds
  >;
  /** Set on the Following filter: each capsule then carries an Unfollow button. */
  unfollowable?: boolean;
}) {
  return (
    <ul className="stm-capsules">
      {items.map(
        (
          b,
        ) => (
          <li
            key={
              b.id
            }
          >
            <Link
              to="/games/$gameId"
              params={{
                gameId:
                  b.id,
              }}
              className="stm-capsule"
            >
              <TitleArt
                build={
                  b
                }
                width={
                  240
                }
                height={
                  360
                } sizes={CAPSULE_SIZES}
              />
              <span className="stm-capsule-name">
                {
                  b.title
                }
              </span>
            </Link>
            {unfollowable ? <UnfollowButton gameId={b.id} title={b.title} /> : null}
          </li>
        ),
      )}
    </ul>
  );
}
