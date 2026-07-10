import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Music, Plus, ArrowRight, Headphones, Brain } from 'lucide-react';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { connectToRmhMusic, emit } from '@/lib/rmhmusic/socket';
import { C2S, S2C } from '@/lib/rmhmusic/events';
import RoomBrowser from '@/components/rmhmusic/RoomBrowser';
import Visualizer from '@/components/rmhmusic/Visualizer';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";

export default function RmhMusicPage() {
  const router = useRouter();
  const { t } = useTranslation("c-rmhmusic");
  const { connectionStatus } = useRmhMusicStore();
  const [joinCode, setJoinCode] = useState('');
  const [roomName, setRoomName] = useState('');

  // Connect socket on mount
  useEffect(() => {
    connectToRmhMusic().catch(() => {});
  }, []);

  // Listen for room creation
  useEffect(() => {
    const unsub = useRmhMusicStore.subscribe((state) => {
      if (state.room) {
        router.navigate({ to: `/rmhmusic/${state.room.roomId}` });
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
            {t("hero-subtitle", { defaultValue: "Listen to Spotify previews with friends. Vibe together." })}
          </p>
        </motion.div>

        {/* Open Player */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap justify-center gap-3 mb-8"
        >
          <button
            onClick={() => router.navigate({ to: '/rmhmusic/player' })}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105"
            style={{ background: 'var(--site-accent)', color: '#fff' }}
          >
            <Music className="w-4 h-4" /> {t("open-player", { defaultValue: "Open Player" })}
          </button>
          <button
            onClick={() => router.navigate({ to: '/music-trivia' })}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105"
            style={{ background: 'var(--site-surface)', color: 'var(--site-text)' }}
          >
            <Brain className="w-4 h-4" /> {t("guess-the-song", { defaultValue: "Guess the Song" })}
          </button>
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
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--site-text)' }}>{t("create-a-room", { defaultValue: "Create a Room" })}</h3>
            <input
              type="text"
              placeholder={t("room-name-placeholder", { defaultValue: "Room name (optional)" })}
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
              <Plus className="w-4 h-4" /> {t("create-room", { defaultValue: "Create Room" })}
            </button>
          </div>

          {/* Join */}
          <div className="p-4 rounded-xl" style={{ background: 'color-mix(in srgb, var(--site-surface) 80%, transparent)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--site-text)' }}>{t("join-a-room", { defaultValue: "Join a Room" })}</h3>
            <input
              type="text"
              placeholder={t("enter-room-code", { defaultValue: "Enter room code" })}
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
              <ArrowRight className="w-4 h-4" /> {t("join-room", { defaultValue: "Join Room" })}
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
