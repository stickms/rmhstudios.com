import { SOURCES } from '../../sources';

export function forumRssUrl(
  node: number,
): string {
  return `/forums/${node}/index.rss`;
}

/** Page 1 is the bare forum URL. A page past the last redirects to the last page, so callers stop on lastPage. */
export function forumListingUrl(
  node: number,
  page: number,
): string {
  return page <=
    1
    ? `/forums/${node}/`
    : `/forums/${node}/page-${page}`;
}

export function threadPageUrl(
  slug: string,
  id: number,
  page: number,
): string {
  const base = `/threads/${slug}.${id}/`;
  return page <=
    1
    ? base
    : `${base}page-${page}`;
}

export function canonicalThreadUrl(
  slug: string,
  id: number,
): string {
  return `${SOURCES.SDN_FORUMS.origin}/threads/${slug}.${id}/`;
}

export function summaryPageUrl(
  code: string,
  slug: string,
): string {
  return `${SOURCES.SDN_WWW.origin}/schools-database/medical-school/interview-feedback/summary/${code}/${slug}`;
}
