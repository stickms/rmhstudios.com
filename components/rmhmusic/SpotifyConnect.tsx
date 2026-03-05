'use client';

import { useState, useEffect } from 'react';
import { Music } from 'lucide-react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { authClient } from '@/lib/auth-client';

export default function SpotifyConnect() {
  const { spotify } = useRmhMusicStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authClient.listAccounts().then(({ data }) => {
      const hasSpotify = data?.some((a) => a.providerId === 'spotify');
      useRmhMusicStore.getState().setSpotify({ isConnected: !!hasSpotify });
    });
  }, []);

  async function handleConnect() {
    setLoading(true);
    try {
      await authClient.linkSocial({
        provider: 'spotify',
        callbackURL: '/rmhmusic/player',
      });
    } catch (err) {
      console.error('Failed to link Spotify:', err);
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    await authClient.unlinkAccount({ providerId: 'spotify' });
    useRmhMusicStore.getState().setSpotify({ isConnected: false, deviceId: null, isPremium: false });
  }

  if (spotify.isConnected) {
    return (
      <button
        onClick={handleDisconnect}
        className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        style={{ background: 'var(--site-surface)', color: 'var(--site-text-muted)' }}
      >
        Disconnect Spotify
      </button>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105 disabled:opacity-50"
      style={{ background: '#1DB954', color: '#fff' }}
    >
      <Music className="w-5 h-5" />
      {loading ? 'Connecting...' : 'Connect Spotify'}
    </button>
  );
}
