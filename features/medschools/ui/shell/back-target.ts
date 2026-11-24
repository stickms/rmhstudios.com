/** Where the top bar's back button goes when there is no earlier page of this session to go back to. */
export type BackTarget = '/services' | '/rmh-medschool';

/** The index is a top-level page of the Services hub; every other page is one step below the index. */
export function backTargetFor(pathname: string): BackTarget {
  const clean = pathname.replace(/\/+$/, '');
  return clean === '/rmh-medschool' || clean === '' ? '/services' : '/rmh-medschool';
}
