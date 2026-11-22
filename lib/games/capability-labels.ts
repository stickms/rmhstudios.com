/**
 * Which i18n key names each capability enum value in the `game-access` namespace.
 *
 * Client-safe data only. The strings themselves are written, with their English defaults, as literal
 * `t()` calls in `components/steam/access-labels.ts` (the extractor scans `components/`, not `lib/`),
 * and `components/steam/__tests__/PlayingThisGame.test.tsx` holds the two to each other. Nothing here
 * builds a key from an enum value: every entry is spelled out.
 */

import type { AccessibilityFeature, ContentDescriptor, InputMethod, PlayerMode } from '@/lib/game-capabilities';
import type { AccessOption, PlayOption } from '@/lib/games/access-filter';

/** One accessibility claim, as a sentence. */
export const FEATURE_LABEL_KEYS: Record<AccessibilityFeature, string> = {
  'remappable-input': 'feature-remappable-input',
  'assist-mode': 'feature-assist-mode',
  'reduced-flashing': 'feature-reduced-flashing',
  'colorblind-safe': 'feature-colorblind-safe',
  subtitles: 'feature-subtitles',
  'no-timed-input': 'feature-no-timed-input',
};

/** One content descriptor, as words. */
export const DESCRIPTOR_LABEL_KEYS: Record<ContentDescriptor, string> = {
  flashing: 'descriptor-flashing',
  'gambling-themes': 'descriptor-gambling-themes',
  violence: 'descriptor-violence',
  'user-content': 'descriptor-user-content',
  'ai-generated': 'descriptor-ai-generated',
};

/** An input method as a lower-case noun for "Play with …". */
export const INPUT_LABEL_KEYS: Record<InputMethod, string> = {
  keyboard: 'input-keyboard',
  mouse: 'input-mouse',
  touch: 'input-touch',
  gamepad: 'input-gamepad',
  gyro: 'input-gyro',
};

/** "Needs …" for an input the game cannot be played without. */
export const REQUIRED_LABEL_KEYS: Record<InputMethod, string> = {
  keyboard: 'required-keyboard',
  mouse: 'required-mouse',
  touch: 'required-touch',
  gamepad: 'required-gamepad',
  gyro: 'required-gyro',
};

/** A player mode as a phrase; the online modes have a variant without a count. */
export const PLAYER_LABEL_KEYS: Record<PlayerMode, string> = {
  single: 'players-single',
  'online-versus': 'players-online-versus',
  'online-coop': 'players-online-coop',
  'async-leaderboard': 'players-leaderboard',
};
export const PLAYER_OPEN_LABEL_KEYS: Record<'online-versus' | 'online-coop', string> = {
  'online-versus': 'players-online-versus-open',
  'online-coop': 'players-online-coop-open',
};

/** Library filter buttons. */
export const PLAY_OPTION_LABEL_KEYS: Record<PlayOption, string> = {
  keyboard: 'filter-play-keyboard',
  touch: 'filter-play-touch',
  gamepad: 'filter-play-gamepad',
};
export const ACCESS_OPTION_LABEL_KEYS: Record<AccessOption, string> = {
  'no-flashing': 'filter-access-no-flashing',
  'no-timed-input': 'filter-access-no-timed-input',
  assists: 'filter-access-assists',
  remappable: 'filter-access-remappable',
  colorblind: 'filter-access-colorblind',
  subtitles: 'filter-access-subtitles',
};
