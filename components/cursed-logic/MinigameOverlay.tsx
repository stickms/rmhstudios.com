'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MinigameKind } from '@/lib/cursed-logic/types';

const BAR_MS = 950;
const ZONE_START = 0.41;
const ZONE_END = 0.59;
const HOLD_MS = 1200;
const HOLD_NUDGE_STRENGTH = 0.07;
const HOLD_NUDGES_MAX = 3;
const RAPID_MS = 750;
const RAPID_REVEAL_MS = 180;

type Distort = 'none' | 'reverse' | 'jitter' | 'shrink' | 'hide';

function pickChaosDistort(): Distort {
  const opts: Distort[] = ['reverse', 'jitter', 'shrink', 'hide'];
  return opts[Math.floor(Math.random() * opts.length)] ?? 'reverse';
}

interface MinigameOverlayProps {
  kind: MinigameKind;
  chaosDistort: boolean;
  onComplete: (success: boolean) => void;
}

export function MinigameOverlay({ kind, chaosDistort, onComplete }: MinigameOverlayProps) {
  const distort = chaosDistort ? pickChaosDistort() : 'none';

  if (kind === 'timed_press') {
    return (
      <TimedPressOverlay distort={distort} onComplete={onComplete} />
    );
  }
  if (kind === 'hold_zone') {
    return (
      <HoldZoneOverlay distort={distort} onComplete={onComplete} />
    );
  }
  return (
    <RapidChoiceOverlay onComplete={onComplete} />
  );
}

interface TimedPressProps {
  distort: Distort;
  onComplete: (success: boolean) => void;
}

function TimedPressOverlay({ distort, onComplete }: TimedPressProps) {
  const [position, setPosition] = useState(0);
  const [result, setResult] = useState<'pending' | 'hit' | 'miss' | null>(null);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const positionRef = useRef(0);
  const zoneStart = distort === 'shrink' ? 0.44 : ZONE_START;
  const zoneEnd = distort === 'shrink' ? 0.56 : ZONE_END;
  const reverse = distort === 'reverse';

  const tick = useCallback(() => {
    const t = (Date.now() - startRef.current) / BAR_MS;
    if (t >= 1) {
      setResult('miss');
      return;
    }
    const p = reverse ? 1 - t : t;
    const jitter = distort === 'jitter' ? (Math.random() - 0.5) * 0.1 : 0;
    const next = Math.max(0, Math.min(1, p + jitter));
    positionRef.current = next;
    setPosition(next);
    rafRef.current = requestAnimationFrame(tick);
  }, [distort, reverse]);

  useEffect(() => {
    startRef.current = Date.now();
    if (distort === 'hide') {
      const showAt = 120;
      const id = setTimeout(() => {
        rafRef.current = requestAnimationFrame(tick);
      }, showAt);
      return () => {
        clearTimeout(id);
        cancelAnimationFrame(rafRef.current);
      };
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [distort, tick]);

  const handlePress = useCallback(() => {
    if (result !== null) return;
    const pos = positionRef.current;
    const inZone = pos >= zoneStart && pos <= zoneEnd;
    setResult(inZone ? 'hit' : 'miss');
  }, [result, zoneStart, zoneEnd]);

  useEffect(() => {
    if (result === null) return;
    const id = setTimeout(() => onComplete(result === 'hit'), 400);
    return () => clearTimeout(id);
  }, [result, onComplete]);

  const [indicatorVisible, setIndicatorVisible] = useState(distort !== 'hide');
  useEffect(() => {
    if (distort !== 'hide') return;
    const id = setTimeout(() => setIndicatorVisible(true), 120);
    return () => clearTimeout(id);
  }, [distort]);

  return (
    <div
      className="fixed inset-0 z-60 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm"
      onClick={result === null ? handlePress : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (result === null && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          handlePress();
        }
      }}
      aria-label="Press when the indicator is in the zone"
    >
      <p className="text-cyan-300 text-sm font-mono">Press when in the zone</p>
      <div className="w-full max-w-xs h-10 rounded-lg bg-white/10 border border-cyan-500/40 relative overflow-hidden">
        <div
          className="absolute inset-y-0 rounded bg-cyan-500/40 border border-cyan-400/60"
          style={{
            left: `${zoneStart * 100}%`,
            width: `${(zoneEnd - zoneStart) * 100}%`,
          }}
        />
        {indicatorVisible && (
          <div
            className="absolute top-1 bottom-1 w-1.5 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)]"
            style={{ left: `calc(${position * 100}% - 3px)` }}
          />
        )}
      </div>
      {result === 'hit' && <p className="text-cyan-400 font-mono font-bold">Hit!</p>}
      {result === 'miss' && <p className="text-amber-400/90 font-mono">Miss</p>}
    </div>
  );
}

interface HoldZoneProps {
  distort: Distort;
  onComplete: (success: boolean) => void;
}

function HoldZoneOverlay({ distort, onComplete }: HoldZoneProps) {
  const [progress, setProgress] = useState(0);
  const [position, setPosition] = useState(0.5);
  const [failed, setFailed] = useState(false);
  const [holding, setHolding] = useState(false);
  const [nudgesLeft, setNudgesLeft] = useState(HOLD_NUDGES_MAX);
  const startRef = useRef<number>(0);
  const posRef = useRef(0.5);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zoneMargin = distort === 'shrink' ? 0.32 : 0.26;
  const zoneStart = zoneMargin;
  const zoneEnd = 1 - zoneMargin;
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);
  onCompleteRef.current = onComplete;

  const fail = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setFailed(true);
    setTimeout(() => onCompleteRef.current(false), 300);
  }, []);

  useEffect(() => {
    if (!holding) return;
    completedRef.current = false;
    startRef.current = Date.now();
    posRef.current = 0.5;
    setPosition(0.5);
    setFailed(false);
    setNudgesLeft(HOLD_NUDGES_MAX);
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const p = elapsed / HOLD_MS;
      const drift = (Math.random() - 0.5) * 0.2 * (distort === 'jitter' ? 1.6 : 1);
      posRef.current = Math.max(0, Math.min(1, posRef.current + drift));
      setPosition(posRef.current);
      setProgress(p);

      if (posRef.current < zoneStart || posRef.current > zoneEnd) {
        fail();
        return;
      }
      if (p >= 1) {
        if (completedRef.current) return;
        completedRef.current = true;
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => onCompleteRef.current(true), 300);
      }
    }, 45);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [holding, zoneStart, zoneEnd, fail]);

  const handleNudge = useCallback(() => {
    if (!holding || failed || nudgesLeft <= 0) return;
    const center = 0.5;
    const pull = (center - posRef.current) * HOLD_NUDGE_STRENGTH;
    posRef.current = Math.max(0, Math.min(1, posRef.current + pull));
    setPosition(posRef.current);
    setNudgesLeft((n) => Math.max(0, n - 1));
  }, [holding, failed, nudgesLeft]);

  const handlePointerDown = useCallback(() => setHolding(true), []);
  const handlePointerUp = useCallback(() => {
    if (!holding || progress >= 1 || failed) return;
    setHolding(false);
    fail();
  }, [holding, progress, failed, fail]);

  useEffect(() => {
    const up = () => {
      setHolding((h) => {
        if (h) fail();
        return false;
      });
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [fail]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && holding && !failed) {
        e.preventDefault();
        handleNudge();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [holding, failed, handleNudge]);

  return (
    <div className="fixed inset-0 z-60 flex flex-col items-center justify-center gap-6 bg-black/70 backdrop-blur-sm">
      <p className="text-cyan-300 text-sm font-mono">Hold — Brace to correct drift</p>
      <div className="w-full max-w-xs h-12 rounded-lg bg-white/10 border border-cyan-500/40 relative overflow-hidden">
        <div
          className="absolute inset-y-0 rounded bg-cyan-500/40 border border-cyan-400/60"
          style={{
            left: `${zoneStart * 100}%`,
            width: `${(zoneEnd - zoneStart) * 100}%`,
          }}
        />
        <div
          className="absolute top-1 bottom-1 w-2 rounded-full bg-amber-400 transition-all duration-75"
          style={{ left: `calc(${position * 100}% - 4px)` }}
        />
      </div>
      <div className="flex gap-3 items-center">
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="rounded-xl border-2 border-cyan-500/60 bg-cyan-500/20 px-6 py-3 font-mono font-bold text-cyan-200"
        >
          {holding ? 'Holding…' : 'Hold'}
        </button>
        <button
          type="button"
          onClick={handleNudge}
          disabled={!holding || failed || nudgesLeft <= 0}
          className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 px-4 py-3 font-mono text-amber-200 disabled:opacity-40"
        >
          Brace ({nudgesLeft})
        </button>
      </div>
      <p className="text-white/50 text-xs font-mono">Space or Brace to nudge toward center</p>
      {progress > 0 && progress < 1 && !failed && (
        <div className="w-48 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-cyan-500/80 rounded-full transition-all duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
      {failed && progress < 1 && <p className="text-amber-400/90 font-mono">Lost grip</p>}
    </div>
  );
}

interface RapidChoiceProps {
  onComplete: (success: boolean) => void;
}

function RapidChoiceOverlay({ onComplete }: RapidChoiceProps) {
  const [ready, setReady] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const betterIndexRef = useRef<number>(Math.random() < 0.5 ? 0 : 1);
  const completedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), RAPID_REVEAL_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready || chosen !== null) return;
    const t = setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      setTimedOut(true);
      setTimeout(() => onComplete(false), 350);
    }, RAPID_MS);
    return () => clearTimeout(t);
  }, [ready, chosen, onComplete]);

  const handleChoice = useCallback(
    (index: number) => {
      if (chosen !== null) return;
      completedRef.current = true;
      setChosen(index);
      const success = index === betterIndexRef.current;
      setTimeout(() => onComplete(success), 400);
    },
    [chosen, onComplete]
  );

  return (
    <div className="fixed inset-0 z-60 flex flex-col items-center justify-center gap-6 bg-black/70 backdrop-blur-sm">
      <p className="text-cyan-300 text-sm font-mono">
        {!ready ? '…' : 'Choose quickly'}
      </p>
      {ready && (
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => handleChoice(0)}
            disabled={chosen !== null}
            className="rounded-xl border-2 border-cyan-500/50 bg-cyan-500/10 px-6 py-4 font-mono text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
          >
            Absorb
          </button>
          <button
            type="button"
            onClick={() => handleChoice(1)}
            disabled={chosen !== null}
            className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 px-6 py-4 font-mono text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
          >
            Deflect
          </button>
        </div>
      )}
      {ready && !chosen && !timedOut && (
        <p className="text-white/40 text-xs font-mono">~0.7s</p>
      )}
      {chosen !== null && (
        <p className="text-white/70 font-mono text-sm">
          {chosen === betterIndexRef.current ? 'Recovered' : 'Staggered'}
        </p>
      )}
      {timedOut && <p className="text-amber-400/90 font-mono text-sm">Too slow</p>}
    </div>
  );
}
