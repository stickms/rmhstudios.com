/**
 * The five sections (Steel 8.1 G3, 9 L4): Front, Explore, Games, Inbox, You. One list feeds the sidebar, `/sections`
 * and "which section is this path in", so they can never disagree about what exists or what is current.
 *
 * The sidebar lists the first four as words. "You" is not a word there (owner, 2026-11-13: "get rid of 'you' on the
 * sidebar since people can just click on their icon/avatar in the bottom left"): the account row at the sidebar's foot
 * is the link to the viewer's own page, and on a phone the open globe's bar carries it (GlobeBar). It stays a section,
 * so `/sections` still lists it and a profile or settings page still knows where it is.
 *
 * Client-safe and free of React: `href` is a function of the signed-in handle because "You" is the viewer's own page.
 */

export type SectionId =
  | 'front'
  | 'explore'
  | 'games'
  | 'inbox'
  | 'you';

export interface Section {
  id: SectionId;
  /** Where the section lands. `viewerPath` is `/u/<handle>` for a signed-in viewer, otherwise null. */
  href: (
    viewerPath:
      | string
      | null,
  ) => string;
  /** Paths (and their descendants) that make this section the current one. `/` matches only itself. */
  match: string[];
}

export const SECTIONS: readonly Section[] =
  [
    {
      id: 'front',
      href: () =>
        '/',
      match:
        [
          '/',
        ],
    },
    {
      id: 'explore',
      href: () =>
        '/explore',
      match:
        [
          '/explore',
          '/search',
          '/tag',
        ],
    },
    {
      id: 'games',
      href: () =>
        '/games',
      match:
        [
          '/games',
          '/apps',
        ],
    },
    {
      id: 'inbox',
      href: () =>
        '/messages',
      match:
        [
          '/messages',
          '/notifications',
        ],
    },
    {
      id: 'you',
      href: (
        viewerPath,
      ) =>
        viewerPath ??
        '/login',
      match:
        [
          '/u',
          '/settings',
          '/profile',
          '/login',
        ],
    },
  ] as const;

/** The sections the desktop sidebar lists as words: all but "You", which is the account row at its foot. */
export const SIDEBAR_SECTIONS: readonly Section[] =
  SECTIONS.filter(
    (
      section,
    ) =>
      section.id !==
      'you',
  );

const matches =
  (
    pathname: string,
    base: string,
  ) =>
    base ===
    '/'
      ? pathname ===
        '/'
      : pathname ===
          base ||
        pathname.startsWith(
          `${base}/`,
        );

/** The section `pathname` belongs to, or null when it belongs to none of the five. */
export function currentSection(
  pathname: string,
): SectionId | null {
  for (const s of SECTIONS)
    if (
      s.match.some(
        (
          m,
        ) =>
          matches(
            pathname,
            m,
          ),
      )
    )
      return s.id;
  return null;
}

/** The path of the viewer's own profile, or null when signed out. */
export function viewerPathFor(
  user:
    | {
        id: string;
        handle?:
          | string
          | null;
      }
    | null
    | undefined,
):
  | string
  | null {
  return user
    ? `/u/${user.handle || user.id}`
    : null;
}

/** Whether `pathname` is the viewer's own profile or a page under it (their posts), given {@link viewerPathFor}. */
export function isViewerPath(
  pathname: string,
  viewerPath:
    | string
    | null,
): boolean {
  return (
    viewerPath !==
      null &&
    matches(
      pathname,
      viewerPath,
    )
  );
}

/**
 * Where "Write a post" goes: `/share` opens the composer with an empty draft. Typed `string` because that route's search
 * params (title, text, url) are all optional in practice but required by its generated type.
 */
export const WRITE_HREF: string =
  '/share';

/**
 * Whether the page at `pathname` has an ink primary of its own (R4: one per view). On the front page that is Post (or
 * Sign in), and on a post it is Reply (or Sign in), so the sidebar's "Write a post" steps down to the plain button there
 * and stays the shell's primary everywhere else.
 */
export function pageOwnsPrimary(
  pathname: string,
): boolean {
  return (
    pathname ===
      '/' ||
    /^\/u\/[^/]+\/post\/[^/]+\/?$/.test(
      pathname,
    )
  );
}
