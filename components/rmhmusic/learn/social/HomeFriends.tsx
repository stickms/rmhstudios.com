/**
 * The learn home's Friends section (RMH Music Phase 6, plan 1.5): up to three friends who share
 * their progress, each "avatar · name · Daily: 12 days · 3 of 5 units", and "All friends".
 *
 * It is the last thing on the page and has no placeholder: it renders nothing until the list
 * arrives, then fades in (M9), so nothing on the page moves. Opted out, or no friend shares:
 * nothing at all (no nag). Read once on visit; nothing polls.
 */
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ARRIVE } from '@/components/ui/arrive';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { musicFriendsQuery } from '@/lib/rmhmusic/social/social.queries';
import { TEXT_BUTTON } from '../buttons';
import { learnerName } from './board-text';
import { friendShortLine } from './friends-text';

export function HomeFriends() {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const {
    data,
  } =
    useQuery(
      musicFriendsQuery(
        3,
      ),
    );
  if (
    !data ||
    !data.optedIn ||
    data
      .friends
      .length ===
      0
  )
    return null;
  return (
    <section
      aria-labelledby="rmm-home-friends"
      className={`space-y-2 ${ARRIVE}`}
    >
      <h2
        id="rmm-home-friends"
        className="text-sm leading-5 font-semibold text-app-text-muted"
      >
        {t(
          'friends-home-heading',
          {
            defaultValue:
              'Friends',
          },
        )}
      </h2>
      <ul className="rmm-sheet divide-y divide-app-border">
        {data.friends.map(
          (
            f,
            i,
          ) => {
            const name =
              learnerName(
                t,
                f
                  .user
                  .name,
              );
            return (
              <li
                key={
                  i
                }
                className="flex min-h-14 items-center gap-3 px-4 py-2"
              >
                <UserAvatar
                  src={
                    f
                      .user
                      .image
                  }
                  alt=""
                  size={
                    32
                  }
                  fallbackName={
                    name
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base leading-6 text-app-text">
                    {
                      name
                    }
                  </span>
                  <span className="block text-sm leading-5 text-app-text-muted">
                    {friendShortLine(
                      t,
                      f,
                    )}
                  </span>
                </span>
              </li>
            );
          },
        )}
      </ul>
      <Link
        to="/rmhmusic/friends"
        className={
          TEXT_BUTTON
        }
      >
        {t(
          'friends-all',
          {
            defaultValue:
              'All friends',
          },
        )}
      </Link>
    </section>
  );
}
