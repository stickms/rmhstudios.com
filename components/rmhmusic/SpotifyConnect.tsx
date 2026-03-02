'use client';

import { useState } from 'react';
import { Music } from 'lucide-react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';

export default function SpotifyConnect() {
  const { spotify } = useRmhMusicStore();
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await fetch('/api/rmhmusic/spotify/authorize', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.url) {
        console.error('Spotify authorize failed:', data.error ?? 'No URL returned');
        setLoading(false);
        return;
      }

      // Code verifier is stored server-side in an httpOnly cookie
      window.location.href = data.url;
    } catch (err) {
      console.error('Failed to start Spotify auth:', err);
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    await fetch('/api/rmhmusic/spotify/disconnect', { method: 'DELETE' });
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
