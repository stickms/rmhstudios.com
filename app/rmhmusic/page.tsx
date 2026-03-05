'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Music, Plus, ArrowRight, Headphones } from 'lucide-react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { connectToRmhMusic, emit } from '@/lib/rmhmusic/socket';
import { C2S, S2C } from '@/lib/rmhmusic/events';
import SpotifyConnect from '@/components/rmhmusic/SpotifyConnect';
import RoomBrowser from '@/components/rmhmusic/RoomBrowser';
import Visualizer from '@/components/rmhmusic/Visualizer';

export default function RmhMusicPage() {
  const router = useRouter();
  const { spotify, connectionStatus } = useRmhMusicStore();
  const [joinCode, setJoinCode] = useState('');
  const [roomName, setRoomName] = useState('');

  // Connect socket on mount
  useEffect(() => {
    connectToRmhMusic().catch(() => {});
  }, []);

  // Listen for room creation
  useEffect(() => {
    const store = useRmhMusicStore.getState();
    const unsub = useRmhMusicStore.subscribe((state) => {
      if (state.room) {
        router.push(`/rmhmusic/${state.room.roomId}`);
      }
    });
    return unsub;
  }, [router]);

  function createRoom() {
    emit(C2S.ROOM_CREATE, { name: roomName || undefined });
  }

  function joinRoom() {
    if (!joinCode.trim()) return;
    emit(C2S.ROOM_JOIN, { code: joinCode.trim() });
  }

  return (
    <div className="relative min-h-screen">
      <Visualizer />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-16">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 rounded-2xl" style={{ background: 'color-mix(in srgb, var(--site-accent) 20%, transparent)' }}>
              <Headphones className="w-8 h-8" style={{ color: 'var(--site-accent)' }} />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-3" style={{ color: 'var(--site-text)', fontFamily: 'var(--site-font-display)' }}>
            RMH Music
          </h1>
          <p className="text-lg" style={{ color: 'var(--site-text-muted)' }}>
            Listen to Spotify with friends. Vibe together.
          </p>
        </motion.div>

        {/* Connect Spotify */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex justify-center mb-8"
        >
          <SpotifyConnect />
          {spotify.isConnected && (
            <button
              onClick={() => router.push('/rmhmusic/player')}
              className="ml-3 flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105"
              style={{ background: 'var(--site-accent)', color: '#fff' }}
            >
              <Music className="w-4 h-4" /> Open Player
            </button>
          )}
        </motion.div>

        {/* Create / Join Room */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8"
        >
          {/* Create */}
          <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--site-surface) 80%, transparent)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--site-text)' }}>Create a Room</h3>
            <input
              type="text"
              placeholder="Room name (optional)"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm mb-3 outline-none"
              style={{ background: 'var(--site-bg)', color: 'var(--site-text)' }}
              maxLength={64}
            />
            <button
              onClick={createRoom}
              disabled={connectionStatus !== 'connected'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
              style={{ background: 'var(--site-accent)', color: '#fff' }}
            >
              <Plus className="w-4 h-4" /> Create Room
            </button>
          </div>

          {/* Join */}
          <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--site-surface) 80%, transparent)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--site-text)' }}>Join a Room</h3>
            <input
              type="text"
              placeholder="Enter room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 rounded-lg text-sm mb-3 outline-none font-mono tracking-widest text-center"
              style={{ background: 'var(--site-bg)', color: 'var(--site-text)' }}
              maxLength={6}
            />
            <button
              onClick={joinRoom}
              disabled={!joinCode.trim() || connectionStatus !== 'connected'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
              style={{ background: 'var(--site-surface)', color: 'var(--site-text)' }}
            >
              <ArrowRight className="w-4 h-4" /> Join Room
            </button>
          </div>
        </motion.div>

        {/* Room Browser */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <RoomBrowser />
        </motion.div>
      </div>
    </div>
  );
}
