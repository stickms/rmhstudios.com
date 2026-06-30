import { createFileRoute } from '@tanstack/react-router';
import { buildOpenApiDocument } from '@/lib/api/openapi';
import { CORS_HEADERS } from '@/lib/api/developer-auth.server';

/**
 * GET /api/v1/openapi.json — the machine-readable OpenAPI 3.1 description of the
 * API. Public (no authentication) so clients can codegen SDKs freely.
 */
export const Route = createFileRoute('/api/v1/openapi.json')({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: () =>
        new Response(JSON.stringify(buildOpenApiDocument(), null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS_HEADERS },
        }),
    },
  },
});
