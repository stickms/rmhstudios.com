'use client';

import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { useEffect, useState, useCallback, useRef } from 'react';

interface FloatLabel {
  id: number;
  text: string;
  x: number;
  y: number;
}

const RITUAL_MAX_COOLDOWN = 30; // seconds

export default function SmileButton() {
  const numberFormat   = useTempleStore(s => s.numberFormat);
  const ritualCooldown = useTempleStore(s => s.ritualCooldown);
  const activeBuffs    = useTempleStore(s => s.activeBuffs);
  const vibeBuff       = useTempleStore(s => s.vibeBuff);
  const pilgrimageActive = useTempleStore(s => s.pilgrimageActive);
  const click          = useTempleStore(s => s.click);
  const getHPS         = useTempleStore(s => s.getHPS);
  const getHPC         = useTempleStore(s => s.getHPC);
  const recentClickTimes = useTempleStore(s => s.recentClickTimes);

  const [floats, setFloats] = useState<FloatLabel[]>([]);
  const [pressing, setPressing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const counter = useRef(0);

  const hpc = getHPC();

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    click();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = ++counter.current;
    setFloats(prev => [...prev, { id, text: `+${fmt(hpc, numberFormat)}`, x, y }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 1000);
  }, [click, hpc, numberFormat]);

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

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      {/* Button wrapper with glow — fixed 200×200 so the ritual SVG ring is concentric */}
      <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
        {/* Glow ring for active buffs */}
        {hasGlow && (
          <div
            className="absolute inset-0 rounded-full animate-pulse pointer-events-none"
            style={{
              boxShadow: '0 0 28px 10px var(--temple-accent)',
              borderRadius: '50%',
            }}
          />
        )}

        {/* Ritual cooldown ring */}
        {onCooldown && (
          <svg
            className="absolute inset-0 pointer-events-none"
            width="200"
            height="200"
            viewBox="0 0 200 200"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle
              cx="100"
              cy="100"
              r="92"
              fill="none"
              stroke="var(--temple-border)"
              strokeWidth="6"
              opacity="0.3"
            />
            <circle
              cx="100"
              cy="100"
              r="92"
              fill="none"
              stroke="var(--temple-accent)"
              strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 92}`}
              strokeDashoffset={`${2 * Math.PI * 92 * (1 - cooldownFraction)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.25s linear' }}
            />
          </svg>
        )}

        {/* Main button */}
        <button
          onMouseDown={() => setPressing(true)}
          onMouseUp={() => setPressing(false)}
          onClick={handleClick}
          aria-label="Spread joy"
          className="relative flex items-center justify-center rounded-full transition-all duration-150 cursor-pointer"
          style={{
            width: 180,
            height: 180,
            background: 'var(--temple-surface)',
            border: '3px solid var(--temple-border)',
            boxShadow: pressing
              ? '0 2px 8px rgba(0,0,0,0.3)'
              : '0 4px 24px rgba(139,105,20,0.35), 0 0 0 0 transparent',
            transform: pressing ? 'scale(0.95)' : 'scale(1)',
            color: 'var(--temple-text)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              '0 6px 36px rgba(139,105,20,0.6), 0 0 16px rgba(212,168,71,0.35)';
          }}
          onMouseLeave={e => {
            setPressing(false);
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              '0 4px 24px rgba(139,105,20,0.35)';
          }}
        >
          {onCooldown ? (
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

      {/* Pilgrimage indicator */}
      {pilgrimageActive && (
        <p
          className="text-xs italic"
          style={{ color: 'var(--temple-accent)' }}
        >
          🚶 Pilgrimage in progress...
        </p>
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
