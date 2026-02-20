'use client';

import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { computeBuildingHPS } from '@/lib/temple-of-joy/engine';
import type { BuildingId } from '@/lib/temple-of-joy/types';
import HedoTreadmillGraph from './HedoTreadmillGraph';

function Row({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-2 py-1.5 border-b last:border-b-0"
      style={{ borderColor: 'var(--temple-border)', opacity: highlight ? 1 : 0.9 }}
    >
      <span
        className="text-xs font-medium shrink-0"
        style={{ color: 'var(--temple-text)', opacity: 0.7 }}
      >
        {label}
      </span>
      <div className="text-right">
        <span
          className="text-xs font-bold tabular-nums temple-number"
          style={{ color: highlight ? 'var(--temple-accent)' : 'var(--temple-text)' }}
        >
          {value}
        </span>
        {sub && (
          <div
            className="text-[10px] leading-tight"
            style={{ color: 'var(--temple-text)', opacity: 0.5 }}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatsPanel() {
  const happiness              = useTempleStore(s => s.happiness);
  const lifetimeHappiness      = useTempleStore(s => s.lifetimeHappiness);
  const karma                  = useTempleStore(s => s.karma);
  const blissShards            = useTempleStore(s => s.blissShards);
  const prestigeCount          = useTempleStore(s => s.prestigeCount);
  const ritualCooldown         = useTempleStore(s => s.ritualCooldown);
  const pilgrimageActive       = useTempleStore(s => s.pilgrimageActive);
  const pilgrimageTimer        = useTempleStore(s => s.pilgrimageTimer);
  const vibeCheckTimer         = useTempleStore(s => s.vibeCheckTimer);
  const numberFormat           = useTempleStore(s => s.numberFormat);

  const getHPS                 = useTempleStore(s => s.getHPS);
  const getHPC                 = useTempleStore(s => s.getHPC);
  const getCanTranscend        = useTempleStore(s => s.getCanTranscend);
  const getEffectiveSatisfaction = useTempleStore(s => s.getEffectiveSatisfaction);
  const getGlobalHPSMultiplier = useTempleStore(s => s.getGlobalHPSMultiplier);

  const setShowTranscendenceModal = useTempleStore(s => s.setShowTranscendenceModal);

  const state = useTempleStore(s => s);
  
  // Calculate base HPS (sum of all building HPS)
  const baseHPS = Object.entries(state.buildings).reduce((sum, [buildingId, owned]) => {
    if (owned === 0) return sum;
    return sum + computeBuildingHPS(buildingId as BuildingId, state);
  }, 0);

  const ritualReady = ritualCooldown <= 0;
  const globalMult = getGlobalHPSMultiplier();
  const totalHps = getHPS();

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-0.5 w-full"
      style={{
        background: 'var(--temple-surface)',
        border: '1px solid var(--temple-border)',
        color: 'var(--temple-text)',
      }}
    >
      <h2
        className="text-xs font-bold uppercase tracking-widest mb-2"
        style={{ color: 'var(--temple-accent)' }}
      >
        Statistics
      </h2>

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-x-4">
        {/* Left column */}
        <div>
          <Row
            label="Happiness"
            value={fmt(happiness, numberFormat)}
          />
          <Row
            label="Satisfaction"
            value={fmt(getEffectiveSatisfaction(), numberFormat)}
            sub="above baseline"
          />
          <Row
            label="Lifetime"
            value={fmt(lifetimeHappiness, numberFormat)}
            sub="total earned"
          />
          <Row
            label="Bliss Shards"
            value={`${blissShards} 💎`}
          />
        </div>

        {/* Right column */}
        <div>
          <Row
            label="Global Mult"
            value={`×${globalMult.toFixed(2)}`}
          />
          <Row
            label="HPS"
            value={fmt(totalHps, numberFormat)}
            sub={`${fmt(baseHPS, numberFormat)} × ${globalMult.toFixed(2)}`}
            highlight={true}
          />
          <Row
            label="HPC"
            value={
              <>
                {fmt(getHPC(), numberFormat)}/click{' '}
                {ritualReady && (
                  <span
                    className="ml-1 text-[10px] font-bold uppercase"
                    style={{ color: 'var(--temple-accent)' }}
                  >
                    ✨ RITUAL READY!
                  </span>
                )}
              </>
            }
          />
          <Row
            label="Karma"
            value={`${karma.toFixed(1)} karma`}
          />
        </div>
      </div>

      {prestigeCount > 0 && (
        <div
          className="mt-2 pt-2 text-xs"
          style={{ borderTop: '1px solid var(--temple-border)', color: 'var(--temple-text)', opacity: 0.7 }}
        >
          Prestige: ×{prestigeCount}
        </div>
      )}

      {/* Transcendence teaser — clickable button */}
      {getCanTranscend() && (
        <button
          onClick={() => setShowTranscendenceModal(true)}
          className="mt-2 w-full rounded-lg px-3 py-2 text-xs font-bold text-center tracking-wide animate-pulse cursor-pointer transition-opacity hover:opacity-90"
          style={{
            background: 'rgba(212,168,71,0.15)',
            border: '1px solid var(--temple-accent)',
            color: 'var(--temple-accent)',
          }}
        >
          ⚡ Transcendence Available — click to ascend
        </button>
      )}

      {/* Pilgrimage row */}
      {pilgrimageActive && (
        <div
          className="mt-1.5 text-xs text-center italic"
          style={{ color: 'var(--temple-text)', opacity: 0.75 }}
        >
          🚶 Pilgrimage: {Math.ceil(pilgrimageTimer)}s remaining
        </div>
      )}

      {/* Vibe check warning */}
      {vibeCheckTimer < 30 && (
        <div
          className="mt-1.5 text-xs text-center"
          style={{ color: 'var(--temple-accent)' }}
        >
          ✨ Vibe check incoming...
        </div>
      )}

      {/* Hedonic Treadmill Graph */}
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--temple-border)' }}>
        <HedoTreadmillGraph />
      </div>
    </div>
  );
}
