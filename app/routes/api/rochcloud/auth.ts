import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/rochcloud/auth')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
        const redirectUri = process.env.SOUNDCLOUD_REDIRECT_URI || 'https://rmhstudios.com/rochcloud/callback';

        if (!clientId) {
          return Response.json({ error: 'SoundCloud not configured' }, { status: 500 });
        }

        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'non-expiring',
        });

        const authUrl = `https://soundcloud.com/connect?${params.toString()}`;
        return Response.redirect(authUrl, 302);
      },
    },
  },
});
