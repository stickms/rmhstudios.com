/**
 * Tell an account that the ways into it changed: a sign-in method connected or
 * removed, or another account's sign-in moved into it. In-app at `critical`
 * urgency (it ignores quiet hours, as the new-device alert does) and by email to
 * the account's address when it has a real one.
 *
 * The point is the case where it was not them: a notice in the inbox they own
 * is how they find out, and the link goes straight to the page that undoes it.
 * Never throws: a failed notice must not fail the change it reports.
 */
import { prisma } from '@/lib/prisma.server';
import { dispatch } from '@/lib/notify/dispatch.server';
import { sendEmail } from '@/lib/email/send.server';
import { canEmail } from '@/lib/email/preferences.server';
import { SITE_URL } from '@/lib/seo';
import { CREDENTIAL_PROVIDER_ID, PROVIDER_NAMES, isSignInProviderId } from '@/lib/auth/providers';

export type SignInChange =
  | { kind: 'connected'; providerId: string }
  | { kind: 'removed'; providerId: string }
  | { kind: 'merged'; providerIds: string[] };

const SECURITY_PAGE = '/settings/security';

export function providerName(providerId: string): string {
  if (providerId === CREDENTIAL_PROVIDER_ID) return 'Email and password';
  return isSignInProviderId(providerId) ? PROVIDER_NAMES[providerId] : providerId;
}

function describe(change: SignInChange): { subject: string; line: string } {
  switch (change.kind) {
    case 'connected':
      return {
        subject: `${providerName(change.providerId)} was connected to your RMH Studios account`,
        line: `${providerName(change.providerId)} can now be used to sign in to your account.`,
      };
    case 'removed':
      return {
        subject: `${providerName(change.providerId)} was removed from your RMH Studios account`,
        line: `${providerName(change.providerId)} can no longer be used to sign in to your account.`,
      };
    case 'merged': {
      const names = change.providerIds.map(providerName).join(', ');
      return {
        subject: `A sign-in was moved to your RMH Studios account`,
        line: `${names} from another, empty account can now be used to sign in to this account. The empty account was closed.`,
      };
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function notifySignInChange(userId: string, change: SignInChange): Promise<void> {
  try {
    const { subject, line } = describe(change);
    const link = `${SITE_URL}${SECURITY_PAGE}`;
    const notIt = 'If this was not you, review your sign-in methods and sessions now.';

    await dispatch({
      userId,
      category: 'system',
      type: 'SYSTEM',
      entityType: 'security',
      entityId: `sign-in-methods:${change.kind}`,
      preview: line,
      link: SECURITY_PAGE,
      urgency: 'critical',
    });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    // sendEmail skips placeholder addresses itself. The email honours the
    // "Account security" email preference (on by default); the in-app notice
    // above is sent either way.
    if (user?.email && (await canEmail(userId, 'security'))) {
      await sendEmail({
        to: user.email,
        subject,
        html: [
          '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">',
          `<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(subject)}</h1>`,
          `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(line)}</p>`,
          `<p style="margin:0 0 20px;line-height:1.5">${escapeHtml(notIt)}</p>`,
          `<p style="margin:0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Review security settings</a></p>`,
          '</div>',
        ].join(''),
        text: `${subject}\n\n${line}\n\n${notIt}\n${link}`,
      });
    }
  } catch (error) {
    console.error('[auth] sign-in change notice failed:', error);
  }
}
