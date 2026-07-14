import { createFileRoute } from '@tanstack/react-router';

/**
 * /.well-known/assetlinks.json — Android App Links (Digital Asset Links).
 *
 * Enables verified "open in app" for an Android app once one exists. The
 * package name and signing-cert SHA-256 fingerprint(s) come from the
 * ANDROID_PACKAGE_NAME and ANDROID_SHA256_FINGERPRINTS (comma-separated) env
 * vars. Until both are configured we return 404 rather than an empty/broken
 * statement list.
 */
export const Route = createFileRoute('/.well-known/assetlinks.json')({
  server: {
    handlers: {
      GET: async () => {
        const pkg = process.env.ANDROID_PACKAGE_NAME?.trim();
        const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS ?? '')
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean);

        if (!pkg || fingerprints.length === 0) {
          return new Response('Not found', { status: 404 });
        }

        const body = [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: pkg,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ];

        return new Response(JSON.stringify(body), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      },
    },
  },
});
