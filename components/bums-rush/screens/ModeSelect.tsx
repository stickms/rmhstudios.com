'use client';

/**
 * Picking a way in.
 *
 * §9.7's five doors reduce to four things a player can want, and the ordering
 * is the design's: **Quick Play does not open a lobby** — it seats you and
 * starts a level, because nobody should stare at a room code waiting for a
 * stranger. The lobby exists for people who already know each other.
 *
 * The grid is `auto-fit`/`minmax` rather than breakpointed columns so it is one
 * column on a 320px phone, two on a landscape handset, and four on a 3440px
 * ultrawide without any of those numbers appearing in the source. The card
 * min-width is the only figure that matters and it is the width at which the
 * longest title stops wrapping badly.
 */

import { useTranslation } from 'react-i18next';
import { Swords, Timer, Users, Wifi, type LucideIcon } from 'lucide-react';
import { PaperCard } from '../paper/PaperSurface';
import { ScreenFrame } from './ScreenFrame';

interface ModeSelectProps {
  onCampaign: () => void;
  onQuickPlay: () => void;
  onShowdown: () => void;
  onLobby: () => void;
  onBack: () => void;
  /** Off when the socket is unreachable — the online doors say so instead of failing on tap. */
  onlineAvailable: boolean;
}

interface ModeCardData {
  id: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  action: () => void;
  online: boolean;
}

export function ModeSelect({
  onCampaign,
  onQuickPlay,
  onShowdown,
  onLobby,
  onBack,
  onlineAvailable,
}: ModeSelectProps) {
  const { t } = useTranslation('c-bums-rush');

  const modes: ModeCardData[] = [
    {
      id: 'campaign',
      icon: Timer,
      title: t('mode.campaign', { defaultValue: 'Campaign' }),
      blurb: t('mode.campaign-blurb', {
        defaultValue: 'Eight worlds of levels, alone or with anyone who turns up. Your progress follows you.',
      }),
      action: onCampaign,
      online: false,
    },
    {
      id: 'quick',
      icon: Wifi,
      title: t('mode.quick', { defaultValue: 'Quick Play' }),
      blurb: t('mode.quick-blurb', {
        defaultValue: 'Straight into a level with whoever is around. No code, no waiting room.',
      }),
      action: onQuickPlay,
      online: true,
    },
    {
      id: 'showdown',
      icon: Swords,
      title: t('mode.showdown', { defaultValue: 'Showdown' }),
      blurb: t('mode.showdown-blurb', {
        defaultValue: 'For when co-operation has run its course. Best of five arenas, two to four players.',
      }),
      action: onShowdown,
      online: true,
    },
    {
      id: 'lobby',
      icon: Users,
      title: t('mode.lobby', { defaultValue: 'Play with friends' }),
      blurb: t('mode.lobby-blurb', {
        defaultValue: 'Open a private room and send the link, or type a code you were given.',
      }),
      action: onLobby,
      online: true,
    },
  ];

  return (
    <ScreenFrame
      title={t('mode.heading', { defaultValue: 'How are we doing this?' })}
      subtitle={t('mode.sub', {
        defaultValue: 'Everything here plays with a controller, a keyboard, or two thumbs.',
      })}
      width="wide"
      onBack={onBack}
      backLabel={t('nav.back', { defaultValue: 'Back' })}
    >
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-[clamp(0.75rem,2vmin,1.25rem)]">
        {modes.map((mode, index) => {
          const disabled = mode.online && !onlineAvailable;
          const Icon = mode.icon;
          return (
            <li key={mode.id}>
              <PaperCard tilt={index % 2 === 0 ? -0.8 : 0.8} className="h-full">
                <button
                  type="button"
                  onClick={mode.action}
                  disabled={disabled}
                  className="flex h-full w-full flex-col items-start gap-2 rounded-bum p-[clamp(0.875rem,2.5vmin,1.5rem)] text-left transition-colors hover:bg-bum-paper-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Icon className="size-6 text-bum-ink" aria-hidden="true" />
                  <span className="text-lg font-semibold text-bum-ink">{mode.title}</span>
                  <span className="text-sm text-bum-graphite">{mode.blurb}</span>
                  {disabled ? (
                    <span className="mt-auto pt-2 text-xs font-medium text-bum-danger">
                      {t('mode.offline', { defaultValue: 'Needs a connection — this one is offline right now.' })}
                    </span>
                  ) : null}
                </button>
              </PaperCard>
            </li>
          );
        })}
      </ul>
    </ScreenFrame>
  );
}
