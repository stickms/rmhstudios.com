import { createFileRoute } from '@tanstack/react-router';

/**
 * /.well-known/apple-app-site-association — Apple Universal Links association.
 *
 * Enables "open in app" / link continuity for an iOS app once one exists. The
 * app's identifier is provided via the IOS_APP_ID env var (format
 * `TEAMID.bundle.id`). Until that is configured we return 404 rather than a
 * broken association file, so links keep opening on the web.
 */
export const Route = createFileRoute('/.well-known/apple-app-site-association')({
  server: {
    handlers: {
      GET: async () => {
        const appId = process.env.IOS_APP_ID?.trim();
        if (!appId) {
          return new Response('Not found', { status: 404 });
        }

        const body = {
          applinks: {
            apps: [],
            details: [
              {
                appID: appId,
                // Deep-linkable surfaces: profiles and posts.
                paths: ['/u/*', '/blog/*', '/news/*'],
              },
            ],
          },
        };

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
