/**
 * The published documentation site.
 *
 * The developer API used to be documented by an in-app wiki at
 * `/developer/docs`, rendered from `components/developer/guides.ts`. That wiki
 * is gone: the docs now live in `docs/developer-api/` and are published to Read
 * the Docs, so there is one copy rather than a repo copy and an app copy that
 * drift.
 *
 * Everything that links to the docs goes through here, so moving the site (a
 * custom domain, say) is a one-line change.
 *
 * Links point at `docs.rmhstudios.com` — the canonical domain — rather than at
 * `rmhstudios.readthedocs.io`. Read the Docs redirects the latter to the former,
 * so both resolve, but sending visitors through a redirect costs a round trip and
 * puts the wrong hostname in the address bar, in a shared link, and in anything
 * that copies a URL out of the page. The `/en/latest/` prefix stays: the RTD
 * project is multi-version, and a custom domain preserves that path structure.
 */

export const DOCS_SITE_URL = 'https://docs.rmhstudios.com/en/latest';

/** Absolute URL for a page in the docs site. `path` is extensionless. */
export function docsUrl(path = ''): string {
  const clean = path.replace(/^\/+/, '').replace(/\.md$/, '');
  return clean ? `${DOCS_SITE_URL}/${clean}.html` : `${DOCS_SITE_URL}/`;
}

/** The developer API documentation landing page. */
export const DEVELOPER_DOCS_URL = docsUrl('developer-api/index');
