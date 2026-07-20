import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma.server';
import { verifyUnsubToken } from '@/lib/email/unsubscribe';

/**
 * GET /api/email/unsubscribe?token=... — PUBLIC, no login required.
 *
 * One-click, CAN-SPAM-compliant unsubscribe from the weekly digest. Verifies
 * the signed token, flips `NotificationPreference.emailDigest` to false
 * (upserting the row if absent), and returns a small confirmation page. Invalid
 * or expired tokens get a friendly "link expired" page (still 200 so email
 * clients don't flag a broken link).
 */

const page = (heading: string, body: string, status = 200): Response =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading}</title></head>` +
      `<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0b12;color:#e7e7f0;display:flex;min-height:100vh;align-items:center;justify-content:center;">` +
      `<main style="max-width:440px;text-align:center;padding:32px;">` +
      `<h1 style="font-size:22px;margin:0 0 12px;">${heading}</h1>` +
      `<p style="font-size:15px;line-height:1.6;color:#a1a1b5;margin:0 0 24px;">${body}</p>` +
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

export const Route = createFileRoute('/api/email/unsubscribe')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'email-unsub',
          });
          if (!allowed)
            return page('Too many requests', 'Please wait a moment and try the link again.', 429);

          const token = new URL(request.url).searchParams.get('token') ?? '';
          const userId = verifyUnsubToken(token);
          if (!userId) {
            return page(
              'This link has expired',
              'We couldn’t verify this unsubscribe link. You can turn the weekly digest off any time from your notification settings.',
            );
          }

          await prisma.notificationPreference.upsert({
            where: { userId },
            create: { userId, emailDigest: false },
            update: { emailDigest: false },
          });

          return page(
            'You’re unsubscribed',
            'You won’t receive the weekly digest anymore. You can re-enable it any time from your notification settings.',
          );
        } catch (error) {
          console.error('email unsubscribe error:', error);
          return page(
            'Something went wrong',
            'Please try again later, or turn off the digest from your settings.',
            500,
          );
        }
      },
    },
  },
});
