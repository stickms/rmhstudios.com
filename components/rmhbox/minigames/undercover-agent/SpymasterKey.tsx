/**
 * SpymasterKey — Mini key-card sidebar for spymasters.
 *
 * Shows a compact 5×5 color-coded grid matching the full key card.
 * Displays agent counts: "Red: X/9 found" and "Blue: X/8 found".
 * Only rendered for spymaster players (conditionally in parent).
 *
 * Props:
 *   grid: GridTileClient[] — 25 tiles with types visible
 *   teams: { red: TeamInfo; blue: TeamInfo } — Team state with agent counts
 */
'use client';

import type { GridTileClient, TeamInfo } from './UndercoverAgentGame';

// ─── Color mapping for mini key card ─────────────────────────────

const KEY_COLORS: Record<string, string> = {
  RED_AGENT: 'bg-red-500',
  BLUE_AGENT: 'bg-blue-500',
  BYSTANDER: 'bg-amber-300/50',
  ASSASSIN: 'bg-gray-800',
};

interface SpymasterKeyProps {
  grid: GridTileClient[];
  teams: { red: TeamInfo; blue: TeamInfo };
}

export default function SpymasterKey({ grid, teams }: SpymasterKeyProps) {
  return (
    <div className="rounded-xl border border-[var(--rmhbox-border)] bg-[var(--rmhbox-surface)] p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--rmhbox-text-muted)]">
        Key Card
      </h4>

      {/* Mini 5×5 grid */}
      <div className="grid grid-cols-5 gap-1">
        {grid.map((tile) => {
          const isRevealed = tile.state === 'REVEALED';
          const bgColor = tile.type ? KEY_COLORS[tile.type] ?? 'bg-gray-500' : 'bg-gray-600';
          return (
            <div
              key={tile.position}
              className={`h-4 w-full rounded-sm ${bgColor} ${isRevealed ? 'opacity-40' : 'opacity-100'}`}
              title={`${tile.word} — ${tile.type ?? 'unknown'}`}
            />
          );
        })}
      </div>

      {/* Agent counts */}
      <div className="mt-3 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            Red
          </span>
          <span className="font-mono text-[var(--rmhbox-text-muted)]">
            {teams.red.agentsRevealed}/{teams.red.agentsTotal}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            Blue
          </span>
          <span className="font-mono text-[var(--rmhbox-text-muted)]">
            {teams.blue.agentsRevealed}/{teams.blue.agentsTotal}
          </span>
        </div>
      </div>
    </div>
  );
}
