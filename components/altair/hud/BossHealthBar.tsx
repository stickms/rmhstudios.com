/**
 * BossHealthBar — Displayed at the top of the screen during boss fights.
 */
'use client';

interface BossHealthBarProps {
  bossName: string;
  bossTitle: string;
  hp: number;
  maxHp: number;
  phase: number;
  totalPhases: number;
  color: string;
}

export default function BossHealthBar({
  bossName,
  bossTitle,
  hp,
  maxHp,
  phase,
  totalPhases,
  color,
}: BossHealthBarProps) {
  const hpPercent = Math.max(0, (hp / maxHp) * 100);

  return (
    <div className="absolute top-14 inset-x-0 z-40 pointer-events-none px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <div>
            <span className="text-xs font-mono text-(--altair-text-dim) uppercase tracking-wider">
              {bossTitle}
            </span>
            <h3 className="text-sm font-bold text-white leading-tight">{bossName}</h3>
          </div>
          <span className="text-xs font-mono text-(--altair-text-dim)">
            Phase {phase}/{totalPhases}
          </span>
        </div>
        <div className="h-3 rounded-full bg-black/60 overflow-hidden border border-white/10">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${hpPercent}%`,
              backgroundColor: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
