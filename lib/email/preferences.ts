/**
 * Email categories and their defaults. Client-safe: the settings page, the
 * admin composer and the server senders all read this one table.
 *
 * The defaults are the point: mail a person would want even if they never
 * opened settings (a sign-in from a new device, a breach notice, a site
 * announcement) is on; anything promotional is opt-in. A user with no
 * `notification_preference` row reads exactly these values, and the column
 * defaults in `prisma/schema/profile.prisma` match them.
 */

export const EMAIL_CATEGORIES = ['security', 'announcements', 'product', 'digest'] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export type EmailPrefs = Record<EmailCategory, boolean>;

export const EMAIL_DEFAULTS: EmailPrefs = {
  security: true,
  announcements: true,
  product: false,
  digest: false,
};

/** The `notification_preference` column behind each category. */
export const EMAIL_COLUMNS = {
  security: 'emailSecurity',
  announcements: 'emailAnnouncements',
  product: 'emailProduct',
  digest: 'emailDigest',
} as const satisfies Record<EmailCategory, string>;

/**
 * What an admin campaign is filed under. `service` is a required notice about
 * the account or the service itself (terms changes, a data breach, an outage
 * that affects the reader): it is sent whatever the reader's preferences say,
 * which is why the composer asks for confirmation before using it.
 */
export const CAMPAIGN_CATEGORIES = ['announcements', 'product', 'service'] as const;
export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number];

/** The preference a campaign category respects, or `null` when it ignores opt-outs. */
export function campaignPreference(category: CampaignCategory): EmailCategory | null {
  switch (category) {
    case 'announcements':
      return 'announcements';
    case 'product':
      return 'product';
    case 'service':
      return null;
  }
}

/** Resolve a stored row (or none) to the effective preferences. */
export function resolveEmailPrefs(
  row: Partial<Record<(typeof EMAIL_COLUMNS)[EmailCategory], boolean | null>> | null | undefined,
): EmailPrefs {
  const out = {
    ...EMAIL_DEFAULTS,
  };
  if (!row) return out;
  for (const cat of EMAIL_CATEGORIES) {
    const value = row[EMAIL_COLUMNS[cat]];
    if (typeof value === 'boolean') out[cat] = value;
  }
  return out;
}
