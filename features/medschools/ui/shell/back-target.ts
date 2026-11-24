/** Where the top bar's left button goes: the site home from the index (a plain link), the index from everywhere else. */
export type BackTarget = '/' | '/rmh-medschool';

/** True on the app's index, `/rmh-medschool` (with or without a trailing slash). */
export function isMedIndex(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '');
  return clean === '/rmh-medschool' || clean === '';
}

/**
 * The index is the app's home, so its left button is a home link to the site (`/`); every other page is one step below
 * the index, which is where back goes when there is no earlier page of this session.
 */
export function backTargetFor(pathname: string): BackTarget {
  return isMedIndex(pathname) ? '/' : '/rmh-medschool';
}
