import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/rochcloud/stream/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get('token') || request.headers.get('Authorization')?.replace('Bearer ', '');

        if (!token) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = params;
        const clientId = process.env.SOUNDCLOUD_CLIENT_ID;

        try {
          // Try the /tracks/{id}/stream endpoint first
          const streamUrl = `https://api.soundcloud.com/tracks/${id}/stream`;
          const res = await fetch(streamUrl, {
            headers: { Authorization: `OAuth ${token}` },
            redirect: 'manual',
          });

          // SoundCloud returns a 302 redirect to the actual stream URL
          if (res.status === 302 || res.status === 301) {
            const location = res.headers.get('location');
            if (location) {
              return Response.redirect(location, 302);
            }
          }

          // If we get a direct response, pipe it through
          if (res.ok) {
            return new Response(res.body, {
              headers: {
                'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
                'Cache-Control': 'public, max-age=3600',
              },
            });
          }

          return Response.json({ error: 'Stream unavailable' }, { status: 404 });
        } catch (error) {
          console.error('SoundCloud stream error:', error);
          return Response.json({ error: 'Stream failed' }, { status: 500 });
        }
      },
    },
  },
});
