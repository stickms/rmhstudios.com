/**
 * The five sections (Steel 8.1 G3, 9 L4): Front, Explore, Games, Inbox, You. One list feeds the sidebar, the phone
 * globe's pins and `/sections`, so the three can never disagree about what exists or what is current.
 *
 * Client-safe and free of React: `href` is a function of the signed-in handle because "You" is the viewer's own page.
 */

export type SectionId = 'front' | 'explore' | 'games' | 'inbox' | 'you';

export interface Section {
  id: SectionId;
  /** Where the section lands. `viewerPath` is `/u/<handle>` for a signed-in viewer, otherwise null. */
  href: (viewerPath: string | null) => string;
  /** Paths (and their descendants) that make this section the current one. `/` matches only itself. */
  match: string[];
}

export const SECTIONS: readonly Section[] = [
  { id: 'front', href: () => '/', match: ['/'] },
  {
    id: 'explore',
    href: () => '/explore',
    match: ['/explore', '/search', '/tag'],
  },
  {
    id: 'games',
    href: () => '/games',
    match: ['/games', '/apps'],
  },
  {
    id: 'inbox',
    href: () => '/messages',
    match: ['/messages', '/notifications'],
  },
  {
    id: 'you',
    href: (viewerPath) => viewerPath ?? '/login',
    match: ['/u', '/settings', '/profile', '/login'],
  },
] as const;

const matches = (pathname: string, base: string) =>
  base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`);

/** The section `pathname` belongs to, or null when it belongs to none of the five. */
export function currentSection(pathname: string): SectionId | null {
  for (const s of SECTIONS) if (s.match.some((m) => matches(pathname, m))) return s.id;
  return null;
}

/** The path of the viewer's own profile, or null when signed out. */
export function viewerPathFor(user: { id: string; handle?: string | null } | null | undefined): string | null {
  return user ? `/u/${user.handle || user.id}` : null;
}

/**
 * Where "Write a post" goes: `/share` opens the composer with an empty draft. Typed `string` because that route's search
 * params (title, text, url) are all optional in practice but required by its generated type.
 */
export const WRITE_HREF: string = '/share';
