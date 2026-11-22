import { createFileRoute } from '@tanstack/react-router';
import { frameLoaderResponse } from '@/lib/rmhvibe/frame-response.server';

/**
 * /vibe-frame — the loader document every vibe and runnable code embed runs in.
 *
 * Not a page and not JSON, so not a registered `implement()` endpoint: a static HTML
 * body with its OWN Content-Security-Policy header (lib/csp/policy.server.ts,
 * `buildFramePolicy`). The host page loads it in `<iframe sandbox src="/vibe-frame">`
 * and hands it the user's HTML by postMessage (lib/rmhvibe/frame-protocol.ts); the
 * loader `document.write`s it, so the page runs under this policy and not the host's
 * (a srcdoc frame would inherit the host's nonce policy and run nothing inline).
 * The Nitro header plugin and the Apache vhost both leave this response's policy alone.
 * docs/csp.md, "Frames that run user code".
 */
export const Route = createFileRoute('/vibe-frame')({
  server: {
    handlers: {
      GET: () => frameLoaderResponse(),
    },
  },
});
