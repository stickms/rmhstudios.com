/**
 * "You already have an account": the email sent when someone signs up with an
 * address that already belongs to an RMH account.
 *
 * Sign-up never says whether an address is taken (Better Auth answers a
 * duplicate exactly like a new sign-up, so the form cannot be used to find out
 * who has an account). Before this, the duplicate case then sent nothing, and
 * the owner sat in front of "Check your inbox" with an empty inbox, usually
 * because they had signed up with Discord or GitHub under that address and
 * forgot. This tells the inbox's owner how they actually sign in.
 *
 * Wired as `emailAndPassword.onExistingUserSignUp` in `lib/auth.ts`, which calls
 * `sendExistingAccountNotice` WITHOUT awaiting it: the sign-up response must take
 * the same time whether or not the address exists, or the delay of an email send
 * would reveal it.
 */
import { prisma } from '@/lib/prisma.server';
import { lruL1 } from '@/lib/cached.server';
import { sendEmail } from '@/lib/email/send.server';
import { SITE_URL } from '@/lib/seo';
import { providerName } from '@/lib/auth/security-notice.server';
import { CREDENTIAL_PROVIDER_ID, isPlaceholderEmail } from '@/lib/auth/providers';

/** At most one of these per account per hour. */
const NOTICE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * In-process on purpose (`lruL1`, not `cached`): this is a per-process throttle
 * that only stops one person's repeated sign-up attempts from flooding an inbox.
 * The sign-up endpoint's own per-IP rate limit bounds the rest, and a second web
 * process sending one more notice in the same hour is harmless.
 */
const recentlyNotified = lruL1('existing-account-notice', { maxEntries: 5000 });

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** "Discord", "Discord and GitHub", "Discord, GitHub and your email and password". */
export function describeSignInMethods(providerIds: string[]): string {
  const names = [...new Set(providerIds)].map((id) =>
    id === CREDENTIAL_PROVIDER_ID ? 'your email and password' : providerName(id),
  );
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export async function sendExistingAccountNotice(user: { id: string; email: string }): Promise<void> {
  try {
    if (isPlaceholderEmail(user.email) || recentlyNotified.has(user.id)) return;
    recentlyNotified.set(user.id, true, NOTICE_INTERVAL_MS);

    const accounts = await prisma.account.findMany({
      where: { userId: user.id },
      select: { providerId: true },
    });
    const methods = describeSignInMethods(accounts.map((a) => a.providerId));
    const loginUrl = `${SITE_URL}/login`;

    const subject = 'You already have an RMH Studios account';
    const line = methods
      ? `Someone just tried to create a new RMH Studios account with this email address, but you already have one. You sign in with ${methods}.`
      : 'Someone just tried to create a new RMH Studios account with this email address, but you already have one.';
    const notYou = 'If this was not you, you can ignore this email. Nothing about your account has changed.';

    await sendEmail({
      to: user.email,
      subject,
      html: [
        '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">',
        `<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(subject)}</h1>`,
        `<p style="font-size:14px;line-height:1.5;margin:0 0 20px">${escapeHtml(line)}</p>`,
        `<a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Sign in</a>`,
        `<p style="font-size:12px;color:#666;margin:20px 0 0">${escapeHtml(notYou)}</p>`,
        '</div>',
      ].join(''),
      text: `${subject}\n\n${line}\n\nSign in: ${loginUrl}\n\n${notYou}`,
    });
  } catch (error) {
    console.error('[auth] existing-account notice failed:', error);
  }
}
