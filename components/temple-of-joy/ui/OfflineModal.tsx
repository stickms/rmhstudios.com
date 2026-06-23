'use client';
import { useTranslation } from "react-i18next";
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';

export default function OfflineModal() {
  const showOfflineModal = useTempleStore((s) => s.showOfflineModal);
  const offlineSecondsOnLoad = useTempleStore((s) => s.offlineSecondsOnLoad);
  const offlineHappinessOnLoad = useTempleStore((s) => s.offlineHappinessOnLoad);
  const setShowOfflineModal = useTempleStore((s) => s.setShowOfflineModal);
  const numberFormat = useTempleStore((s) => s.numberFormat);
  const theme = useTempleStore((s) => s.theme);
  const { t } = useTranslation("c-temple-of-joy");

  if (!showOfflineModal || offlineSecondsOnLoad <= 0) return null;

  const dark = theme === 'dark';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border-2 p-6 shadow-2xl text-center"
        style={{
          background: dark ? '#2c1d12' : '#ede7d9',
          borderColor: dark ? '#6b4c2a' : '#c4a97a',
          color: dark ? '#e8d5b0' : '#3d2c1e',
        }}
      >
        {/* Icon */}
        <div className="text-4xl mb-3">🌙</div>

        {/* Title */}
        <h2
          className="text-xl font-serif font-bold mb-1"
          style={{ color: dark ? '#d4a847' : '#8b6914' }}
        >
          {t("welcome-back", { defaultValue: "Welcome Back" })}
        </h2>

        <div
          className="h-px my-3"
          style={{ background: dark ? '#6b4c2a' : '#c4a97a' }}
        />

        {/* Stats */}
        <div className="space-y-3 mb-5 text-sm">
          <p className="opacity-80">
            {t("you-were-away-for", { defaultValue: "You were away for" })}{' '}
            <span className="font-semibold" style={{ color: dark ? '#d4a847' : '#8b6914' }}>
              {formatDuration(offlineSecondsOnLoad)}
            </span>
          </p>
          <div
            className="rounded-xl py-3 px-4"
            style={{ background: dark ? '#1a120b' : '#f5f0e8' }}
          >
            <p className="text-xs opacity-60 mb-0.5">{t("your-temple-earned", { defaultValue: "Your temple earned" })}</p>
            <p className="text-lg font-bold" style={{ color: dark ? '#d4a847' : '#8b6914' }}>
              +{fmt(offlineHappinessOnLoad, numberFormat)}
            </p>
            <p className="text-xs opacity-60">{t("happiness", { defaultValue: "happiness" })}</p>
          </div>
        </div>

        {/* Collect button */}
        <button
          onClick={() => setShowOfflineModal(false)}
          className="w-full rounded-xl py-2.5 font-bold text-sm transition-opacity hover:opacity-80 active:opacity-60"
          style={{
            background: dark ? '#d4a847' : '#8b6914',
            color: dark ? '#1a120b' : '#f5f0e8',
          }}
        >
          {t("collect-and-continue", { defaultValue: "Collect & Continue ✓" })}
        </button>
      </div>
    </div>
  );
}
