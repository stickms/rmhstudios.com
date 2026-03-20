import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/rochcloud/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get('code');

        if (!code) {
          return Response.json({ error: 'Missing authorization code' }, { status: 400 });
        }

        const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
        const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET;
        const redirectUri = process.env.SOUNDCLOUD_REDIRECT_URI || 'https://rmhstudios.com/rochcloud/callback';

        if (!clientId || !clientSecret) {
          return Response.json({ error: 'SoundCloud not configured' }, { status: 500 });
        }

        try {
          const tokenRes = await fetch('https://api.soundcloud.com/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              code,
            }),
          });

          if (!tokenRes.ok) {
            const errText = await tokenRes.text().catch(() => '');
            console.error('SoundCloud token exchange failed:', tokenRes.status, errText);
            return Response.json({ error: 'Token exchange failed' }, { status: 502 });
          }

          const data = await tokenRes.json();
          return Response.json({
            accessToken: data.access_token,
            expiresIn: data.expires_in,
            refreshToken: data.refresh_token,
          });
        } catch (error) {
          console.error('SoundCloud callback error:', error);
          return Response.json({ error: 'Internal error' }, { status: 500 });
        }
      },
    },
  },
});
