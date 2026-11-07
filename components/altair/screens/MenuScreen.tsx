/**
 * MenuScreen — Main title screen for Altair.
 * Shows play, meta shop, settings, and leaderboard options.
 */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, ShoppingBag, Settings, Trophy, Zap, Users, Clock, Crosshair, Sparkles, Coins, RefreshCw, X, ScrollText, Book } from 'lucide-react';
import PatchnotesModal from './PatchnotesModal';
import { CodexBadge } from '../CodexPanel';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { useKeyboardNav } from '@/lib/altair/hooks/use-keyboard-nav';

interface MenuScreenProps {
  onPlay: () => void;
  onMultiplayer: () => void;
  onMetaShop: () => void;
  onSettings: () => void;
  onBestiary: () => void;
}

export default function MenuScreen({ onPlay, onMultiplayer, onMetaShop, onSettings, onBestiary }: MenuScreenProps) {
  const { t } = useTranslation("c-altair");
  const coins = useAltairMetaStore((s) => s.coins);
  const doubleTimeUnlocked = useAltairMetaStore((s) => s.doubleTimeUnlocked);
  const totalRuns = useAltairMetaStore((s) => s.totalRunsPlayed);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showPatchnotes, setShowPatchnotes] = useState(false);

  const handleToggleLeaderboard = useCallback(() => {
    setShowLeaderboard((prev) => !prev);
  }, []);

  const handleOpenPatchnotes = useCallback(() => {
    setShowPatchnotes(true);
  }, []);

  const handleCloseLeaderboard = useCallback(() => {
    setShowLeaderboard(false);
  }, []);

  const handleClosePatchnotes = useCallback(() => {
    setShowPatchnotes(false);
  }, []);

  const menuActions = useMemo(
    () => [onPlay, onMultiplayer, onMetaShop, onSettings, handleToggleLeaderboard, onBestiary, handleOpenPatchnotes],
    [onPlay, onMultiplayer, onMetaShop, onSettings, handleToggleLeaderboard, onBestiary, handleOpenPatchnotes],
  );
  const { focusedIndex } = useKeyboardNav({
    itemCount: 7,
    onSelect: (i) => menuActions[i](),
    orientation: 'vertical',
    enabled: !showLeaderboard && !showPatchnotes,
  });

  // Keyboard focus is a data attribute the theme styles (altair.css `.altair-btn`),
  // not a per-button ring + scale, so every control lights the same way.
  const focused = (i: number) => (focusedIndex === i ? 'true' : undefined);

  return (
    <div className="altair-scan flex flex-col items-center justify-center flex-1 px-4 py-8">
      {/* Backdrop: the corridor at the end of Outpost 13 */}
      <div className="altair-corridor" aria-hidden="true">
        <div className="altair-corridor__frames">
          <span className="altair-corridor__frame" />
          <span className="altair-corridor__frame" />
          <span className="altair-corridor__frame" />
          <span className="altair-corridor__frame" />
          <span className="altair-corridor__frame" />
          <span className="altair-corridor__frame" />
        </div>
        <span className="altair-corridor__lamp altair-corridor__lamp--l" />
        <span className="altair-corridor__lamp altair-corridor__lamp--r" />
      </div>

      {/* Title */}
      <div className="text-center mb-12">
        <p className="altair-label mb-4">
          {t("outpost-13", { defaultValue: "Outpost 13 · Extraction thriller" })}
        </p>
        <h1 className="text-5xl sm:text-7xl md:text-8xl tracking-[0.12em] mb-3 pl-[0.12em]">
          <span className="altair-glitch" data-text="ALTAIR">
            ALTAIR
          </span>
        </h1>
        <p className="altair-label">
          {t("signal-lost", { defaultValue: "Fragmented memory · Echo detected" })}
        </p>
        {doubleTimeUnlocked && (
          <div className="mt-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-(--altair-radius) bg-(--altair-warning-dim) text-(--altair-warning) text-xs font-bold">
            <Zap size={12} />
            {t("double-time-unlocked", { defaultValue: "Double Time Unlocked" })}
          </div>
        )}
      </div>

      {/* Menu buttons */}
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          onClick={onPlay}
          data-focused={focused(0)}
          className="altair-btn py-4 text-base"
        >
          <Play size={18} />
          {t("play", { defaultValue: "PLAY" })}
        </button>

        <button
          onClick={onMultiplayer}
          data-focused={focused(1)}
          className="altair-btn py-3"
        >
          <Users size={16} />
          {t("multiplayer", { defaultValue: "MULTIPLAYER" })}
        </button>

        <button
          onClick={onMetaShop}
          data-focused={focused(2)}
          className="altair-btn altair-btn--ghost px-4 py-3"
        >
          <ShoppingBag size={16} />
          {t("meta-shop", { defaultValue: "Meta Shop" })}
          <span className="ml-auto text-sm text-(--altair-amber) font-mono">{t("coins-count", { defaultValue: "{{coins}} coins", coins })}</span>
        </button>

        <button
          onClick={onSettings}
          data-focused={focused(3)}
          className="altair-btn altair-btn--ghost py-3"
        >
          <Settings size={16} />
          {t("settings", { defaultValue: "Settings" })}
        </button>

        <button
          onClick={handleToggleLeaderboard}
          data-focused={focused(4)}
          className="altair-btn altair-btn--ghost py-3"
        >
          <Trophy size={16} />
          {t("leaderboard", { defaultValue: "Leaderboard" })}
        </button>

        <button
          onClick={onBestiary}
          data-focused={focused(5)}
          className="altair-btn altair-btn--ghost py-3"
        >
          <Book size={16} />
          {t("bestiary", { defaultValue: "Bestiary" })}
          <CodexBadge />
        </button>

        <button
          onClick={handleOpenPatchnotes}
          data-focused={focused(6)}
          className="altair-btn altair-btn--ghost py-3"
        >
          <ScrollText size={16} />
          {t("patch-notes", { defaultValue: "Patch Notes" })}
        </button>
      </div>

      {/* Stats footer */}
      <div className="mt-8 text-center altair-label">
        <p>{t("runs-played", { defaultValue: "Runs played: {{totalRuns}}", totalRuns })}</p>
      </div>

      {/* Leaderboard panel */}
      {showLeaderboard && (
        <LeaderboardModal onClose={handleCloseLeaderboard} />
      )}

      {/* Patch notes panel */}
      {showPatchnotes && (
        <PatchnotesModal onClose={handleClosePatchnotes} />
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
  const { t } = useTranslation("c-altair");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--altair-hud-scrim)/60 altair-overlay" onClick={onClose}>
      <div
        className="altair-scan-surface bg-(--altair-surface) border border-(--altair-border) rounded-(--altair-radius-lg) w-full max-w-lg mx-4 altair-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-xl font-bold text-(--altair-text) flex items-center gap-2">
            <Trophy size={20} className="text-(--altair-warning)" />
            {t("leaderboard", { defaultValue: "Leaderboard" })}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchLeaderboard(category)}
              className="p-1.5 pointer-coarse:p-3.5 rounded-(--altair-radius-sm) text-(--altair-text-dim) hover:text-(--altair-text) hover:bg-(--altair-surface-hover) transition-colors"
              aria-label={t("refresh", { defaultValue: "Refresh" })}
              title={t("refresh", { defaultValue: "Refresh" })}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              aria-label={t("close", { defaultValue: "Close" })}
              className="p-1.5 pointer-coarse:p-3.5 rounded-(--altair-radius-sm) text-(--altair-text-dim) hover:text-(--altair-text) hover:bg-(--altair-surface-hover) transition-colors"
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
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-(--altair-radius) text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-(--altair-accent) text-(--altair-accent-fg)'
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
              {t("no-entries-yet", { defaultValue: "No entries yet. Play a game to get on the board!" })}
            </p>
          )}

          {!error && !loading && entries.length > 0 && (
            <div className="space-y-1.5">
              {entries.map((entry, i) => (
                <div
                  key={`${entry.username}-${i}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-(--altair-radius) bg-(--altair-bg) border border-(--altair-border)/50"
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
                  <span className="text-xs text-(--altair-text-dim) w-10 text-right">
                    {entry.gamesPlayed} {t("run-label", { defaultValue: "run", defaultValue_other: "runs", count: entry.gamesPlayed })}
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
