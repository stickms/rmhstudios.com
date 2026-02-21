'use client';
import { useState } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { computeBlissShards, computeTranscendenceThreshold } from '@/lib/temple-of-joy/engine';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { UPGRADE_MAP } from '@/lib/temple-of-joy/data/upgrades';

export default function TranscendenceModal() {
  const showTranscendenceModal = useTempleStore((s) => s.showTranscendenceModal);
  const setShowTranscendenceModal = useTempleStore((s) => s.setShowTranscendenceModal);
  const transcend = useTempleStore((s) => s.transcend);
  const wheelPurchased = useTempleStore((s) => s.wheelPurchased);
  const numberFormat = useTempleStore((s) => s.numberFormat);
  const theme = useTempleStore((s) => s.theme);
  const blissShards = useTempleStore((s) => s.blissShards);
  const prestigeCount = useTempleStore((s) => s.prestigeCount);
  const state = useTempleStore((s) => s);

  const upgrades = useTempleStore((s) => s.upgrades);
  const emberSelections = useTempleStore((s) => s.emberSelections);
  const setEmberSelections = useTempleStore((s) => s.setEmberSelections);

  const [dissolving, setDissolving] = useState(false);

  if (!showTranscendenceModal) return null;

  const dark = theme === 'dark';
  const shardsEarned = computeBlissShards(state);
  const threshold = computeTranscendenceThreshold(prestigeCount);

  // Determine upgrade retention based on wheel upgrades
  const hasEmber = wheelPurchased.has('emberOfMemory');
  const hasProphet = wheelPurchased.has('prophetsMemory');
  const hasDivine = wheelPurchased.has('divineMemory');

  let retentionNote: string | null = null;
  if (hasDivine) {
    retentionNote = '🌀 Divine Memory — All upgrades retained';
  } else if (hasProphet) {
    retentionNote = "🔮 The Prophet's Memory — 20 most valuable upgrades kept";
  } else if (hasEmber) {
    retentionNote = '🕯️ Ember of Memory — Choose 5 upgrades to keep (see below)';
  }

  // Sorted upgrades for ember selection UI (most expensive first)
  const sortedUpgrades = [...upgrades]
    .map(id => ({ id, cost: UPGRADE_MAP[id]?.cost ?? 0 }))
    .sort((a, b) => b.cost - a.cost)
    .map(u => u.id);

  // How many ember selections are still valid (upgrade must still be owned)
  const validEmberCount = emberSelections.filter(id => upgrades.has(id)).length;

  const handleTranscend = () => {
    setDissolving(true);
    setTimeout(() => {
      transcend();
      setShowTranscendenceModal(false);
      setDissolving(false);
    }, 650);
  };

  const handleCancel = () => {
    setShowTranscendenceModal(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'rgba(0,0,0,0.75)',
        animation: dissolving ? 'templeDissolve 0.65s ease-in forwards' : 'templeAppear 0.3s ease-out both',
      }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border-2 p-6 shadow-2xl"
        style={{
          background: dark ? '#2c1d12' : '#ede7d9',
          borderColor: dark ? '#6b4c2a' : '#c4a97a',
          color: dark ? '#e8d5b0' : '#3d2c1e',
        }}
      >
        {/* Header */}
        <h2
          className="text-2xl font-serif font-bold mb-1 text-center"
          style={{ color: dark ? '#d4a847' : '#8b6914' }}
        >
          🌀 Transcendence
        </h2>
        <p className="text-xs text-center opacity-60 mb-4">
          The eternal cycle continues.
        </p>

        <div
          className="h-px mb-4"
          style={{ background: dark ? '#6b4c2a' : '#c4a97a' }}
        />

        {/* What you earn */}
        <div className="mb-4 text-sm space-y-1">
          <p className="font-semibold mb-2" style={{ color: dark ? '#d4a847' : '#8b6914' }}>
            You will earn:
          </p>
          <p className="text-base font-bold">
            💎 {fmt(shardsEarned, numberFormat)} Bliss Shards
          </p>
          <p className="text-xs opacity-60">
            (Current total after this: {fmt(blissShards + shardsEarned, numberFormat)} shards)
          </p>
        </div>

        {/* What resets */}
        <div
          className="rounded-xl p-3 mb-4 text-sm space-y-1"
          style={{ background: dark ? '#1a120b' : '#f5f0e8' }}
        >
          <p className="font-semibold opacity-70 mb-1">Reset:</p>
          <ul className="space-y-0.5 opacity-80 text-xs">
            <li>  Happiness</li>
            <li>  Run progress</li>
            <li>  Sources</li>
            <li>  Upgrades (most)</li>
          </ul>
          <p className="font-semibold opacity-70 mt-2 mb-1">Kept:</p>
          <ul className="space-y-0.5 opacity-80 text-xs">
            <li>  Lifetime Happiness</li>
            <li>  Bliss Shards</li>
            <li>  Wheel Upgrades</li>
            <li>  Achievements</li>
          </ul>
          {retentionNote && (
            <p
              className="text-xs mt-2 font-medium"
              style={{ color: dark ? '#d4a847' : '#8b6914' }}
            >
              {retentionNote}
            </p>
          )}
        </div>

        {/* Ember of Memory — upgrade selection picker */}
        {hasEmber && !hasProphet && !hasDivine && (
          <div className="mb-4">
            <p
              className="text-xs font-semibold mb-1.5"
              style={{ color: dark ? '#d4a847' : '#8b6914' }}
            >
              🕯️ Choose up to 5 upgrades to keep:
            </p>
            {sortedUpgrades.length === 0 ? (
              <p className="text-xs opacity-50 italic">No upgrades purchased yet.</p>
            ) : (
              <>
                <div
                  className="max-h-32 overflow-y-auto rounded-lg border p-1.5 space-y-0.5"
                  style={{
                    borderColor: dark ? '#6b4c2a' : '#c4a97a',
                    background: dark ? '#1a120b' : '#f5f0e8',
                  }}
                >
                  {sortedUpgrades.map(id => {
                    const def = UPGRADE_MAP[id];
                    if (!def) return null;
                    const isSelected = emberSelections.includes(id);
                    const canSelect = isSelected || validEmberCount < 5;
                    return (
                      <label
                        key={id}
                        className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:opacity-75"
                        style={{ color: dark ? '#e8d5b0' : '#3d2c1e', opacity: canSelect || isSelected ? 1 : 0.4 }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!canSelect && !isSelected}
                          onChange={() => {
                            if (isSelected) {
                              setEmberSelections(emberSelections.filter(s => s !== id));
                            } else if (canSelect) {
                              setEmberSelections([...emberSelections, id]);
                            }
                          }}
                          className="w-3 h-3 shrink-0 accent-amber-500"
                        />
                        <span className="text-xs truncate">{def.name}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] opacity-50 mt-1">
                  {validEmberCount}/5 selected
                </p>
              </>
            )}
          </div>
        )}

        {/* Threshold reminder */}
        <p className="text-xs opacity-50 text-center mb-5">
          Required run happiness: {fmt(threshold, numberFormat)}
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 rounded-xl py-2.5 font-semibold text-sm border transition-opacity hover:opacity-80 active:opacity-60"
            style={{
              borderColor: dark ? '#6b4c2a' : '#c4a97a',
              background: 'transparent',
              color: dark ? '#e8d5b0' : '#3d2c1e',
            }}
          >
            Not Yet
          </button>
          <button
            onClick={handleTranscend}
            className="flex-1 rounded-xl py-2.5 font-bold text-sm transition-opacity hover:opacity-80 active:opacity-60"
            style={{
              background: dark ? '#d4a847' : '#8b6914',
              color: dark ? '#1a120b' : '#f5f0e8',
            }}
          >
            Transcend 🌀
          </button>
        </div>
      </div>
    </div>
  );
}
