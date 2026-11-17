/**
 * Server-side reads and writes of a user's email preferences
 * (`lib/email/preferences.ts` holds the categories and defaults).
 */
import { prisma } from '@/lib/prisma.server';
import { invalidateNotificationPrefs } from '@/lib/notifications.server';
import {
  EMAIL_CATEGORIES,
  EMAIL_COLUMNS,
  resolveEmailPrefs,
  type EmailCategory,
  type EmailPrefs,
} from '@/lib/email/preferences';

const select = {
  emailSecurity: true,
  emailAnnouncements: true,
  emailProduct: true,
  emailDigest: true,
} as const;

export async function getEmailPrefs(userId: string): Promise<EmailPrefs> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId }, select });
  return resolveEmailPrefs(row);
}

/**
 * Whether `userId` accepts email in `category`. On a read failure it answers
 * with the category default, so a database hiccup neither spams people who
 * opted out of optional mail nor silences a security notice.
 */
export async function canEmail(userId: string, category: EmailCategory): Promise<boolean> {
  try {
    return (await getEmailPrefs(userId))[category];
  } catch (error) {
    console.error('[email] preference read failed:', error);
    return resolveEmailPrefs(null)[category];
  }
}

/** Partial update: a category left out is unchanged. Returns the effective result. */
export async function setEmailPrefs(
  userId: string,
  patch: Partial<EmailPrefs>,
): Promise<EmailPrefs> {
  const data: Partial<Record<(typeof EMAIL_COLUMNS)[EmailCategory], boolean>> = {};
  for (const cat of EMAIL_CATEGORIES) {
    const value = patch[cat];
    if (typeof value === 'boolean') data[EMAIL_COLUMNS[cat]] = value;
  }
  const row = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select,
  });
  invalidateNotificationPrefs(userId);
  return resolveEmailPrefs(row);
}
