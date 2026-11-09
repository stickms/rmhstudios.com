import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma.server';
import { invalidateNotificationPrefs } from '@/lib/notifications.server';
import { verifyUnsubToken } from '@/lib/email/unsubscribe';

/**
 * /api/email/unsubscribe?token=... — PUBLIC, no login required.
 *
 * CAN-SPAM-compliant unsubscribe from the weekly digest, split by method so a
 * GET never writes (redesign audit C2):
 *
 * - **GET** verifies the signed token and returns a confirmation page with one
 *   button. It changes nothing. Mail security scanners (Outlook Safe Links,
 *   Proofpoint, Mimecast…), link previewers and prefetchers all fetch every
 *   link in a message; when this GET did the write, any of them unsubscribed
 *   the reader before they had read the email.
 * - **POST** verifies the token and flips `NotificationPreference.emailDigest`
 *   to false (upserting the row if absent). It serves both the confirmation
 *   button and RFC 8058 one-click unsubscribe: the digest sends
 *   `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 *   (`lib/digest/pipeline.server.ts`), so Gmail/Yahoo POST here directly —
 *   which, before this route had a POST handler, failed.
 *
 * Invalid or expired tokens get a friendly "link expired" page (still 200 so
 * email clients don't flag a broken link).
 */

const page = (heading: string, body: string, status = 200, action = ''): Response =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading}</title></head>` +
      `<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0b12;color:#e7e7f0;display:flex;min-height:100vh;align-items:center;justify-content:center;">` +
      `<main style="max-width:440px;text-align:center;padding:32px;">` +
      `<h1 style="font-size:22px;margin:0 0 12px;">${heading}</h1>` +
      `<p style="font-size:15px;line-height:1.6;color:#a1a1b5;margin:0 0 24px;">${body}</p>` +
      action +
      `<a href="https://rmhstudios.com" style="display:inline-block;background:#8b5cf6;color:#fff;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:10px;">Back to RMH Studios</a>` +
      `</main></body></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );

const limited = (request: Request): Response | null => {
  const { allowed } = rateLimit(getClientIp(request), {
    limit: 30,
    windowMs: 60_000,
    prefix: 'email-unsub',
  });
  return allowed
    ? null
    : page('Too many requests', 'Please wait a moment and try the link again.', 429);
};

const expired = (): Response =>
  page(
    'This link has expired',
    'We couldn’t verify this unsubscribe link. You can turn the weekly digest off any time from your notification settings.',
  );

const failed = (error: unknown): Response => {
  console.error('email unsubscribe error:', error);
  return page(
    'Something went wrong',
    'Please try again later, or turn off the digest from your settings.',
    500,
  );
};

/** The confirmation form. The token travels in the action URL, as it does for RFC 8058 one-click. */
const confirmForm = (token: string): string =>
  `<form method="post" action="/api/email/unsubscribe?token=${encodeURIComponent(token)}" style="margin:0 0 16px;">` +
  `<button type="submit" style="font:inherit;font-weight:600;background:#e7e7f0;color:#0b0b12;border:0;padding:11px 22px;border-radius:10px;cursor:pointer;">Unsubscribe</button>` +
  `</form>`;

export const Route = createFileRoute('/api/email/unsubscribe')({
  server: {
    handlers: {
      // Read-only: shows what the button will do. Never writes (see the header).
      GET: async ({ request }) => {
        try {
          const busy = limited(request);
          if (busy) return busy;
          const token = new URL(request.url).searchParams.get('token') ?? '';
          if (!verifyUnsubToken(token)) return expired();
          return page(
            'Unsubscribe from the weekly digest?',
            'You’ll stop receiving the weekly digest email. You can turn it back on any time from your notification settings.',
            200,
            confirmForm(token),
          );
        } catch (error) {
          return failed(error);
        }
      },
      // The write: the confirmation button and RFC 8058 one-click POSTs both land here.
      POST: async ({ request }) => {
        try {
          const busy = limited(request);
          if (busy) return busy;
          const token = new URL(request.url).searchParams.get('token') ?? '';
          const userId = verifyUnsubToken(token);
          if (!userId) return expired();

          await prisma.notificationPreference.upsert({
            where: { userId },
            create: { userId, emailDigest: false },
            update: { emailDigest: false },
          });
          invalidateNotificationPrefs(userId);

          return page(
            'You’re unsubscribed',
            'You won’t receive the weekly digest anymore. You can re-enable it any time from your notification settings.',
          );
        } catch (error) {
          return failed(error);
        }
      },
    },
  },
});
