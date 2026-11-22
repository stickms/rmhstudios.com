/**
 * The device page's store names and hints, translated.
 *
 * `lib/device-data/registry.ts` holds the stores as data; a key built at run time (`store-${id}`) is invisible to
 * `pnpm i18n:extract`, so each one is written out here as a literal call, the way `settings-nav-labels.ts` does.
 * `components/settings/__tests__/device-registry.test.ts` holds this list and the registry together.
 */
import type { TFunction } from 'i18next';

export interface DeviceStoreText {
  label: string;
  hint: string;
}

/** Translated label and hint per registry id (namespace `device-data`). */
export function deviceStoreText(t: TFunction): Record<string, DeviceStoreText> {
  return {
    'studio': {
      label: t('store-studio', { ns: 'device-data', defaultValue: 'Studio projects and samples' }),
      hint: t('store-studio-hint', { ns: 'device-data', defaultValue: 'Projects, recorded samples and presets from the Studio' }),
    },
    'drafts': {
      label: t('store-drafts', { ns: 'device-data', defaultValue: 'Unsent drafts' }),
      hint: t('store-drafts-hint', { ns: 'device-data', defaultValue: 'Writing you have not sent yet' }),
    },
    'library-reader': {
      label: t('store-library-reader', { ns: 'device-data', defaultValue: 'Library reader' }),
      hint: t('store-library-reader-hint', { ns: 'device-data', defaultValue: 'Book pages saved for reading offline' }),
    },
    'tf2-hud-drafts': {
      label: t('store-tf2-hud-drafts', { ns: 'device-data', defaultValue: 'HUD drafts' }),
      hint: t('store-tf2-hud-drafts-hint', { ns: 'device-data', defaultValue: 'Custom HUD drafts from the HUD editor' }),
    },
    'balatro-runs': {
      label: t('store-balatro-runs', { ns: 'device-data', defaultValue: 'Balatro matches' }),
      hint: t('store-balatro-runs-hint', { ns: 'device-data', defaultValue: 'Match rejoin snapshots and replays' }),
    },
    'balatro-packs': {
      label: t('store-balatro-packs', { ns: 'device-data', defaultValue: 'Balatro game packs' }),
      hint: t('store-balatro-packs-hint', { ns: 'device-data', defaultValue: 'Game files downloaded once so Balatro starts faster' }),
    },
    'rmhos-home': {
      label: t('store-rmhos-home', { ns: 'device-data', defaultValue: 'rmhOS home folder' }),
      hint: t('store-rmhos-home-hint', { ns: 'device-data', defaultValue: 'Files in your rmhOS home folder' }),
    },
    'hearthworks-saves': {
      label: t('store-hearthworks-saves', { ns: 'device-data', defaultValue: 'Hearthworks worlds' }),
      hint: t('store-hearthworks-saves-hint', { ns: 'device-data', defaultValue: 'Saved Hearthworks worlds' }),
    },
    'offline-caches': {
      label: t('store-offline-caches', { ns: 'device-data', defaultValue: 'Offline caches' }),
      hint: t('store-offline-caches-hint', { ns: 'device-data', defaultValue: 'Pages and images kept for offline use' }),
    },
    'draft-keys': {
      label: t('store-draft-keys', { ns: 'device-data', defaultValue: 'Saved drafts' }),
      hint: t('store-draft-keys-hint', { ns: 'device-data', defaultValue: 'Post and loadout drafts kept in browser storage' }),
    },
    'account-markers': {
      label: t('store-account-markers', { ns: 'device-data', defaultValue: 'Your markers and caches' }),
      hint: t('store-account-markers-hint', { ns: 'device-data', defaultValue: 'Recent items, reading marks, alerts and your cached sign-in details' }),
    },
    'game-saves': {
      label: t('store-game-saves', { ns: 'device-data', defaultValue: 'Game saves and progress' }),
      hint: t('store-game-saves-hint', { ns: 'device-data', defaultValue: 'Saves, unlocks, high scores and run history from the games' }),
    },
    'site-preferences': {
      label: t('store-site-preferences', { ns: 'device-data', defaultValue: 'Site preferences' }),
      hint: t('store-site-preferences-hint', { ns: 'device-data', defaultValue: 'Theme, language, text settings and tips you dismissed' }),
    },
    'game-preferences': {
      label: t('store-game-preferences', { ns: 'device-data', defaultValue: 'Game settings' }),
      hint: t('store-game-preferences-hint', { ns: 'device-data', defaultValue: 'Volume, controls and other settings from the games' }),
    },
  };
}
