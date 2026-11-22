/**
 * Every `game-access` string for the capability enums, written out as a literal `t()` call so
 * `pnpm i18n:extract` sees it. `lib/games/capability-labels.ts` names the key for each enum value and
 * `components/steam/__tests__/PlayingThisGame.test.tsx` holds the two together.
 */
import type { TFunction } from 'i18next';
import type { AccessibilityFeature, ContentDescriptor, InputMethod, PlayerMode } from '@/lib/game-capabilities';
import type { AccessOption, PlayOption } from '@/lib/games/access-filter';

export function featureLabels(t: TFunction): Record<AccessibilityFeature, string> {
  return {
    'remappable-input': t('feature-remappable-input', {
      ns: 'game-access',
      defaultValue: 'Controls can be remapped',
    }),
    'assist-mode': t('feature-assist-mode', {
      ns: 'game-access',
      defaultValue: 'Assists are available',
    }),
    'reduced-flashing': t('feature-reduced-flashing', {
      ns: 'game-access',
      defaultValue: 'Can turn off flashing',
    }),
    'colorblind-safe': t('feature-colorblind-safe', {
      ns: 'game-access',
      defaultValue: 'Works for colour-blind players',
    }),
    subtitles: t('feature-subtitles', {
      ns: 'game-access',
      defaultValue: 'Has subtitles',
    }),
    'no-timed-input': t('feature-no-timed-input', {
      ns: 'game-access',
      defaultValue: 'Works without timed input',
    }),
  };
}

export function descriptorLabels(t: TFunction): Record<ContentDescriptor, string> {
  return {
    flashing: t('descriptor-flashing', {
      ns: 'game-access',
      defaultValue: 'This game contains flashing lights.',
    }),
    'gambling-themes': t('descriptor-gambling-themes', {
      ns: 'game-access',
      defaultValue: 'Gambling themes',
    }),
    violence: t('descriptor-violence', {
      ns: 'game-access',
      defaultValue: 'Violence',
    }),
    'user-content': t('descriptor-user-content', {
      ns: 'game-access',
      defaultValue: 'Content made by players',
    }),
    'ai-generated': t('descriptor-ai-generated', {
      ns: 'game-access',
      defaultValue: 'AI-generated content',
    }),
  };
}

export function inputLabels(t: TFunction): Record<InputMethod, string> {
  return {
    keyboard: t('input-keyboard', {
      ns: 'game-access',
      defaultValue: 'keyboard',
    }),
    mouse: t('input-mouse', {
      ns: 'game-access',
      defaultValue: 'mouse',
    }),
    touch: t('input-touch', {
      ns: 'game-access',
      defaultValue: 'touch',
    }),
    gamepad: t('input-gamepad', {
      ns: 'game-access',
      defaultValue: 'gamepad',
    }),
    gyro: t('input-gyro', {
      ns: 'game-access',
      defaultValue: 'motion sensors',
    }),
  };
}

export function requiredLabels(t: TFunction): Record<InputMethod, string> {
  return {
    keyboard: t('required-keyboard', {
      ns: 'game-access',
      defaultValue: 'Needs a keyboard',
    }),
    mouse: t('required-mouse', {
      ns: 'game-access',
      defaultValue: 'Needs a mouse',
    }),
    touch: t('required-touch', {
      ns: 'game-access',
      defaultValue: 'Needs a touch screen',
    }),
    gamepad: t('required-gamepad', {
      ns: 'game-access',
      defaultValue: 'Needs a gamepad',
    }),
    gyro: t('required-gyro', {
      ns: 'game-access',
      defaultValue: 'Needs motion sensors',
    }),
  };
}

/** `n` fills the online modes; the `*-open` variants are for a game that lists no player cap. */
export function playerLabels(
  t: TFunction,
  n: number,
): Record<PlayerMode, string> & Record<'online-versus-open' | 'online-coop-open', string> {
  return {
    single: t('players-single', {
      ns: 'game-access',
      defaultValue: '1 player',
    }),
    'online-versus': t('players-online-versus', {
      ns: 'game-access',
      defaultValue: 'Up to {{n}} online, against each other',
      n,
    }),
    'online-coop': t('players-online-coop', {
      ns: 'game-access',
      defaultValue: 'Up to {{n}} online, together',
      n,
    }),
    'async-leaderboard': t('players-leaderboard', {
      ns: 'game-access',
      defaultValue: 'Compete on leaderboards',
    }),
    'online-versus-open': t('players-online-versus-open', {
      ns: 'game-access',
      defaultValue: 'Online, against each other',
    }),
    'online-coop-open': t('players-online-coop-open', {
      ns: 'game-access',
      defaultValue: 'Online, together',
    }),
  };
}

export function playOptionLabels(t: TFunction): Record<PlayOption, string> {
  return {
    keyboard: t('filter-play-keyboard', {
      ns: 'game-access',
      defaultValue: 'Keyboard only',
    }),
    touch: t('filter-play-touch', {
      ns: 'game-access',
      defaultValue: 'Touch',
    }),
    gamepad: t('filter-play-gamepad', {
      ns: 'game-access',
      defaultValue: 'Gamepad',
    }),
  };
}

export function accessOptionLabels(t: TFunction): Record<AccessOption, string> {
  return {
    'no-flashing': t('filter-access-no-flashing', {
      ns: 'game-access',
      defaultValue: 'No flashing',
    }),
    'no-timed-input': t('filter-access-no-timed-input', {
      ns: 'game-access',
      defaultValue: 'No timed input',
    }),
    assists: t('filter-access-assists', {
      ns: 'game-access',
      defaultValue: 'Assists',
    }),
    remappable: t('filter-access-remappable', {
      ns: 'game-access',
      defaultValue: 'Remappable controls',
    }),
    colorblind: t('filter-access-colorblind', {
      ns: 'game-access',
      defaultValue: 'Colour-blind safe',
    }),
    subtitles: t('filter-access-subtitles', {
      ns: 'game-access',
      defaultValue: 'Subtitles',
    }),
  };
}
