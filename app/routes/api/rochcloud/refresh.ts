import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/rochcloud/refresh')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
        const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET;
        const redirectUri = process.env.SOUNDCLOUD_REDIRECT_URI || 'https://rmhstudios.com/rochcloud/callback';

        if (!clientId || !clientSecret) {
          return Response.json({ error: 'SoundCloud not configured' }, { status: 500 });
        }

        try {
          const body = await request.json();
          const refreshToken = body.refreshToken;

          if (!refreshToken) {
            return Response.json({ error: 'Missing refresh token' }, { status: 400 });
          }

          const tokenRes = await fetch('https://api.soundcloud.com/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              refresh_token: refreshToken,
            }),
          });

          if (!tokenRes.ok) {
            return Response.json({ error: 'Refresh failed' }, { status: 502 });
          }

          const data = await tokenRes.json();
          return Response.json({
            accessToken: data.access_token,
            expiresIn: data.expires_in,
            refreshToken: data.refresh_token,
          });
        } catch (error) {
          console.error('Token refresh error:', error);
          return Response.json({ error: 'Internal error' }, { status: 500 });
        }
      },
    },
  },
});
