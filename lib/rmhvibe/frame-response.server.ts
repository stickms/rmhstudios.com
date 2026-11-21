/**
 * The `GET /vibe-frame` response (docs/csp.md, "Frames that run user code"). Built here
 * rather than in the route file so a test can hold the header set without a router.
 */
import { buildFramePolicy } from '@/lib/csp/policy.server';
import { FRAME_LOADER_HTML } from '@/lib/rmhvibe/frame-protocol';

export function frameLoaderHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    // The body is static and identical for everyone, so any cache may keep it.
    'Cache-Control': 'public, max-age=300',
    'Content-Security-Policy': buildFramePolicy(),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export function frameLoaderResponse(): Response {
  return new Response(FRAME_LOADER_HTML, {
    headers: frameLoaderHeaders(),
  });
}
