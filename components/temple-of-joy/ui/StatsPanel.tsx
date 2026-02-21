'use client';

import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { SOURCES } from '@/lib/temple-of-joy/data/sources';
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
  const runHappiness           = useTempleStore(s => s.runHappiness);
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
  const getGlobalHPSMultiplier = useTempleStore(s => s.getGlobalHPSMultiplier);
  const getCanTranscend        = useTempleStore(s => s.getCanTranscend);
  const getEffectiveSatisfaction = useTempleStore(s => s.getEffectiveSatisfaction);

  const setShowTranscendenceModal = useTempleStore(s => s.setShowTranscendenceModal);

  const state = useTempleStore(s => s);

  // Calculate raw base HPS (baseHPS × owned, before any multipliers)
  const rawBaseHPS = Object.entries(state.sources).reduce((sum, [id, owned]) => {
    if (owned === 0) return sum;
    const def = SOURCES.find(s => s.id === id);
    return sum + (def ? def.baseHPS * owned : 0);
  }, 0);

  const ritualReady = ritualCooldown <= 0;
  const totalHps = getHPS();
  // Effective global multiplier (including temporary buffs)
  const globalMult = totalHps > 0 && rawBaseHPS > 0 ? totalHps / rawBaseHPS : getGlobalHPSMultiplier();

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
            label="This Run"
            value={fmt(runHappiness, numberFormat)}
            sub="for transcendence"
          />
          <Row
            label="All Time"
            value={fmt(lifetimeHappiness, numberFormat)}
            sub="total earned"
          />
        </div>

        {/* Right column */}
        <div>
          <Row
            label="Global Mult"
            value={`×${fmt(globalMult, numberFormat)}`}
          />
          <Row
            label="HPS"
            value={fmt(totalHps, numberFormat)}
            sub={`${fmt(rawBaseHPS, numberFormat)} × ${fmt(globalMult, numberFormat)}`}
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
            value={`${fmt(karma, numberFormat)} karma`}
          />
          <Row
            label="Bliss Shards"
            value={`${blissShards} 💎`}
          />
        </div>
      </div>

      {prestigeCount > 0 && (
        <div
          className="mt-2 pt-2 text-xs"
          style={{ borderTop: '1px solid var(--temple-border)', color: 'var(--temple-text)', opacity: 0.7 }}
        >
          Transcendence: ×{prestigeCount}
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
