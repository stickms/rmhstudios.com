/**
 * The presence dot on a profile (owner, 2026-11-18; it replaces the "Online now" line). One small filled circle in a
 * state colour, on the avatar's corner, with the words in a tooltip on hover and keyboard focus:
 *
 * - offline: `--site-text-muted`
 * - online: `--site-success`
 * - in a game: `--site-danger`
 * - away (active in the last 15 minutes): `--site-warning`
 *
 * These are the existing semantic tokens, so both editions, every bought theme and the colour-vision modes retint the
 * dot with the rest of the page. The colour is never the only signal: the dot is a focusable image named with the
 * same words the tooltip shows (A1, K10). The state comes from the profile payload (`resolveProfilePresence` in
 * lib/profile.server.ts).
 */
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import type { ProfilePresence } from '@/lib/presence-types';

const DOT_COLOUR: Record<
  ProfilePresence['state'],
  string
> =
  {
    offline:
      'bg-site-text-muted',
    online:
      'bg-site-success',
    in_game:
      'bg-site-danger',
    away: 'bg-site-warning',
  };

export function PresenceDot({
  presence,
  className,
}: {
  presence: ProfilePresence;
  className?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  let label: string;
  switch (
    presence.state
  ) {
    case 'online':
      label =
        t(
          'presence-online',
          {
            defaultValue:
              'Online',
          },
        );
      break;
    case 'in_game':
      label =
        presence.label ||
        t(
          'presence-in-game',
          {
            defaultValue:
              'In a game',
          },
        );
      break;
    case 'away': {
      const minutes =
        Math.max(
          1,
          Math.round(
            (Date.now() -
              new Date(
                presence.lastSeenAt,
              ).getTime()) /
              60_000,
          ),
        );
      label =
        t(
          'presence-away',
          {
            minutes,
            defaultValue:
              'Away · active {{minutes}} min ago',
          },
        );
      break;
    }
    default:
      label =
        t(
          'presence-offline',
          {
            defaultValue:
              'Offline',
          },
        );
  }
  return (
    <span
      className={cn(
        'inline-flex',
        className,
      )}
    >
      <Tooltip
        content={
          label
        }
        className="whitespace-nowrap"
      >
        <span
          role="img"
          aria-label={
            label
          }
          tabIndex={
            0
          }
          data-slot="presence-dot"
          // "Away · active N min ago" is worked out at render, so the server's minute can differ from the browser's.
          suppressHydrationWarning
          data-state={
            presence.state
          }
          className={cn(
            'block size-3.5 rounded-full border-2 border-site-bg',
            DOT_COLOUR[
              presence
                .state
            ],
          )}
        />
      </Tooltip>
    </span>
  );
}
