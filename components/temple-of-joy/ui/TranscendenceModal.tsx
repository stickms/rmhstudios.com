'use client';
import { useState } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { computeBlissShards, computeTranscendenceThreshold } from '@/lib/temple-of-joy/engine';
import { fmt } from '@/lib/temple-of-joy/numbers';

export default function TranscendenceModal() {
  const showTranscendenceModal = useTempleStore((s) => s.showTranscendenceModal);
  const setShowTranscendenceModal = useTempleStore((s) => s.setShowTranscendenceModal);
  const transcend = useTempleStore((s) => s.transcend);
  const lifetimeHappiness = useTempleStore((s) => s.lifetimeHappiness);
  const wheelPurchased = useTempleStore((s) => s.wheelPurchased);
  const numberFormat = useTempleStore((s) => s.numberFormat);
  const theme = useTempleStore((s) => s.theme);
  const blissShards = useTempleStore((s) => s.blissShards);
  const prestigeCount = useTempleStore((s) => s.prestigeCount);

  const [dissolving, setDissolving] = useState(false);

  if (!showTranscendenceModal) return null;

  const dark = theme === 'dark';
  const shardsEarned = computeBlissShards(lifetimeHappiness, wheelPurchased);
  const threshold = computeTranscendenceThreshold(prestigeCount);

  // Determine upgrade retention based on wheel upgrades
  const hasEmber = wheelPurchased.has('emberOfMemory');
  const hasProphet = wheelPurchased.has('prophetsMemory');
  const hasDivine = wheelPurchased.has('divineMemory');

  let retentionNote: string | null = null;
  if (hasDivine) {
    retentionNote = '🌀 Divine Memory — All upgrades retained';
  } else if (hasProphet) {
    retentionNote = "🔮 The Prophet's Memory — Keep 20 upgrades of your choice";
  } else if (hasEmber) {
    retentionNote = '🕯️ Ember of Memory — Keep 5 upgrades of your choice';
  }

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
            <li>• Happiness</li>
            <li>• Buildings</li>
            <li>• Upgrades (most)</li>
          </ul>
          <p className="font-semibold opacity-70 mt-2 mb-1">Kept:</p>
          <ul className="space-y-0.5 opacity-80 text-xs">
            <li>• Bliss Shards</li>
            <li>• Wheel Upgrades</li>
            <li>• Achievements</li>
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

        {/* Threshold reminder */}
        <p className="text-xs opacity-50 text-center mb-5">
          Required lifetime happiness: {fmt(threshold, numberFormat)}
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
