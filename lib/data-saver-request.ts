/**
 * Data saver, as the SERVER can see it: the visitor's own setting, mirrored from
 * localStorage into a cookie by `setDataSaverPreference` (hooks/useDataSaver), and
 * the browser's `Save-Data: on` request header (Chrome's Lite mode and data-saver
 * extensions send it).
 *
 * The client also reads the connection itself (lib/network-quality); the server
 * cannot, so a slow link with no header and no setting renders the normal page,
 * and its later, client-mounted images still take the data-saver cap.
 *
 * The answer shapes the first page's images (`useDataSaverAtMount`), so it travels
 * to the client in the root loader data and the hydrating render reads the same
 * value. It also decides edge caching: a data-saver render is never shared
 * (server/nitro/anon-html-cache.ts, deploy/apply-cloudflare-cache-rules.sh).
 */

/** Also the localStorage key (`DATA_SAVER_KEY` in lib/network-quality). */
export const DATA_SAVER_COOKIE =
  'rmh-data-saver';

/** The stored setting from a Cookie header: `on`, `off`, or null for none / `auto`. */
export function dataSaverCookieValue(
  cookieHeader:
    | string
    | null
    | undefined,
):
  | 'on'
  | 'off'
  | null {
  if (
    !cookieHeader
  )
    return null;
  for (const part of cookieHeader.split(
    ';',
  )) {
    const [
      name,
      ...rest
    ] =
      part
        .trim()
        .split(
          '=',
        );
    if (
      name !==
      DATA_SAVER_COOKIE
    )
      continue;
    const value =
      rest
        .join(
          '=',
        )
        .trim();
    return value ===
      'on' ||
      value ===
        'off'
      ? value
      : null;
  }
  return null;
}

/**
 * Should this request's page be rendered for less data? The visitor's explicit
 * setting wins either way; otherwise the browser's `Save-Data` header decides.
 */
export function dataSaverFromRequest(
  cookieHeader:
    | string
    | null
    | undefined,
  saveDataHeader:
    | string
    | null
    | undefined,
): boolean {
  const setting =
    dataSaverCookieValue(
      cookieHeader,
    );
  if (
    setting
  )
    return (
      setting ===
      'on'
    );
  return (
    saveDataHeader
      ?.trim()
      .toLowerCase() ===
    'on'
  );
}
