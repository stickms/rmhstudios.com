/**
 * GET /api/vibe/pkg/$file
 *
 * Serves a pre-bundled "hosted" vibe package (React + the curated large libs from
 * public/vibe-packages/) to generated vibe pages — crucially, WITH cross-origin
 * headers.
 *
 * Why a route and not the plain static file: every generated page renders inside a
 * sandboxed iframe with NO allow-same-origin, i.e. an OPAQUE origin. ES-module
 * imports are always fetched in CORS mode, and from an opaque origin every request
 * is cross-origin — so the response MUST carry `Access-Control-Allow-Origin` or the
 * browser blocks it ("CORS header 'Access-Control-Allow-Origin' missing" / "Module
 * source URI is not allowed in this document"). A bare static asset sends no such
 * header, so self-hosted React/three/etc. failed to load and the page black-screened.
 * esm.sh worked only because it returns `Access-Control-Allow-Origin: *`; this route
 * gives our own bundles the same treatment.
 *
 * Filenames are content-revisioned via the importmap's `?r=<rev>` query, so the
 * bytes at a URL never change — responses are cached immutably.
 */

import { createFileRoute } from '@tanstack/react-router';
import { readFile } from 'node:fs/promises';
import { resolveHostedPackagePath } from '@/lib/rmhvibe/vibe-bundle.server';

// Allow any origin (the iframe's opaque origin can't be named) and let the bytes
// be embedded cross-origin under our own COEP, if any.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export const Route = createFileRoute('/api/vibe/pkg/$file')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const filePath = resolveHostedPackagePath(params.file);
        if (!filePath) {
          return new Response('Not found', { status: 404, headers: CORS_HEADERS });
        }
        try {
          const code = await readFile(filePath);
          return new Response(code, {
            headers: {
              'Content-Type': 'text/javascript; charset=utf-8',
              'Cache-Control': 'public, max-age=31536000, immutable',
              ...CORS_HEADERS,
            },
          });
        } catch {
          return new Response('Not found', { status: 404, headers: CORS_HEADERS });
        }
      },
    },
  },
});
