'use client';

import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';
import { TouhouFrame, TouhouMenuButton, TouhouDivider } from './TouhouFrame';

export function DreamRiftTitle() {
  const setScreen = useDreamRiftStore((s) => s.setScreen);

  return (
    <div
      className="absolute inset-0 z-30 overflow-hidden"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      {/* Atmospheric background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0818] via-[#0d0b2a] to-[#08061a]" />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${1 + Math.random() * 2}px`,
              height: `${1 + Math.random() * 2}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              backgroundColor: i % 3 === 0 ? '#d4a44a' : i % 3 === 1 ? '#8b5cf6' : '#e2d0ff',
              opacity: 0.2 + Math.random() * 0.4,
              animation: `dreamrift-float ${6 + Math.random() * 8}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 6}s`,
            }}
          />
        ))}
      </div>

      {/* Radial glow behind title */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '15%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '300px',
          height: '200px',
          background: 'radial-gradient(ellipse, rgba(139,92,246,0.15) 0%, transparent 70%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        {/* Title block */}
        <div className="text-center mb-8">
          {/* Decorative line above */}
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-16 h-px bg-gradient-to-r from-transparent to-amber-400/50" />
            <div className="w-1 h-1 rotate-45 bg-amber-400/60" />
            <div className="w-16 h-px bg-gradient-to-l from-transparent to-amber-400/50" />
          </div>

          <h1
            className="text-[42px] font-bold tracking-[0.2em] text-transparent bg-clip-text"
            style={{
              fontFamily: "'Georgia', 'Palatino Linotype', 'Times New Roman', serif",
              backgroundImage: 'linear-gradient(180deg, #f5e6c8 0%, #d4a44a 50%, #a87830 100%)',
              textShadow: '0 0 30px rgba(212,164,74,0.4), 0 0 60px rgba(139,92,246,0.2)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 12px rgba(212,164,74,0.3))',
            }}
          >
            DREAM RIFT
          </h1>

          <p
            className="text-[11px] tracking-[0.35em] text-violet-300/60 mt-1"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            ~ A Bullet Hell Story ~
          </p>

          {/* Decorative line below */}
          <div className="flex items-center justify-center gap-3 mt-3">
            <div className="w-16 h-px bg-gradient-to-r from-transparent to-amber-400/30" />
            <div className="w-1 h-1 rotate-45 bg-amber-400/40" />
            <div className="w-16 h-px bg-gradient-to-l from-transparent to-amber-400/30" />
          </div>
        </div>

        {/* Menu */}
        <TouhouFrame className="w-52">
          <div className="py-2 px-1">
            <TouhouMenuButton variant="accent" onClick={() => setScreen('charSelect')}>
              Start Game
            </TouhouMenuButton>
            <TouhouMenuButton disabled onClick={() => {}}>
              Practice
            </TouhouMenuButton>
            <TouhouMenuButton disabled onClick={() => {}}>
              Options
            </TouhouMenuButton>
            <TouhouMenuButton onClick={() => setScreen('leaderboard')}>
              Leaderboard
            </TouhouMenuButton>
          </div>
        </TouhouFrame>

        {/* Controls */}
        <div className="mt-6 text-center">
          <TouhouDivider />
          <div
            className="text-[9px] text-zinc-600 tracking-wider leading-relaxed"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            <p>Arrow keys — Move &nbsp; Z — Shoot &nbsp; X — Melee</p>
            <p>C — Bomb &nbsp; A — Dash &nbsp; Shift — Focus</p>
          </div>
        </div>
      </div>

      {/* Keyframe animation defined in globals.css */}
    </div>
  );
}
