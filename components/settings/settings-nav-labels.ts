/**
 * The settings hub's destination names and hints, translated.
 *
 * `lib/settings-nav.ts` holds the destinations as data; a key built at run time
 * (`settings-nav-${id}`) is invisible to `pnpm i18n:extract`, so those strings
 * never reached `locales/en/feed.json` and every other locale showed English.
 * Each one is written out here as a literal call instead. The English defaults
 * are the ones in `lib/settings-nav.ts`, and
 * `components/settings/__tests__/settings-nav-labels.test.ts` holds the two
 * lists together.
 */
import type { TFunction } from 'i18next';

export interface SettingsNavText {
  label: string;
  hint: string;
}

/** Translated label and hint per destination id (namespace `feed`). */
export function settingsNavText(t: TFunction): Record<string, SettingsNavText> {
  return {
    'appearance': {
      label: t('settings-nav-appearance', { ns: 'feed', defaultValue: 'Appearance & accessibility' }),
      hint: t('settings-nav-appearance-hint', { ns: 'feed', defaultValue: 'Theme, text, colour vision, globe motion, data saver and captions' }),
    },
    'themes': {
      label: t('settings-nav-themes', { ns: 'feed', defaultValue: 'Theme studio' }),
      hint: t('settings-nav-themes-hint', { ns: 'feed', defaultValue: 'Author your own theme, or browse ones people made' }),
    },
    'layout': {
      label: t('settings-nav-layout', { ns: 'feed', defaultValue: 'Sidebar' }),
      hint: t('settings-nav-layout-hint', { ns: 'feed', defaultValue: 'Order or hide the places in the desktop sidebar' }),
    },
    'notifications': {
      label: t('settings-nav-notifications', { ns: 'feed', defaultValue: 'Notifications' }),
      hint: t('settings-nav-notifications-hint', { ns: 'feed', defaultValue: 'What notifies you and how, quiet hours, bedtime and your calendar feed' }),
    },
    'keyboard': {
      label: t('settings-nav-keyboard', { ns: 'feed', defaultValue: 'Keyboard' }),
      hint: t('settings-nav-keyboard-hint', { ns: 'feed', defaultValue: 'Turn single-key shortcuts off, or change any shortcut' }),
    },
    'content': {
      label: t('settings-nav-content', { ns: 'feed', defaultValue: 'Content preferences' }),
      hint: t('settings-nav-content-hint', { ns: 'feed', defaultValue: 'What the feed shows you, and why' }),
    },
    'trash': {
      label: t('settings-nav-trash', { ns: 'feed', defaultValue: 'Trash' }),
      hint: t('settings-nav-trash-hint', { ns: 'feed', defaultValue: 'Restore something you deleted, or clear out a lot at once' }),
    },
    'profile': {
      label: t('settings-nav-profile', { ns: 'feed', defaultValue: 'Edit profile' }),
      hint: t('settings-nav-profile-hint', { ns: 'feed', defaultValue: 'Name, bio and avatar, cosmetics, profile links and birthday' }),
    },
    'security': {
      label: t('settings-nav-security', { ns: 'feed', defaultValue: 'Security' }),
      hint: t('settings-nav-security-hint', { ns: 'feed', defaultValue: 'Sign-in methods, passkeys, sessions and account standing' }),
    },
    'cloud-saves': {
      label: t('settings-nav-cloud-saves', { ns: 'feed', defaultValue: 'Cloud saves' }),
      hint: t('settings-nav-cloud-saves-hint', { ns: 'feed', defaultValue: 'Back up, restore or delete your game saves, and see earlier versions' }),
    },
    'privacy': {
      label: t('settings-nav-privacy', { ns: 'feed', defaultValue: 'Privacy & data' }),
      hint: t('settings-nav-privacy-hint', { ns: 'feed', defaultValue: 'Who sees you, close friends, calls, muted words, and your data' }),
    },
    'wallet': {
      label: t('settings-nav-wallet', { ns: 'feed', defaultValue: 'Wallet' }),
      hint: t('settings-nav-wallet-hint', { ns: 'feed', defaultValue: 'Coins, transactions and memberships' }),
    },
    'progress': {
      label: t('settings-nav-progress', { ns: 'feed', defaultValue: 'Progress' }),
      hint: t('settings-nav-progress-hint', { ns: 'feed', defaultValue: 'XP, streaks, quests and achievements' }),
    },
  };
}
