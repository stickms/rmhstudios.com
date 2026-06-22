/**
 * RMH Rideshare — driver licence storage keys.
 *
 * Licence images are private: they are only ever served through an
 * admin-only endpoint and are deleted from object storage as soon as an
 * application has been reviewed.
 */

export const RIDESHARE_LICENSE_PREFIX = 'rideshare/licenses/';

/** Object-storage key for a stored licence filename. */
export function licenseKey(filename: string): string {
  return `${RIDESHARE_LICENSE_PREFIX}${filename}`;
}

/** Admin-only URL used to view a licence image in the review queue. */
export function licenseAdminUrl(filename: string): string {
  return `/api/admin/rideshare/license/${filename}`;
}

/** Extract the bare filename from a stored object key, if it matches. */
export function licenseFilenameFromKey(key: string): string | null {
  if (!key.startsWith(RIDESHARE_LICENSE_PREFIX)) return null;
  return key.slice(RIDESHARE_LICENSE_PREFIX.length) || null;
}
