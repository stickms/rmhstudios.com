'use client';

import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
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

  const setShowTranscendenceModal = useTempleStore(s => s.setShowTranscendenceModal);

  const ritualReady = ritualCooldown <= 0;

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

      <Row
        label="Happiness"
        value={fmt(happiness, numberFormat)}
      />
      <Row
        label="Lifetime"
        value={fmt(lifetimeHappiness, numberFormat)}
        sub="total earned"
      />
      <Row
        label="Per Second"
        value={`${fmt(getHPS(), numberFormat)}/s`}
      />
      <Row
        label="Per Click"
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
        label="Effective Satisfaction"
        value={fmt(getEffectiveSatisfaction(), numberFormat)}
        sub="above baseline"
      />

      <Row
        label="Karma"
        value={`${karma.toFixed(1)} karma`}
      />
      <Row
        label="Bliss Shards"
        value={`${blissShards} 💎`}
      />

      {prestigeCount > 0 && (
        <Row
          label="Prestige"
          value={`×${prestigeCount}`}
        />
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
