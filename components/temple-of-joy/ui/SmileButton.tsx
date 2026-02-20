'use client';

import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { useEffect, useState, useCallback, useRef } from 'react';

interface FloatLabel {
  id: number;
  text: string;
  x: number;
  y: number;
}

const RITUAL_MAX_COOLDOWN = 30; // seconds

export default function SmileButton() {
  const numberFormat = useTempleStore(s => s.numberFormat);
  const ritualCooldown = useTempleStore(s => s.ritualCooldown);
  const activeBuffs = useTempleStore(s => s.activeBuffs);
  const vibeBuff = useTempleStore(s => s.vibeBuff);
  const pilgrimageActive = useTempleStore(s => s.pilgrimageActive);
  const pilgrimageTimer = useTempleStore(s => s.pilgrimageTimer);
  const click = useTempleStore(s => s.click);
  const getHPS = useTempleStore(s => s.getHPS);
  const getHPC = useTempleStore(s => s.getHPC);
  const recentClickTimes = useTempleStore(s => s.recentClickTimes);
  const triggerPilgrimage = useTempleStore(s => s.triggerPilgrimage);
  const pilgrimageCooldown = useTempleStore(s => s.pilgrimageCooldown);
  const nappingCat = useTempleStore(s => s.activeRelics.includes('nappingCat'));

  const [floats, setFloats] = useState<FloatLabel[]>([]);
  const [pressing, setPressing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const counter = useRef(0);

  const hpc = getHPC();
  const pilgrimageDuration = nappingCat ? 60 : 120;
  const pilgrimageProgress = pilgrimageActive
    ? Math.min(1, Math.max(0, 1 - pilgrimageTimer / pilgrimageDuration))
    : 0;

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (pilgrimageActive) return; // no clicking during pilgrimage
    click();
    templeAudio.playClick();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = ++counter.current;
    setFloats(prev => [...prev, { id, text: `+${fmt(hpc, numberFormat)}`, x, y }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 1000);
  }, [click, hpc, numberFormat, pilgrimageActive]);

  const clickWindowMs = 500;
  const recentClickCount = recentClickTimes.filter((t) => nowMs - t <= clickWindowMs).length;
  const clicksPerSecond = recentClickCount / (clickWindowMs / 1000);
  const passiveHps = getHPS();
  const activeHps = passiveHps + clicksPerSecond * hpc;

  const hasGlow = activeBuffs.length > 0 || vibeBuff !== null;
  const onCooldown = ritualCooldown > 0;
  const cooldownFraction = onCooldown
    ? Math.max(0, Math.min(1, ritualCooldown / RITUAL_MAX_COOLDOWN))
    : 0;

  // Ring constants
  const ringRadius = 92;
  const circumference = 2 * Math.PI * ringRadius;

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      {/* Button wrapper — fixed 200×200 so the SVG rings are concentric */}
      <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
        {/* Glow ring for active buffs (hidden during pilgrimage) */}
        {hasGlow && !pilgrimageActive && (
          <div
            className="absolute inset-0 rounded-full animate-pulse pointer-events-none"
            style={{
              boxShadow: '0 0 28px 10px var(--temple-accent)',
              borderRadius: '50%',
            }}
          />
        )}

        {/* Ritual cooldown ring (only when NOT on pilgrimage) */}
        {onCooldown && !pilgrimageActive && (
          <svg
            className="absolute inset-0 pointer-events-none"
            width="200"
            height="200"
            viewBox="0 0 200 200"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle cx="100" cy="100" r={ringRadius} fill="none" stroke="var(--temple-border)" strokeWidth="6" opacity="0.3" />
            <circle cx="100" cy="100" r={ringRadius} fill="none" stroke="var(--temple-accent)" strokeWidth="6"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={`${circumference * (1 - cooldownFraction)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.25s linear' }}
            />
          </svg>
        )}

        {/* Pilgrimage progress ring */}
        {pilgrimageActive && (
          <svg
            className="absolute inset-0 pointer-events-none"
            width="200"
            height="200"
            viewBox="0 0 200 200"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle cx="100" cy="100" r={ringRadius} fill="none" stroke="var(--temple-border)" strokeWidth="6" opacity="0.3" />
            <circle cx="100" cy="100" r={ringRadius} fill="none" stroke="#b08d57" strokeWidth="6"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={`${circumference * (1 - pilgrimageProgress)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.5s linear' }}
            />
          </svg>
        )}

        {/* Main button */}
        <button
          onMouseDown={() => { if (!pilgrimageActive) setPressing(true); }}
          onMouseUp={() => setPressing(false)}
          onClick={handleClick}
          aria-label={pilgrimageActive ? 'Pilgrimage in progress' : 'Spread joy'}
          disabled={pilgrimageActive}
          className="relative flex items-center justify-center rounded-full transition-all duration-150"
          style={{
            width: 180,
            height: 180,
            background: pilgrimageActive ? 'var(--temple-border)' : 'var(--temple-surface)',
            border: '3px solid var(--temple-border)',
            boxShadow: pilgrimageActive
              ? 'none'
              : pressing
                ? '0 2px 8px rgba(0,0,0,0.3)'
                : '0 4px 24px rgba(139,105,20,0.35), 0 0 0 0 transparent',
            transform: pressing && !pilgrimageActive ? 'scale(0.95)' : 'scale(1)',
            color: 'var(--temple-text)',
            opacity: pilgrimageActive ? 0.6 : 1,
            cursor: pilgrimageActive ? 'not-allowed' : 'pointer',
            filter: pilgrimageActive ? 'grayscale(0.7)' : 'none',
          }}
          onMouseEnter={e => {
            if (!pilgrimageActive) {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                '0 6px 36px rgba(139,105,20,0.6), 0 0 16px rgba(212,168,71,0.35)';
            }
          }}
          onMouseLeave={e => {
            setPressing(false);
            if (!pilgrimageActive) {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                '0 4px 24px rgba(139,105,20,0.35)';
            }
          }}
        >
          {pilgrimageActive ? (
            <div className="flex flex-col items-center gap-1">
              <span
                className="text-5xl"
                style={{
                  display: 'inline-block',
                  animation: 'templeCandle 2.4s ease-in-out infinite',
                }}
              >
                🕯️
              </span>
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: 'var(--temple-accent)', opacity: 0.8 }}
              >
                PILGRIMAGE
              </span>
              <span
                className="text-xs tabular-nums"
                style={{ color: 'var(--temple-text)', opacity: 0.7 }}
              >
                {Math.ceil(pilgrimageTimer)}s
              </span>
            </div>
          ) : onCooldown ? (
            <div className="flex flex-col items-center gap-1">
              <span className="text-5xl">✨</span>
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: 'var(--temple-accent)' }}
              >
                RITUAL!
              </span>
              <span
                className="text-xs tabular-nums"
                style={{ color: 'var(--temple-text)', opacity: 0.7 }}
              >
                {Math.ceil(ritualCooldown)}s
              </span>
            </div>
          ) : (
            <span className="text-6xl">😊</span>
          )}

          {/* Floating +HPC labels */}
          {floats.map(f => (
            <span
              key={f.id}
              className="pointer-events-none absolute font-bold text-sm animate-float-up"
              style={{
                left: f.x,
                top: f.y,
                color: 'var(--temple-accent)',
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                animation: 'templeFloatUp 1s ease-out forwards',
              }}
            >
              {f.text}
            </span>
          ))}
        </button>
      </div>

      {/* HPS display */}
      <p
        className="text-sm font-medium tabular-nums"
        style={{ color: 'var(--temple-text)', opacity: 0.8 }}
      >
        {fmt(activeHps, numberFormat)}{' '}
        <span style={{ opacity: 0.65 }}>happiness/sec</span>
      </p>

      {/* Pilgrimage button (hidden during active pilgrimage) */}
      {!pilgrimageActive && (
        <button
          onClick={triggerPilgrimage}
          disabled={pilgrimageCooldown > 0}
          className="mt-2 px-4 py-2 rounded-full text-xs font-bold uppercase transition-all"
          style={{
            background: pilgrimageCooldown > 0 ? 'var(--temple-border)' : 'var(--temple-accent)',
            color: pilgrimageCooldown > 0 ? 'var(--temple-text)' : '#fff',
            opacity: pilgrimageCooldown > 0 ? 0.5 : 1,
            cursor: pilgrimageCooldown > 0 ? 'not-allowed' : 'pointer',
            border: '1px solid var(--temple-border)',
          }}
        >
          {pilgrimageCooldown > 0
            ? `Pilgrimage Cooldown (${Math.ceil(pilgrimageCooldown)}s)`
            : '🕯️ Make Pilgrimage'}
        </button>
      )}

      <style>{`
        @keyframes templeFloatUp {
          0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-60px); }
        }
      `}</style>
    </div>
  );
}
