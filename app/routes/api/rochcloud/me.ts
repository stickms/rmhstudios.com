import { createFileRoute } from '@tanstack/react-router';

function mapUser(u: any) {
  return {
    id: u.id,
    username: u.username,
    avatarUrl: u.avatar_url,
    fullName: u.full_name || null,
    followersCount: u.followers_count ?? 0,
    followingsCount: u.followings_count ?? 0,
    trackCount: u.track_count ?? 0,
    playlistCount: u.playlist_count ?? 0,
    likesCount: u.likes_count ?? u.public_favorites_count ?? 0,
  };
}

export const Route = createFileRoute('/api/rochcloud/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        try {
          const res = await fetch('https://api.soundcloud.com/me', {
            headers: { Authorization: `OAuth ${token}` },
          });

          if (!res.ok) {
            return Response.json({ error: 'Failed to fetch user' }, { status: res.status });
          }

          const data = await res.json();
          return Response.json(mapUser(data));
        } catch (error) {
          console.error('SoundCloud /me error:', error);
          return Response.json({ error: 'Internal error' }, { status: 500 });
        }
      },
    },
  },
});
