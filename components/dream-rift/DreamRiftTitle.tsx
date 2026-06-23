'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';
import { TouhouFrame, TouhouMenuButton, TouhouDivider } from './TouhouFrame';

/** Pre-computed particle data to avoid Math.random() during render (hydration mismatch). */
function generateParticles() {
  return Array.from({ length: 20 }, (_, i) => ({
    w: 1 + Math.random() * 2,
    h: 1 + Math.random() * 2,
    x: Math.random() * 100,
    y: Math.random() * 100,
    color: i % 3 === 0 ? '#d4a44a' : i % 3 === 1 ? '#8b5cf6' : '#e2d0ff',
    opacity: 0.2 + Math.random() * 0.4,
    duration: 6 + Math.random() * 8,
    delay: Math.random() * 6,
  }));
}

export function DreamRiftTitle() {
  const { t } = useTranslation("c-dream-rift");
  const setScreen = useDreamRiftStore((s) => s.setScreen);
  const [particles, setParticles] = useState<ReturnType<typeof generateParticles> | null>(null);

  // Generate particles client-side only to avoid hydration mismatch
  useEffect(() => {
    setParticles(generateParticles());
  }, []);

  return (
    <div
      className="absolute inset-0 z-30 overflow-hidden"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      {/* Atmospheric background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0818] via-[#0d0b2a] to-[#08061a]" />

      {/* Floating particles (client-only to avoid hydration mismatch) */}
      {particles && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {particles.map((p, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${p.w}px`,
                height: `${p.h}px`,
                left: `${p.x}%`,
                top: `${p.y}%`,
                backgroundColor: p.color,
                opacity: p.opacity,
                animation: `dreamrift-float ${p.duration}s ease-in-out infinite`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
        </div>
      )}

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
            {t("subtitle", { defaultValue: "~ A Bullet Hell Story ~" })}
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
              {t("start-game", { defaultValue: "Start Game" })}
            </TouhouMenuButton>
            <TouhouMenuButton disabled onClick={() => {}}>
              {t("practice", { defaultValue: "Practice" })}
            </TouhouMenuButton>
            <TouhouMenuButton disabled onClick={() => {}}>
              {t("options", { defaultValue: "Options" })}
            </TouhouMenuButton>
            <TouhouMenuButton onClick={() => setScreen('leaderboard')}>
              {t("leaderboard", { defaultValue: "Leaderboard" })}
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
            <p>{t("controls-move", { defaultValue: "Arrow keys — Move   Z — Shoot   X — Melee" })}</p>
            <p>{t("controls-action", { defaultValue: "C — Bomb   A — Dash   Shift — Focus" })}</p>
          </div>
        </div>
      </div>

      {/* Keyframe animation defined in globals.css */}
    </div>
  );
}
