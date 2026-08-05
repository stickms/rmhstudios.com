/**
 * /handle — the `web+rmh://` protocol handler target (OPT-64).
 *
 * Registered in `public/manifest.webmanifest` as
 * `{ "protocol": "web+rmh", "url": "/handle?target=%s" }`. When the installed
 * app is the registered handler for the scheme, the OS opens this URL with the
 * whole `web+rmh://…` link percent-encoded into `target`, and `launch_handler`
 * points it at the window that is already open.
 *
 * `target` is the only input on this site that arrives from outside the
 * browser, so it is validated twice and trusted never:
 *
 *  1. zod, for the shape (a present, bounded string — a missing or absurd
 *     `target` is a launch, not an error page, so it lands on the feed);
 *  2. `resolveProtocolTarget`, which matches it against a closed set of kinds
 *     and returns a site-relative path **it** constructed, or `null`.
 *
 * The handler can therefore only ever emit a `Location` this module chose. It
 * is deliberately not possible to express "redirect to this URL" here: that is
 * an open redirect, and an open redirect reachable from an OS-level link is one
 * a phishing page can hand to a user's own installed app.
 *
 * Server-only route (no component): a 302 costs no render, and a redirect keeps
 * the address bar on the real destination instead of `/handle?target=…`.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { PROTOCOL_FALLBACK_PATH, resolveProtocolTarget } from '@/lib/pwa/protocol-target';

const targetSchema = z.object({
  target: z.string().min(1).max(512),
});

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: path,
      // A launch URL is per-user context and must never be stored by anything.
      'Cache-Control': 'no-store',
      // Nothing links here; it exists for the OS. Keep it out of the index.
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export const Route = createFileRoute('/handle')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read' }, ({ request }) => {
        const parsed = targetSchema.safeParse({
          target: new URL(request.url).searchParams.get('target') ?? undefined,
        });
        if (!parsed.success) return redirectTo(PROTOCOL_FALLBACK_PATH);
        return redirectTo(resolveProtocolTarget(parsed.data.target) ?? PROTOCOL_FALLBACK_PATH);
      }),
    },
  },
});
