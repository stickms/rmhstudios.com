/**
 * The endorsable skills' names, translated.
 *
 * `SKILLS` in `lib/profile/skills.ts` is the list; a key built from a skill id
 * (`skill-${id}`) is invisible to `pnpm i18n:extract`. Each skill is written
 * out here as a literal call, with the English `SKILLS` carries; the module
 * shows an id this map does not know as it is.
 * `components/profile/plus/__tests__/skill-labels.test.ts` holds the map equal
 * to `SKILLS`.
 */
import type { TFunction } from 'i18next';

/** Translated name per skill id (namespace `f-profile-plus`). */
export function skillLabels(t: TFunction): Record<string, string> {
  return {
    'beatmaking': t('skill-beatmaking', { ns: 'f-profile-plus', defaultValue: 'Beatmaking' }),
    'music-production': t('skill-music-production', { ns: 'f-profile-plus', defaultValue: 'Music production' }),
    'pixel-art': t('skill-pixel-art', { ns: 'f-profile-plus', defaultValue: 'Pixel art' }),
    'illustration': t('skill-illustration', { ns: 'f-profile-plus', defaultValue: 'Illustration' }),
    '3d-modelling': t('skill-3d-modelling', { ns: 'f-profile-plus', defaultValue: '3D modelling' }),
    'level-design': t('skill-level-design', { ns: 'f-profile-plus', defaultValue: 'Level design' }),
    'game-design': t('skill-game-design', { ns: 'f-profile-plus', defaultValue: 'Game design' }),
    'programming': t('skill-programming', { ns: 'f-profile-plus', defaultValue: 'Programming' }),
    'writing': t('skill-writing', { ns: 'f-profile-plus', defaultValue: 'Writing' }),
    'video-editing': t('skill-video-editing', { ns: 'f-profile-plus', defaultValue: 'Video editing' }),
    'streaming': t('skill-streaming', { ns: 'f-profile-plus', defaultValue: 'Streaming' }),
    'speedrunning': t('skill-speedrunning', { ns: 'f-profile-plus', defaultValue: 'Speedrunning' }),
    'modding': t('skill-modding', { ns: 'f-profile-plus', defaultValue: 'Modding' }),
    'community-building': t('skill-community-building', { ns: 'f-profile-plus', defaultValue: 'Community building' }),
    'translation': t('skill-translation', { ns: 'f-profile-plus', defaultValue: 'Translation' }),
    'teaching': t('skill-teaching', { ns: 'f-profile-plus', defaultValue: 'Teaching' }),
  };
}
