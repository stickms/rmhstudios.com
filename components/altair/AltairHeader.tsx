/**
 * AltairHeader — Shared header across all Altair screens.
 *
 * Adapts its content based on the current context:
 * - Menu: "← Builds" back link, "ALTAIR" title, theme toggle
 * - Game: game timer, "ALTAIR" title, settings gear
 * - Meta shop: "← Back" link, "Meta Shop" title, coin balance
 */
'use client';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Sun, Moon, Settings, Circle } from 'lucide-react';
import { useAltairSettingsStore } from '@/lib/altair/stores/settings-store';
import { useAltairGameStore } from '@/lib/altair/stores/game-store';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { useBackOrFallback } from '@/hooks/useBackOrFallback';

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
  const { t } = useTranslation("c-altair");
  const goBack = useBackOrFallback();
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
    <header className="altair-parchment-surface grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden border-b border-(--altair-border) bg-(--altair-bg) px-3 sm:px-4">
      {/* Left side */}
      <div className="flex min-w-0 items-center gap-2">
        {hasBack && (
          isMenu && !onBack ? (
            <Link
              to="/games"
              onClick={goBack}
              className="text-sm font-medium text-(--altair-text-muted) hover:text-(--altair-accent) transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <ArrowLeft size={16} className="shrink-0 rtl-flip" aria-hidden />
                <span className="hidden xs:inline">{t("builds", { defaultValue: "Builds" })}</span>
                <span className="sr-only xs:hidden">{t("builds", { defaultValue: "Builds" })}</span>
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleBack}
              data-altair-sfx="menu_back"
              className="text-sm font-medium text-(--altair-text-muted) hover:text-(--altair-accent) transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <ArrowLeft size={16} className="shrink-0 rtl-flip" aria-hidden />
                <span className="hidden xs:inline">{t("back", { defaultValue: "Back" })}</span>
                <span className="sr-only xs:hidden">{t("back", { defaultValue: "Back" })}</span>
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

      {/* Centre column — a grid track, so a long title truncates instead of
          running through the back link or the controls. */}
      <h1
        className="min-w-0 truncate px-2 text-center text-xl font-bold leading-tight tracking-wider text-(--altair-accent) sm:text-3xl"
        style={{ fontFamily: 'var(--altair-font-display)' }}
      >
        {displayTitle}
      </h1>

      {/* Right side */}
      <div className="flex min-w-0 items-center justify-end gap-2">
        {connectionStatus && (
          <span title={connectionStatus === 'connected' ? t("connected", { defaultValue: "Connected" }) : connectionStatus === 'connecting' ? t("connecting", { defaultValue: "Connecting..." }) : t("disconnected", { defaultValue: "Disconnected" })}>
            <Circle
              className={`h-2.5 w-2.5 ${
                connectionStatus === 'connected' ? 'fill-(--altair-success) text-(--altair-success)' :
                connectionStatus === 'connecting' ? 'fill-(--altair-warning) text-(--altair-warning) animate-pulse' :
                'fill-(--altair-danger) text-(--altair-danger)'
              }`}
            />
          </span>
        )}
        {isShop && (
          <span className="text-sm font-bold text-(--altair-warning)">
            {t("coins-balance", { defaultValue: "{{count}} coins", count: coins })}
          </span>
        )}
        <button
          type="button"
          onClick={toggleTheme}
          data-altair-sfx="menu_toggle"
          aria-label={theme === 'dark' ? t("switch-to-light-mode", { defaultValue: "Switch to light mode" }) : t("switch-to-dark-mode", { defaultValue: "Switch to dark mode" })}
          className="size-9 pointer-coarse:size-11 rounded-full flex items-center justify-center text-(--altair-text-muted) hover:text-(--altair-accent) hover:bg-(--altair-surface-hover) transition-colors"
          title={theme === 'dark' ? t("switch-to-light-mode", { defaultValue: "Switch to light mode" }) : t("switch-to-dark-mode", { defaultValue: "Switch to dark mode" })}
        >
          {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
        </button>
        {isGame && onSettings && (
          <button
            type="button"
            onClick={onSettings}
            aria-label={t("settings", { defaultValue: "Settings" })}
            className="size-9 pointer-coarse:size-11 rounded-full flex items-center justify-center text-(--altair-text-muted) hover:text-(--altair-accent) hover:bg-(--altair-surface-hover) transition-colors"
            title={t("settings", { defaultValue: "Settings" })}
          >
            <Settings size={16} aria-hidden />
          </button>
        )}
      </div>
    </header>
  );
}
