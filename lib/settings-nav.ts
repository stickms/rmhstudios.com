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
  KeyRound,
  LayoutDashboard,
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
      hint: 'Text size, density, motion, colour vision',
      keywords:
        'dark mode light dyslexia font colorblind',
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
        'Home & sidebar layout',
      hint: 'Reorder home widgets; pin or hide navigation items',
      keywords:
        'widgets rail nav arrange customize dashboard',
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
        'Passkeys & security',
      hint: 'Sign-in methods, passkeys, sessions, recovery and account standing',
      keywords:
        'password login 2fa sign in devices logout revoke recovery codes trusted contacts strike ban suspended appeal moderation warning status',
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
