/** Strip trailing slashes from a URL string. */
export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Ensure a URL ends with exactly one trailing slash. */
export function ensureTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '') + '/';
}
