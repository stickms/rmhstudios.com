/**
 * The published documentation site (Read the Docs).
 *
 * The developer API used to be documented by an in-app wiki at
 * `/developer/docs`, rendered from `components/developer/guides.ts`. That wiki
 * is gone: the docs now live in `docs/developer-api/` and are published to Read
 * the Docs, so there is one copy rather than a repo copy and an app copy that
 * drift.
 *
 * Everything that links to the docs goes through here, so moving the site (a
 * custom domain, say) is a one-line change.
 */

export const DOCS_SITE_URL = 'https://rmhstudios.readthedocs.io/en/latest';

/** Absolute URL for a page in the docs site. `path` is extensionless. */
export function docsUrl(path = ''): string {
  const clean = path.replace(/^\/+/, '').replace(/\.md$/, '');
  return clean ? `${DOCS_SITE_URL}/${clean}.html` : `${DOCS_SITE_URL}/`;
}

/** The developer API documentation landing page. */
export const DEVELOPER_DOCS_URL = docsUrl('developer-api/index');
