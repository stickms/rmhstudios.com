"use client";
import { useCookgameStore } from '@/lib/cookgame/store';
import { HEAT_PENALTY_THRESHOLD, MAX_HEAT } from '@/lib/cookgame/economy';
import { rankForXp, xpToNextRank, RANKS } from '@/lib/cookgame/progression';
import { DISTRICTS } from '@/lib/cookgame/districts';
import { phaseOfDay, dayFraction } from '@/lib/cookgame/timeOfDay';

export function HUD() {
  const cash = useCookgameStore((s) => s.cash);
  const heat = useCookgameStore((s) => s.heat);
  const packaged = useCookgameStore((s) => s.inventory.packaged);
  const xp = useCookgameStore((s) => s.xp);
  const setActiveOverlay = useCookgameStore((s) => s.setActiveOverlay);
  const currentDistrict = useCookgameStore((s) => s.currentDistrict);
  // Quantize to whole-second granularity (HH:MM display and phase don't need
  // sub-second precision). Matches the quantization in Lighting.tsx so this
  // component re-renders at ~1 Hz instead of every frame.
  const clockSec = useCookgameStore((s) => Math.floor(s.clock / 1000));
  const clock = clockSec * 1000;

  const phase = phaseOfDay(clock);
  const minutesOfDay = Math.floor(dayFraction(clock) * 24 * 60);
  const hh = String(Math.floor(minutesOfDay / 60)).padStart(2, '0');
  const mm = String(minutesOfDay % 60).padStart(2, '0');

  const totalUnits = packaged.reduce((sum, stack) => sum + stack.units, 0);
  const heatPct = Math.min(100, (heat / MAX_HEAT) * 100);
  const hot = heat >= HEAT_PENALTY_THRESHOLD;

  const rank = rankForXp(xp);
  const toNext = xpToNextRank(xp);
  const isMaxRank = toNext === 0;
  const nextRank = RANKS[rank.rank + 1];
  const xpBarPct = isMaxRank
    ? 100
    : Math.min(100, ((xp - rank.xpThreshold) / (nextRank.xpThreshold - rank.xpThreshold)) * 100);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none text-white">
      {/* Top-left: cash + rank */}
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <div className="rounded-md border border-neutral-700 bg-neutral-900/80 px-3 py-2">
          <div className="font-mono text-2xl font-bold text-lime-400">${cash}</div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">
            {totalUnits} unit{totalUnits === 1 ? '' : 's'} packaged
          </div>
        </div>
        {/* Rank + XP progress */}
        <div className="rounded-md border border-neutral-700 bg-neutral-900/80 px-3 py-2">
          <div className="mb-1 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-neutral-400">
            <span>Rank</span>
            <span className="text-lime-400">{rank.name}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
            <div
              className="h-full rounded-full bg-lime-400 transition-all"
              style={{ width: `${xpBarPct}%` }}
            />
          </div>
          {!isMaxRank && (
            <div className="mt-0.5 font-mono text-[10px] text-neutral-500">
              {toNext} xp to {nextRank.name}
            </div>
          )}
        </div>
        {/* Current district readout */}
        {DISTRICTS[currentDistrict] && (
          <div className="rounded-md border border-neutral-700 bg-neutral-900/80 px-3 py-2">
            <div className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">District</div>
            <div className="font-mono text-sm text-lime-300">{DISTRICTS[currentDistrict].name}</div>
          </div>
        )}
        {/* Time of day */}
        <div className="rounded-md border border-neutral-700 bg-neutral-900/80 px-3 py-2">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-neutral-400">
            <span>Time</span>
            <span className="capitalize text-lime-300">{phase}</span>
          </div>
          <div className="font-mono text-sm text-neutral-200">{hh}:{mm}</div>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            onClick={() => setActiveOverlay('journal')}
            className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 font-mono text-xs text-neutral-200 hover:bg-neutral-700"
          >
            Journal (J)
          </button>
          <button
            onClick={() => setActiveOverlay('menu')}
            className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 font-mono text-xs text-neutral-200 hover:bg-neutral-700"
          >
            Menu (M)
          </button>
          <button
            onClick={() => setActiveOverlay('map')}
            className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 font-mono text-xs text-neutral-200 hover:bg-neutral-700"
          >
            Map (N)
          </button>
        </div>
      </div>

      {/* Top-right: heat meter */}
      <div className="absolute right-4 top-4 w-44 rounded-md border border-neutral-700 bg-neutral-900/80 px-3 py-2">
        <div className="mb-1 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-neutral-400">
          <span>Heat</span>
          <span className={hot ? 'text-red-400' : 'text-neutral-300'}>{Math.round(heat)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-700">
          <div
            className={`h-full rounded-full transition-all ${hot ? 'bg-red-500' : 'bg-lime-400'}`}
            style={{ width: `${heatPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
