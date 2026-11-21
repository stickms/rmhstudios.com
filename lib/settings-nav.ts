/**
 * Every settings destination, as data (client-safe).
 *
 * Settings grew to ten pages under `/settings/` plus an eleventh living at
 * `/studio/themes`, and the hub page linked six of them. The rest — appearance,
 * content preferences, close friends, theme authoring — were reachable only if
 * you already knew the URL, because each new page was added as a route and the
 * hub was updated by hand or not at all.
 *
 * So the list lives here instead, and the hub renders it. Adding a settings
 * page means adding a row, which is also what makes it findable: the hub's
 * filter searches `label`, `hint` and `keywords`, so "dark mode" finds
 * Appearance and "block" finds Privacy without either word appearing on screen.
 *
 * Deliberately NOT a tab strip. A settings page wants its own URL — support
 * links point at them, people bookmark them, and `?tab=` deep links are worse
 * for both. The hub is an index, not a container.
 */

import {
  Bell,
  UserX,
  CloudUpload,
  Clapperboard,
  Keyboard,
  KeyRound,
  LayoutDashboard,
  MessageSquareText,
  Palette,
  Paintbrush,
  ShieldUser,
  SlidersHorizontal,
  Trash2,
  User,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** Which card on the hub a destination sits under. */
export type SettingsGroup =
  | 'personalization'
  | 'account'
  | 'content';

export interface SettingsDestination {
  /** Stable id — also the i18n key suffix. */
  id: string;
  to: string;
  group: SettingsGroup;
  icon: LucideIcon;
  /** English fallback; the hub runs these through `t()`. */
  label: string;
  hint: string;
  /**
   * Extra search terms that do not appear in the label or hint. This is where
   * the words people actually type go — "dark mode", "block", "2fa".
   */
  keywords: string;
  /** Hidden from the hub (and unreachable) when signed out. */
  requiresAuth?: boolean;
}

export const SETTINGS_DESTINATIONS: SettingsDestination[] =
  [
    // ── Personalization ──
    {
      id: 'appearance',
      to: '/settings/appearance',
      group:
        'personalization',
      icon: Palette,
      label:
        'Appearance & accessibility',
      hint: 'Theme, text, colour vision, globe motion, data saver and captions',
      keywords:
        'dark mode light night day dyslexia font readable text size spacing colorblind motion still data saver captions subtitles week numbers',
    },
    {
      id: 'themes',
      to: '/settings/themes',
      group:
        'personalization',
      icon: Paintbrush,
      label:
        'Theme studio',
      hint: 'Author your own theme, or browse ones people made',
      keywords:
        'custom theme create palette accent marketplace publish',
    },
    {
      id: 'layout',
      to: '/settings/layout',
      group:
        'personalization',
      icon: SlidersHorizontal,
      label:
        'Sidebar',
      hint: 'Order or hide the places in the desktop sidebar',
      keywords:
        'layout nav navigation rail arrange customize reorder hide tabs',
    },
    {
      id: 'notifications',
      to: '/settings/notifications',
      group:
        'personalization',
      icon: Bell,
      label:
        'Notifications',
      hint: 'What notifies you and how, quiet hours, bedtime and your calendar feed',
      keywords:
        'push email mute silence dnd schedule likes follows mentions bedtime ics google calendar apple outlook subscribe feed office hours availability poll find a time',
      requiresAuth: true,
    },

    {
      id: 'keyboard',
      to: '/settings/keyboard',
      group:
        'personalization',
      icon: Keyboard,
      label:
        'Keyboard',
      hint: 'Turn single-key shortcuts off, or change any shortcut',
      keywords:
        'shortcuts hotkeys keys remap rebind accessibility speech voice switch single character alt option',
    },

    // ── Content ──
    {
      id: 'content',
      to: '/settings/content',
      group:
        'content',
      icon: LayoutDashboard,
      label:
        'Content preferences',
      hint: 'What the feed shows you, and why',
      keywords:
        'feed algorithm ranking sensitive muted tags interests',
      requiresAuth: true,
    },
    // `/trash` already presented itself as a settings page — `backTo="/settings"`,
    // breadcrumbs reading "Settings › Trash", strings in the `settings-content`
    // namespace — while being absent from this list, which is the one thing that
    // makes a settings page reachable. It had no inbound link anywhere in the
    // running UI: the only way to a deleted post was to type the URL. This row is
    // the fix, and is exactly the failure this file's docblock describes.
    {
      id: 'trash',
      to: '/trash',
      group:
        'content',
      icon: Trash2,
      label:
        'Trash',
      hint: 'Restore something you deleted, or clear out a lot at once',
      keywords:
        'deleted recycle bin restore undelete bulk cleanup purge',
      requiresAuth: true,
    },

    // ── Account ──
    {
      id: 'profile',
      to: '/settings/profile',
      group:
        'account',
      icon: User,
      label:
        'Edit profile',
      hint: 'Name, bio and avatar, cosmetics, profile links and birthday',
      keywords:
        'bio avatar banner handle username display cosmetics badge frame rel me verify website link',
      requiresAuth: true,
    },
    {
      id: 'security',
      to: '/settings/security',
      group:
        'account',
      icon: KeyRound,
      label:
        'Security',
      hint: 'Sign-in methods, passkeys, sessions and account standing',
      keywords:
        'password login 2fa sign in devices logout revoke forgot reset strike ban suspended appeal moderation warning status',
      requiresAuth: true,
    },
    {
      id: 'cloud-saves',
      to: '/settings/cloud-saves',
      group:
        'account',
      icon: CloudUpload,
      label:
        'Cloud saves',
      hint: 'Back up, restore or delete your game saves, and see earlier versions',
      keywords:
        'game save backup restore download snapshot history progress void breaker neon driftway balatro',
      requiresAuth: true,
    },
    {
      id: 'replays',
      to: '/settings/replays',
      group:
        'account',
      icon: Clapperboard,
      label:
        'Replays',
      hint: 'Your saved game replays: make one public or unlisted, or delete it',
      keywords:
        'replay run recording ghost speedrun proof lights out slice it visibility public unlisted delete',
      requiresAuth: true,
    },
    {
      id: 'blocked',
      to: '/settings/blocked',
      group:
        'account',
      icon: UserX,
      label:
        'Blocked and muted',
      hint: 'Everyone you blocked or muted, with the date, and unblock or unmute them',
      keywords:
        'block unblock mute unmute blocked muted people accounts safety hide',
      requiresAuth: true,
    },
    // Sprint 06
    // s06-05 feedback-inbox
    {
      id: 'feedback',
      to: '/settings/feedback',
      group: 'account',
      icon: MessageSquareText,
      label: 'Your feedback',
      hint: 'What you sent us, where it stands, and any reply',
      keywords: 'feedback report bug problem accessibility send reply',
      requiresAuth: true,
    },
    {
      id: 'privacy',
      to: '/settings/privacy',
      group:
        'account',
      icon: ShieldUser,
      label:
        'Privacy & data',
      hint: 'Who sees you, close friends, calls, muted words, and your data',
      keywords:
        'block mute export download delete gdpr visibility private close friends circle audience list presence calls playtime',
      requiresAuth: true,
    },
    {
      id: 'wallet',
      to: '/wallet',
      group:
        'account',
      icon: Wallet,
      label:
        'Wallet',
      hint: 'Coins, transactions and memberships',
      keywords:
        'coins balance payment subscription billing stripe membership',
      requiresAuth: true,
    },
    {
      id: 'progress',
      to: '/progress',
      group:
        'account',
      icon: Zap,
      label:
        'Progress',
      hint: 'XP, streaks, quests and achievements',
      keywords:
        'xp level streak quest achievement battlepass season',
      requiresAuth: true,
    },
  ];

/**
 * Filter destinations by a free-text query.
 *
 * Matches every whitespace-separated term against label + hint + keywords, so
 * "dark text" narrows the same way a person expects rather than requiring the
 * terms in order. An empty query returns everything.
 */
export function filterSettings(
  destinations: SettingsDestination[],
  query: string,
): SettingsDestination[] {
  const terms =
    query
      .toLowerCase()
      .split(
        /\s+/,
      )
      .filter(
        Boolean,
      );
  if (
    terms.length ===
    0
  )
    return destinations;
  return destinations.filter(
    (
      d,
    ) => {
      const haystack =
        `${d.label} ${d.hint} ${d.keywords}`.toLowerCase();
      return terms.every(
        (
          term,
        ) =>
          haystack.includes(
            term,
          ),
      );
    },
  );
}
