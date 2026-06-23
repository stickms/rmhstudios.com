'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';

interface WheelState {
  segments: number[];
  signedIn: boolean;
  canSpin: boolean;
  today: { reward: number; segment: number } | null;
}

const COLORS = ['#f5a623', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b'];

export function DailyWheel() {
  const { t } = useTranslation('feed');
  const [state, setState] = useState<WheelState | null>(null);
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/wheel', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: WheelState | null) => {
        setState(data);
        if (data?.today) {
          setWon(data.today.reward);
          setAngle(restAngleFor(data.today.segment, data.segments.length));
        }
      })
      .catch(console.error);
  }, []);

  if (!state) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-site-accent" />
      </div>
    );
  }

  const n = state.segments.length;
  const slice = 360 / n;

  // Where the wheel should rest so `segment` sits under the top pointer.
  function restAngleFor(segment: number, count: number): number {
    const sliceDeg = 360 / count;
    // Segment center angle (clockwise from top), negated so it lands at pointer.
    return -(segment * sliceDeg + sliceDeg / 2);
  }

  async function spin() {
    if (spinning || !state?.canSpin) return;
    setSpinning(true);
    setWon(null);
    try {
      const res = await fetch('/api/wheel/spin', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        setSpinning(false);
        return;
      }
      const data: { segment: number; reward: number; newBalance: number } = await res.json();
      // Several full turns, then settle on the winning segment.
      const rest = restAngleFor(data.segment, n);
      const target = 360 * 5 + rest;
      setAngle(target);
      setTimeout(() => {
        setWon(data.reward);
        setSpinning(false);
        setState((s) => (s ? { ...s, canSpin: false, today: { reward: data.reward, segment: data.segment } } : s));
      }, 4200);
    } catch {
      setSpinning(false);
    }
  }

  // Build conic-gradient background for the wheel face.
  const gradient = state.segments
    .map((_, i) => `${COLORS[i % COLORS.length]} ${i * slice}deg ${(i + 1) * slice}deg`)
    .join(', ');

  return (
    <section className="rounded-xl border border-site-border bg-site-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-site-accent" />
        <h2 className="text-sm font-bold text-site-text">{t('daily-wheel', { defaultValue: 'Daily wheel' })}</h2>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="relative h-56 w-56">
          {/* Pointer */}
          <div className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 -translate-y-1 border-x-8 border-t-[14px] border-x-transparent border-t-site-accent" />
          {/* Wheel face */}
          <div
            className="h-56 w-56 rounded-full border-4 border-site-border shadow-inner"
            style={{
              background: `conic-gradient(${gradient})`,
              transform: `rotate(${angle}deg)`,
              transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : undefined,
            }}
          >
            {state.segments.map((reward, i) => {
              const a = i * slice + slice / 2;
              return (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2 flex items-center gap-0.5 text-xs font-bold text-white drop-shadow"
                  style={{
                    transform: `rotate(${a}deg) translate(0, -88px) rotate(${-a - angle}deg)`,
                    transformOrigin: 'center',
                  }}
                >
                  {reward}
                </div>
              );
            })}
          </div>
          {/* Hub */}
          <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-site-border bg-site-bg" />
        </div>

        {won !== null ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-site-text">
            {t('you-won-prefix', { defaultValue: 'You won' })} <CoinIcon className="h-4 w-4" /> {won}{t('you-won-suffix', { defaultValue: ' today!' })}
          </p>
        ) : (
          <Button variant="accent" disabled={!state.canSpin || spinning || !state.signedIn} onClick={spin} className="gap-1.5">
            {spinning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {state.signedIn ? (spinning ? t('spinning', { defaultValue: 'Spinning…' }) : t('spin', { defaultValue: 'Spin' })) : t('sign-in-to-spin', { defaultValue: 'Sign in to spin' })}
          </Button>
        )}
        {!state.canSpin && won === null && state.today && (
          <p className="text-xs text-site-text-dim">{t('come-back-tomorrow', { defaultValue: 'Come back tomorrow for another spin.' })}</p>
        )}
      </div>
    </section>
  );
}
