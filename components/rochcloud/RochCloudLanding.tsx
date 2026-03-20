'use client';

import { Cloud, Headphones, Music, List } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { getAuthUrl } from '@/lib/rochcloud/api';

export default function RochCloudLanding() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#0a0a0a] to-[#111] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="text-sm text-white/40 hover:text-white/60 transition-colors">
          &larr; rmhstudios
        </Link>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 p-4 shadow-lg shadow-orange-500/20">
            <Cloud className="h-10 w-10 text-white" />
          </div>
        </div>

        <h1 className="mb-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Roch<span className="text-orange-500">Cloud</span>
        </h1>

        <p className="mb-10 max-w-md text-lg text-white/50">
          Stream your SoundCloud library. Browse playlists, liked tracks, and discover new music.
        </p>

        {/* Features */}
        <div className="mb-12 grid max-w-lg grid-cols-3 gap-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl bg-white/5 p-3">
              <Headphones className="h-5 w-5 text-orange-400" />
            </div>
            <span className="text-xs text-white/40">Stream</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl bg-white/5 p-3">
              <Music className="h-5 w-5 text-orange-400" />
            </div>
            <span className="text-xs text-white/40">Liked Tracks</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl bg-white/5 p-3">
              <List className="h-5 w-5 text-orange-400" />
            </div>
            <span className="text-xs text-white/40">Playlists</span>
          </div>
        </div>

        {/* Connect Button */}
        <a
          href={getAuthUrl()}
          className="group flex items-center gap-3 rounded-full bg-orange-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-orange-500/25 transition-all hover:bg-orange-400 hover:shadow-orange-500/40 active:scale-[0.98]"
        >
          <Cloud className="h-5 w-5" />
          Connect with SoundCloud
        </a>

        <p className="mt-4 text-xs text-white/30">
          Sign in with your SoundCloud account to get started
        </p>
      </main>
    </div>
  );
}
