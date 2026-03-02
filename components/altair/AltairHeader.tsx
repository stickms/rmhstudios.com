/**
 * AltairHeader — Shared header across all Altair screens.
 *
 * Adapts its content based on the current context:
 * - Menu: "← Games" back link, "ALTAIR" title, theme toggle
 * - Game: game timer, "ALTAIR" title, settings gear
 * - Meta shop: "← Back" link, "Meta Shop" title, coin balance
 */
'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sun, Moon, Settings, Circle } from 'lucide-react';
import { useAltairSettingsStore } from '@/lib/altair/stores/settings-store';
import { useAltairGameStore } from '@/lib/altair/stores/game-store';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';

interface AltairHeaderProps {
  context?: 'menu' | 'game' | 'meta_shop' | 'class_select' | 'settings';
  title?: string;
  onBack?: () => void;
  onSettings?: () => void;
  connectionStatus?: 'connected' | 'connecting' | 'disconnected' | 'error';
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AltairHeader({
  context = 'menu',
  title,
  onBack,
  onSettings,
  connectionStatus,
}: AltairHeaderProps) {
  const theme = useAltairSettingsStore((s) => s.theme);
  const toggleTheme = useAltairSettingsStore((s) => s.toggleTheme);
  const timeSurvived = useAltairGameStore((s) => s.timeSurvived);
  const coins = useAltairMetaStore((s) => s.coins);

  const isMenu = context === 'menu';
  const isGame = context === 'game';
  const isShop = context === 'meta_shop';
  const hasBack = isMenu || isShop || context === 'class_select' || context === 'settings';

  const displayTitle = title ?? 'ALTAIR';

  const handleBack = useCallback(() => {
    if (onBack) onBack();
  }, [onBack]);

  return (
    <header className="altair-parchment-surface relative flex shrink-0 items-center border-b border-(--altair-border) bg-(--altair-bg)/90 px-3 py-3 h-14 backdrop-blur-sm overflow-hidden">
      {/* Left side */}
      <div className="flex items-center gap-2 z-10">
        {hasBack && (
          isMenu && !onBack ? (
            <Link
              href="/games"
              className="text-sm font-medium text-(--altair-text-muted) hover:text-(--altair-accent) transition-colors"
            >
              <span className="flex items-center gap-1">
                <ArrowLeft size={16} />
                Games
              </span>
            </Link>
          ) : (
            <button
              onClick={handleBack}
              className="text-sm font-medium text-(--altair-text-muted) hover:text-(--altair-accent) transition-colors"
            >
              <span className="flex items-center gap-1">
                <ArrowLeft size={16} />
                Back
              </span>
            </button>
          )
        )}
        {isGame && (
          <span
            className="text-sm font-mono font-bold text-(--altair-text)"
            style={{ fontFamily: 'var(--altair-font-mono)' }}
          >
            {formatTime(timeSurvived)} / 20:00
          </span>
        )}
      </div>

      {/* Center title — absolutely positioned for true centering */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-visible">
        <h1
          className="text-3xl font-bold leading-tight text-(--altair-accent) truncate px-24 tracking-wider"
          style={{ fontFamily: 'var(--altair-font-display)' }}
        >
          {displayTitle}
        </h1>
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2 z-10">
        {connectionStatus && (
          <span title={connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}>
            <Circle
              className={`h-2.5 w-2.5 ${
                connectionStatus === 'connected' ? 'fill-green-500 text-green-500' :
                connectionStatus === 'connecting' ? 'fill-yellow-500 text-yellow-500 animate-pulse' :
                'fill-red-500 text-red-500'
              }`}
            />
          </span>
        )}
        {isShop && (
          <span className="text-sm font-bold text-(--altair-warning)">
            {coins} coins
          </span>
        )}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 rounded-full flex items-center justify-center text-(--altair-text-muted) hover:text-(--altair-accent) hover:bg-(--altair-surface-hover) transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {isGame && onSettings && (
          <button
            onClick={onSettings}
            className="w-8 h-8 rounded-full flex items-center justify-center text-(--altair-text-muted) hover:text-(--altair-accent) hover:bg-(--altair-surface-hover) transition-colors"
            title="Settings"
          >
            <Settings size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
