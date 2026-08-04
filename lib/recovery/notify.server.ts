/**
 * Recovery notifications.
 *
 * I3 is explicit that a recovery request must reach **every existing session
 * and the primary email**, or the flow is a social-engineering vector rather
 * than a recovery path. That is the whole job of this module: make a recovery
 * attempt impossible to miss for the person who still has the account, while
 * the 24-hour mandatory delay is still running and cancelling is one click.
 *
 * In-app notifications are per-user, not per-session, so "every session" means
 * "a notification the account sees wherever it is signed in" — the same
 * mechanism strikes use.
 */

import { sendEmail } from '@/lib/email/send.server';
import { createNotification } from '@/lib/notifications.server';
import { SITE_URL } from '@/lib/seo';
import { maskEmail } from '@/lib/recovery/policy';

/** Minimal inline-styled email body — email clients ignore our token CSS. */
function shell(heading: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${cta.url}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${cta.label}</a></p>`
    : '';
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111">
<h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
<p style="margin:0 0 12px">${body}</p>
${button}
<p style="font-size:12px;color:#666;margin-top:24px">RMH Studios · ${SITE_URL}</p>
</div>`;
}

/** The link the initiator follows to finish a recovery once it is approved. */
export function recoveryCompletionUrl(requestId: string, token: string): string {
  return `${SITE_URL}/settings/security?recovery=${encodeURIComponent(requestId)}&token=${encodeURIComponent(token)}`;
}

/**
 * Tell the account owner — in the app and at their current primary address —
 * that somebody has started a recovery, and how to stop it.
 */
export async function notifyOwnerOfRecoveryStart(input: {
  userId: string;
  email: string | null;
  requestId: string;
  destinationEmail: string;
}): Promise<void> {
  const masked = maskEmail(input.destinationEmail);
  await createNotification({
    userId: input.userId,
    type: 'SYSTEM',
    entityType: 'recovery',
    entityId: input.requestId,
    preview: `Someone started account recovery, sending access to ${masked}. If this was not you, cancel it now.`,
    link: '/settings/security',
  }).catch(() => {});

  if (!input.email) return;
  await sendEmail({
    to: input.email,
    subject: 'Someone started account recovery on your RMH Studios account',
    html: shell(
      'Account recovery was requested',
      `Someone asked your trusted contacts to help recover this account, and to send access to <strong>${masked}</strong>. Nothing can happen for at least 24 hours. <strong>If this was not you, cancel it now</strong> — and change your password.`,
      { label: 'Review and cancel', url: `${SITE_URL}/settings/security` },
    ),
    text: `Someone started account recovery on your RMH Studios account (destination ${masked}). If this was not you, cancel it at ${SITE_URL}/settings/security`,
  }).catch(() => {});
}

/** Ask a confirmed trusted contact to vouch — or to raise the alarm. */
export async function notifyContactOfRecoveryRequest(input: {
  contactId: string;
  ownerId: string;
  ownerName: string;
  requestId: string;
  destinationEmail: string;
}): Promise<void> {
  await createNotification({
    userId: input.contactId,
    type: 'SYSTEM',
    entityType: 'recovery',
    entityId: input.requestId,
    preview: `${input.ownerName} is trying to recover their account. Only approve if you have confirmed it is really them — access goes to ${maskEmail(input.destinationEmail)}.`,
    link: '/settings/security',
  }).catch(() => {});
}

/** Send the initiator their single-use completion link. */
export async function sendRecoveryToken(input: {
  to: string;
  requestId: string;
  token: string;
}): Promise<void> {
  await sendEmail({
    to: input.to,
    subject: 'Your RMH Studios account recovery request',
    html: shell(
      'Account recovery started',
      'Your trusted contacts have been asked to approve this. Once two of them have, and after a mandatory 24-hour wait, this link finishes the recovery. It expires 72 hours after the request was made and works once.',
      { label: 'Finish recovery', url: recoveryCompletionUrl(input.requestId, input.token) },
    ),
    text: `Finish your RMH Studios account recovery: ${recoveryCompletionUrl(input.requestId, input.token)}`,
  }).catch(() => {});
}

/**
 * Tell the OLD address that the account has changed hands.
 *
 * Sent before the address is replaced. It is the last thing the previous owner
 * will ever receive at that address, so it says what happened and who to
 * contact — not a silent handover.
 */
export async function notifyOldEmailOfCompletion(input: {
  email: string | null;
  newEmail: string;
}): Promise<void> {
  if (!input.email) return;
  await sendEmail({
    to: input.email,
    subject: 'Your RMH Studios account was recovered',
    html: shell(
      'This account was recovered',
      `Two trusted contacts approved a recovery request and the sign-in address for this account is now <strong>${maskEmail(input.newEmail)}</strong>. Every session and API key has been signed out. Coin transfers, payout changes and redemptions are paused for 72 hours. <strong>If this was not you, contact support immediately.</strong>`,
      { label: 'Contact support', url: `${SITE_URL}/help` },
    ),
    text: `Your RMH Studios account was recovered; the sign-in address is now ${maskEmail(input.newEmail)}. If this was not you, contact support at ${SITE_URL}/help`,
  }).catch(() => {});
}
