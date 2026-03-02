/**
 * MenuScreen — Main title screen for Altair.
 * Shows play, meta shop, settings, and leaderboard options.
 */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Play, ShoppingBag, Settings, Trophy, Zap, Users, Clock, Crosshair, Sparkles, Coins, RefreshCw, X } from 'lucide-react';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { useKeyboardNav } from '@/lib/altair/hooks/use-keyboard-nav';

interface MenuScreenProps {
  onPlay: () => void;
  onMultiplayer: () => void;
  onMetaShop: () => void;
  onSettings: () => void;
}

export default function MenuScreen({ onPlay, onMultiplayer, onMetaShop, onSettings }: MenuScreenProps) {
  const coins = useAltairMetaStore((s) => s.coins);
  const doubleTimeUnlocked = useAltairMetaStore((s) => s.doubleTimeUnlocked);
  const totalRuns = useAltairMetaStore((s) => s.totalRunsPlayed);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const menuActions = useMemo(() => [onPlay, onMultiplayer, onMetaShop, onSettings, () => setShowLeaderboard(true)], [onPlay, onMultiplayer, onMetaShop, onSettings]);
  const { focusedIndex } = useKeyboardNav({
    itemCount: 5,
    onSelect: (i) => menuActions[i](),
    orientation: 'vertical',
    enabled: !showLeaderboard,
  });

  const focusClass = (i: number) =>
    focusedIndex === i ? 'ring-2 ring-(--altair-accent)/50 scale-[1.02]' : '';

  return (
    <div className="altair-parchment flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4 py-8">
      {/* Title */}
      <div className="text-center mb-12">
        <h1
          className="text-7xl md:text-8xl font-black tracking-[0.15em] text-(--altair-accent) mb-3"
          style={{ fontFamily: 'var(--altair-font-display)', textShadow: '0 0 40px rgba(200, 164, 74, 0.3)' }}
        >
          ALTAIR
        </h1>
        <p className="text-(--altair-text-muted) text-sm tracking-widest uppercase"
          style={{ fontFamily: 'var(--altair-font-display)' }}
        >
          Survive the Realm
        </p>
        {doubleTimeUnlocked && (
          <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-(--altair-warning-dim) text-(--altair-warning) text-xs font-bold">
            <Zap size={12} />
            Double Time Unlocked
          </div>
        )}
      </div>

      {/* Menu buttons */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onPlay}
          className={`flex items-center justify-center gap-2 py-4 rounded-lg font-bold text-white text-lg tracking-wider bg-(--altair-accent) hover:bg-(--altair-accent-hover) transition-all shadow-lg ${focusClass(0)}`}
        >
          <Play size={20} />
          PLAY
        </button>

        <button
          onClick={onMultiplayer}
          className={`flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-white tracking-wider bg-(--altair-info) hover:brightness-110 transition-all shadow-md ${focusClass(1)}`}
        >
          <Users size={18} />
          MULTIPLAYER
        </button>

        <button
          onClick={onMetaShop}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold text-(--altair-text) bg-(--altair-surface) border border-(--altair-border) hover:border-(--altair-border-bright) hover:bg-(--altair-surface-hover) transition-all ${focusClass(2)}`}
        >
          <ShoppingBag size={18} />
          Meta Shop
          <span className="ml-auto text-sm text-(--altair-warning) font-bold">{coins} coins</span>
        </button>

        <button
          onClick={onSettings}
          className={`flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-(--altair-text) bg-(--altair-surface) border border-(--altair-border) hover:border-(--altair-border-bright) hover:bg-(--altair-surface-hover) transition-all ${focusClass(3)}`}
        >
          <Settings size={18} />
          Settings
        </button>

        <button
          onClick={() => setShowLeaderboard(!showLeaderboard)}
          className={`flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-(--altair-text) bg-(--altair-surface) border border-(--altair-border) hover:border-(--altair-border-bright) hover:bg-(--altair-surface-hover) transition-all ${focusClass(4)}`}
        >
          <Trophy size={18} />
          Leaderboard
        </button>
      </div>

      {/* Stats footer */}
      <div className="mt-8 text-center text-(--altair-text-dim) text-xs">
        <p>Runs played: {totalRuns}</p>
      </div>

      {/* Leaderboard panel */}
      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
      )}
    </div>
  );
}

// ── Leaderboard Types ──────────────────────────────────────────

interface LeaderboardEntry {
  username: string;
  bestTime: number;
  totalKills: number;
  totalXP: number;
  totalGold: number;
  totalTimeSurvived: number;
  gamesPlayed: number;
}

type LeaderboardCategory = 'gold' | 'xp' | 'survival' | 'kills' | 'time';

const CATEGORIES: { key: LeaderboardCategory; label: string; icon: typeof Trophy }[] = [
  { key: 'gold', label: 'Gold', icon: Coins },
  { key: 'xp', label: 'XP', icon: Sparkles },
  { key: 'survival', label: 'Time', icon: Clock },
  { key: 'kills', label: 'Kills', icon: Crosshair },
  { key: 'time', label: 'Best Run', icon: Trophy },
];

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatValue(entry: LeaderboardEntry, category: LeaderboardCategory): string {
  switch (category) {
    case 'gold': return entry.totalGold.toLocaleString();
    case 'xp': return entry.totalXP.toLocaleString();
    case 'survival': return formatTime(entry.totalTimeSurvived);
    case 'kills': return entry.totalKills.toLocaleString();
    case 'time': return formatTime(entry.bestTime);
  }
}

// ── Leaderboard Modal ──────────────────────────────────────────

function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<LeaderboardCategory>('gold');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async (cat: LeaderboardCategory) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/altair/leaderboard?type=${cat}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setEntries(data);
    } catch {
      setError('Failed to load leaderboard');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard(category);
  }, [category, fetchLeaderboard]);

  const RANK_COLORS = ['var(--altair-warning)', '#c0c0c0', '#cd7f32'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 altair-overlay" onClick={onClose}>
      <div
        className="altair-parchment-surface bg-(--altair-surface) border border-(--altair-border) rounded-2xl w-full max-w-lg mx-4 altair-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-xl font-bold text-(--altair-text) flex items-center gap-2">
            <Trophy size={20} className="text-(--altair-warning)" />
            Leaderboard
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchLeaderboard(category)}
              className="p-1.5 rounded-md text-(--altair-text-dim) hover:text-(--altair-text) hover:bg-(--altair-surface-hover) transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-(--altair-text-dim) hover:text-(--altair-text) hover:bg-(--altair-surface-hover) transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-5 pb-3">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = category === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-(--altair-accent) text-white'
                    : 'bg-(--altair-bg) text-(--altair-text-muted) hover:bg-(--altair-surface-hover)'
                }`}
              >
                <Icon size={13} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Leaderboard list */}
        <div className="px-5 pb-5">
          {error && (
            <p className="text-sm text-(--altair-danger) text-center py-6">{error}</p>
          )}

          {!error && loading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full border-(--altair-accent)" style={{ borderTopColor: 'transparent' }} />
            </div>
          )}

          {!error && !loading && entries.length === 0 && (
            <p className="text-sm text-(--altair-text-muted) text-center py-6">
              No entries yet. Play a game to get on the board!
            </p>
          )}

          {!error && !loading && entries.length > 0 && (
            <div className="space-y-1.5">
              {entries.map((entry, i) => (
                <div
                  key={`${entry.username}-${i}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-(--altair-bg) border border-(--altair-border)/50"
                >
                  {/* Rank */}
                  <span
                    className="w-6 text-center font-black text-sm"
                    style={{ color: i < 3 ? RANK_COLORS[i] : 'var(--altair-text-dim)' }}
                  >
                    {i + 1}
                  </span>

                  {/* Name */}
                  <span className="flex-1 text-sm font-semibold text-(--altair-text) truncate">
                    {entry.username}
                  </span>

                  {/* Value */}
                  <span className="text-sm font-bold text-(--altair-accent) tabular-nums">
                    {formatValue(entry, category)}
                  </span>

                  {/* Games played (subtle) */}
                  <span className="text-[10px] text-(--altair-text-dim) w-10 text-right">
                    {entry.gamesPlayed} run{entry.gamesPlayed !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
