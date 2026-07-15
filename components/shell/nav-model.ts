/**
 * Shared sidebar navigation model for the canvas shell.
 *
 * Mirrors the NAV structure in `components/feed/LeftSidebar.tsx` (the DOM
 * rail) so the canvas ShellScene renders the same destinations, order, and
 * auth/admin gating. Icon names refer to `canvas-ui/widgets/icons.ts`.
 *
 * NOTE: kept as a standalone model to avoid refactoring the working DOM
 * sidebar mid-overhaul; unify the two once the DOM rail is retired.
 */

import type { IconName } from "@/canvas-ui/widgets/icons";

export interface NavLeaf {
  href: string;
  tKey: string;
  label: string;
  icon: IconName;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
  external?: boolean;
}
export interface NavGroup {
  group: string;
  tKey: string;
  label: string;
  icon: IconName;
  children: NavLeaf[];
}
export type NavItem = NavLeaf | NavGroup;
export const isNavGroup = (item: NavItem): item is NavGroup => "group" in item;

export const SHELL_NAV: NavItem[] = [
  { href: "/", tKey: "nav-home", label: "Home", icon: "home" },
  { href: "/search", tKey: "nav-explore", label: "Explore", icon: "compass" },
  { href: "/messages", tKey: "nav-inbox", label: "Inbox", icon: "inbox", requiresAuth: true },
  { href: "/create", tKey: "nav-creator-studio", label: "Creator Studio", icon: "wand" },
  { href: "/library", tKey: "nav-library", label: "Library", icon: "library" },
  { href: "/communities", tKey: "nav-communities", label: "Communities", icon: "users" },
  { href: "/store", tKey: "nav-store", label: "Store", icon: "shopping-bag" },
  { href: "/predictions", tKey: "nav-predictions", label: "Predictions", icon: "trending-up" },
  {
    group: "more",
    tKey: "nav-more",
    label: "More",
    icon: "more-horizontal",
    children: [
      { href: "/homes", tKey: "nav-homes", label: "RMHHomes", icon: "building" },
      { href: "/rmhladder", tKey: "nav-rmhladder", label: "RMHLadder", icon: "briefcase" },
      { href: "/rideshare", tKey: "nav-rideshare", label: "Rideshare", icon: "car" },
      { href: "/developer", tKey: "nav-developer", label: "Developer", icon: "terminal" },
      { href: "/rmh-capital", tKey: "nav-rmh-capital", label: "RMH Capital", icon: "landmark" },
      { href: "/rmh-pmc", tKey: "nav-rmh-pmc", label: "RMH PMC", icon: "shield" },
      { href: "/adaptive-intelligence", tKey: "nav-adaptive-intelligence", label: "Adaptive Intelligence", icon: "atom" },
      { href: "/deeplink", tKey: "nav-rmh-deeplink", label: "RMH Deeplink", icon: "brain", external: true },
    ],
  },
  { href: "/admin", tKey: "nav-admin", label: "Admin", icon: "shield-badge", requiresAdmin: true },
];

/** Is `href` the active destination for `pathname`? Matches the DOM rail. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
