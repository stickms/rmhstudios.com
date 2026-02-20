'use client';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { useEffect, useRef, useState } from 'react';

export default function VibeCheck() {
  const vibeCheckTimer = useTempleStore((s) => s.vibeCheckTimer);
  const vibeBuff = useTempleStore((s) => s.vibeBuff);
  const showEventModal = useTempleStore((s) => s.showEventModal);
  const passVibeCheck = useTempleStore((s) => s.passVibeCheck);
  const theme = useTempleStore((s) => s.theme);

  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [dismissed, setDismissed] = useState(false);

  // Show the card when vibeCheckTimer hits 0 and no existing buff and event modal isn't open
  const shouldShow =
    vibeCheckTimer <= 0 && !vibeBuff && !showEventModal && !dismissed;

  // Track previous shouldShow value to detect transitions
  const prevShouldShow = useRef(false);

  useEffect(() => {
    // Only trigger when shouldShow transitions from false to true
    if (shouldShow && !prevShouldShow.current) {
      setVisible(true);
      setCountdown(10);
      setDismissed(false);
    }
    prevShouldShow.current = shouldShow;
  }, [shouldShow]);

  // Countdown timer
  useEffect(() => {
    if (!visible) return;
    if (countdown <= 0) {
      // Auto-dismiss — missed the check
      setVisible(false);
      setDismissed(true);
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [visible, countdown]);

  const handleVibe = () => {
    passVibeCheck();
    setVisible(false);
    setDismissed(true);
  };

  if (!visible) return null;

  const dark = theme === 'dark';

  return (
    <div
      className="fixed bottom-6 right-6 z-50 animate-slide-up"
      style={{
        animation: 'templeSlideUp 0.4s cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <style>{`
        @keyframes templeSlideUp {
          from { transform: translateY(120%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes templePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(212,168,71,0.5); }
          50%       { box-shadow: 0 0 0 10px rgba(212,168,71,0); }
        }
      `}</style>
      <div
        className="rounded-2xl p-5 w-72 border-2"
        style={{
          background: dark ? '#2c1d12' : '#ede7d9',
          borderColor: dark ? '#6b4c2a' : '#c4a97a',
          color: dark ? '#e8d5b0' : '#3d2c1e',
          animation: 'templePulse 1.6s ease-in-out infinite',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-base tracking-wide">✨ VIBE CHECK</span>
          <span
            className="text-2xl font-mono font-bold tabular-nums"
            style={{ color: dark ? '#d4a847' : '#8b6914' }}
          >
            {countdown}s
          </span>
        </div>
        <p className="text-sm opacity-80 mb-4">
          Your vibes are being evaluated. Pass to earn a happiness boost.
        </p>
        {/* Countdown progress bar */}
        <div
          className="h-1.5 rounded-full mb-4 overflow-hidden"
          style={{ background: dark ? '#1a120b' : '#f5f0e8' }}
        >
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${(countdown / 10) * 100}%`,
              background: dark ? '#d4a847' : '#8b6914',
            }}
          />
        </div>
        <button
          onClick={handleVibe}
          className="w-full rounded-xl py-2 font-semibold text-sm transition-opacity hover:opacity-80 active:opacity-60"
          style={{
            background: dark ? '#d4a847' : '#8b6914',
            color: dark ? '#1a120b' : '#f5f0e8',
          }}
        >
          I&#39;m Vibing 🌊
        </button>
      </div>
    </div>
  );
}
